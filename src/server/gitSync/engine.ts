// Git sync: a project kept in one file in a GitHub repository, in sync both ways.
//
// A sync reads the file, builds todoi's document, and three-way merges them against the document of the
// last sync (the connection's `base`). todoi's side is applied in one transaction that first locks the
// project's items and re-checks nothing moved since it was read; the file is written as a commit against
// the blob it was read at, so a concurrent push makes the write "stale" and the whole sync runs again.
// Conflicts follow the connection's policy: "ask" pauses until someone picks a side per conflict, "todoi"
// and "file" decide them. Every sync is a run in git_sync_runs with todoi's document before it applied
// anything, which is what "Undo last sync" restores. One sync per connection at a time, across processes
// (a Postgres advisory lock).
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { CODECS, type FileFormat } from "../../shared/projectDoc/codecs";
import { ProjectFileError } from "../../shared/projectDoc/file";
import { canonicalDoc, countItemChanges, mergeDocs, withIds, type Side } from "../../shared/projectDoc/merge";
import type { ProjectDoc } from "../../shared/projectDoc/model";
import { db } from "../db";
import { gitConnections, gitSyncRuns, items, projects, type GitConflictPolicy, type GitConnection, type GitSyncRun } from "../db/schema";
import { recordError } from "../services/errorTracking";
import { githubClient, GitHubError, type FileRef, type GitHubClient, type RepoInfo } from "./github";
import { forgetInstallationToken, installationToken } from "./githubApp";
import { applyProjectDoc, readProjectDoc } from "./projectDoc";
import { open, seal, tokenHint } from "./secrets";

export type SyncTrigger = GitSyncRun["trigger"];

/** A sync that couldn't run, in words for the person who asked. */
export class SyncFailure extends Error {
  constructor(
    readonly reason: "busy" | "token" | "access" | "missing-file" | "file-exists" | "unreadable" | "github" | "not-found" | "nothing-to-undo",
    message: string,
  ) {
    super(message);
    this.name = "SyncFailure";
  }
}

const refOf = (c: Pick<GitConnection, "owner" | "repo" | "branch" | "path">): FileRef => ({ owner: c.owner, repo: c.repo, branch: c.branch, path: c.path });
const repoName = (c: Pick<GitConnection, "owner" | "repo">) => `${c.owner}/${c.repo}`;

/** How a connection reaches GitHub: through the app's installation (a token minted now) or with its stored token. */
async function clientFor(c: GitConnection): Promise<GitHubClient> {
  if (c.installationId) return githubClient(await installationToken(c.installationId));
  const token = c.tokenCipher ? open(c.tokenCipher) : null;
  if (!token) throw new SyncFailure("token", "todoi can't read the stored GitHub token anymore. Connect the repository again with a new token");
  return githubClient(token);
}

/** A GitHub failure as a sentence that says what to do. */
export function explainGitHub(e: GitHubError, c: Pick<GitConnection, "owner" | "repo" | "branch" | "path"> & { installationId?: number | null }): string {
  // Through the app there is no token to replace: access is given and taken on GitHub.
  if (c.installationId && (e.reason === "unauthorized" || e.reason === "forbidden" || e.reason === "not-found"))
    return `todoi's GitHub app can't reach ${repoName(c)} (${c.branch}) anymore. Give the app access to this repository on GitHub, or disconnect and connect again`;
  switch (e.reason) {
    case "unauthorized":
      return "GitHub didn't accept the token. It may have expired or been revoked; connect again with a new token";
    case "forbidden":
      return `The token can't write to ${repoName(c)}. Give it Contents: Read and write access to this repository`;
    case "rate-limited":
      return `GitHub's rate limit was reached. Sync again in ${e.retryAt ? Math.max(1, Math.ceil((e.retryAt.getTime() - Date.now()) / 60_000)) : 1} minute${e.retryAt && Math.ceil((e.retryAt.getTime() - Date.now()) / 60_000) > 1 ? "s" : ""}`;
    case "not-found":
      return `GitHub can't find ${repoName(c)} or its ${c.branch} branch. Check the name and branch, and that the token includes this repository`;
    case "protected":
      return `The ${c.branch} branch of ${repoName(c)} is protected on GitHub, so todoi can't commit to it. Allow it there, or disconnect and connect another branch`;
    case "too-large":
    case "not-a-file":
      return e.message;
    case "unavailable":
      return "GitHub didn't answer. Try again in a minute";
    default:
      return `GitHub refused the change (${e.message}). Try again; if it keeps failing, disconnect and connect again`;
  }
}

async function withConnectionLock<T>(connectionId: string, run: () => Promise<T>): Promise<T> {
  const client = await db.$client.connect();
  const key = createHash("sha256").update(`git-sync:${connectionId}`).digest().readBigInt64BE();
  try {
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [key.toString()]);
    if (!rows[0]?.ok) throw new SyncFailure("busy", "This project is syncing right now. Try again in a moment");
    try {
      return await run();
    } finally {
      await client.query("select pg_advisory_unlock($1)", [key.toString()]);
    }
  } finally {
    client.release();
  }
}

async function loadConnection(id: string): Promise<GitConnection> {
  const [c] = await db.select().from(gitConnections).where(eq(gitConnections.id, id));
  if (!c) throw new SyncFailure("not-found", "This project isn't connected to a repository anymore");
  return c;
}

/** todoi's document, read in a short transaction (it may record file ids). */
const readOurs = (projectId: string) => db.transaction((tx) => readProjectDoc(tx, projectId));

/** Apply `target` to the project unless todoi changed since `expected` was read; false = it did, merge again. */
async function applyIfUnchanged(projectId: string, expected: ProjectDoc, target: ProjectDoc, actorId: string) {
  return db.transaction(async (tx) => {
    // Hold the project's items still while comparing and applying.
    await tx.select({ id: items.id }).from(items).where(eq(items.projectId, projectId)).for("update");
    const now = await readProjectDoc(tx, projectId);
    if (JSON.stringify(canonicalDoc(now)) !== JSON.stringify(canonicalDoc(expected))) return null;
    return applyProjectDoc(tx, projectId, target, actorId);
  });
}

function commitMessage(projectName: string, changed: number) {
  return `todoi: sync “${projectName}”${changed ? ` (${changed} item${changed === 1 ? "" : "s"})` : ""}`;
}

async function record(c: GitConnection, run: Omit<typeof gitSyncRuns.$inferInsert, "id" | "connectionId">) {
  const [row] = await db.insert(gitSyncRuns).values({ id: nanoid(), connectionId: c.id, ...run }).returning();
  return row!;
}

export interface SyncOptions {
  /** Decisions for conflicts, by conflict key (from a previous run's pending conflicts) */
  choices?: Readonly<Record<string, Side>>;
  /** Decide every open conflict this way, whatever the connection's policy */
  resolveAll?: Side;
}

/** Sync a connection now. Returns the run; throws SyncFailure only when it couldn't start (busy, gone). */
export async function syncConnection(connectionId: string, trigger: SyncTrigger, actorId: string | null, opts: SyncOptions = {}): Promise<GitSyncRun> {
  return withConnectionLock(connectionId, async () => {
    const c = await loadConnection(connectionId);
    const actor = actorId ?? c.createdBy ?? (await projectOwner(c.projectId));
    try {
      try {
        return await syncLocked(c, trigger, actor, opts);
      } catch (e) {
        // A renamed or transferred repository keeps its id: follow it once, then sync as usual.
        const moved = e instanceof GitHubError && e.reason === "not-found" ? await followRename(c) : null;
        if (!moved) throw e;
        return await syncLocked(moved, trigger, actor, opts);
      }
    } catch (e) {
      // A held installation token may be what GitHub refused (the installation changed): the next sync mints a new one.
      if (c.installationId && e instanceof GitHubError && e.reason === "unauthorized") forgetInstallationToken(c.installationId);
      if (e instanceof SyncFailure && e.reason === "busy") throw e;
      const message = e instanceof GitHubError ? explainGitHub(e, c) : e instanceof SyncFailure ? e.message : e instanceof ProjectFileError ? `The file in ${repoName(c)} can't be read: ${e.problems.join("; ")}` : "The sync stopped on an unexpected error. Try again; if it keeps failing, disconnect and connect again";
      if (!(e instanceof GitHubError || e instanceof SyncFailure || e instanceof ProjectFileError)) {
        console.error(JSON.stringify({ level: "error", msg: "git sync failed", connectionId: c.id, error: String(e), stack: (e as Error).stack }));
        void recordError({ source: "git-sync", kind: e instanceof Error ? e.name : "Error", message: e instanceof Error ? e.message : String(e), where: `sync ${trigger}`, userId: actorId, stack: e instanceof Error ? e.stack : null });
      }
      await db.update(gitConnections).set({ state: "error", lastError: message }).where(eq(gitConnections.id, c.id));
      // A scheduled retry that fails the same way adds no new line to the history.
      if (trigger === "auto") {
        const [last] = await db.select().from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, c.id)).orderBy(desc(gitSyncRuns.createdAt)).limit(1);
        if (last?.outcome === "failed" && last.error === message) return last;
      }
      return record(c, { actorId, trigger, outcome: "failed", error: message });
    }
  });
}

/** The connection under the repository's current name, when its id answers to another one; null otherwise. */
async function followRename(c: GitConnection): Promise<GitConnection | null> {
  if (!c.repoId) return null;
  const now = await (await clientFor(c)).repoById(c.repoId).catch(() => null);
  if (!now || (now.owner === c.owner && now.name === c.repo)) return null;
  const [moved] = await db.update(gitConnections).set({ owner: now.owner, repo: now.name }).where(eq(gitConnections.id, c.id)).returning();
  return moved ?? null;
}

async function projectOwner(projectId: string): Promise<string> {
  const [row] = await db.execute<{ user_id: string }>(sql`select user_id from members where project_id = ${projectId} and role = 'owner' limit 1`).then((r) => r.rows);
  if (!row) throw new SyncFailure("not-found", "The project has no owner to sync as. Give the project an owner in Project settings › Members");
  return row.user_id;
}

async function syncLocked(c: GitConnection, trigger: SyncTrigger, actor: string, opts: SyncOptions): Promise<GitSyncRun> {
  const gh = await clientFor(c);
  const codec = CODECS[c.format];
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, c.projectId));
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await gh.readFile(refOf(c));
    if (!remote) {
      // No file: say so only once the repository and branch are known to be there and visible.
      await gh.repo(c.owner, c.repo);
      if (!(await gh.branchExists(c.owner, c.repo, c.branch))) throw new GitHubError("not-found", 404, "branch not found");
    }
    if (!remote) throw new SyncFailure("missing-file", `${c.path} is gone from ${repoName(c)} (${c.branch}). Store a new file there, or disconnect`);
    const ours = await readOurs(c.projectId);
    const base = c.base ?? null;
    // An unchanged blob is the base itself; anything else is parsed (and what the codec had to say is kept on the run).
    const parsed = remote.sha === c.fileSha && base ? null : codec.parse(remote.text);
    // The file's new items get their ids here, so the merge, the counts and the written file all agree on them.
    const theirs = parsed ? withIds(parsed.doc) : base!;
    const notes = parsed?.warnings.length ? parsed.warnings : null;
    const prefer: Side = opts.resolveAll ?? (c.conflictPolicy === "file" ? "theirs" : "ours");
    const merged = mergeDocs(base, ours, theirs, { choices: opts.choices, prefer });
    const undecided = c.conflictPolicy === "ask" && !opts.resolveAll ? merged.open : [];
    if (undecided.length) {
      await db.update(gitConnections).set({ state: "conflict", lastError: null, pending: { theirs, sha: remote.sha, conflicts: merged.conflicts } }).where(eq(gitConnections.id, c.id));
      return record(c, { actorId: actor, trigger, outcome: "conflict", conflicts: undecided.length, notes });
    }
    let pulled = 0;
    // What todoi holds after applying is the result: its own rules (a new item takes its list's Status) are part of it.
    let result = merged.doc;
    if (merged.changed.ours) {
      const applied = await applyIfUnchanged(c.projectId, ours, merged.doc, actor);
      if (!applied) continue;
      result = await readOurs(c.projectId);
      pulled = countItemChanges(ours, result);
    }
    let fileSha = remote.sha, commitSha: string | null = null, pushed = 0;
    const text = codec.serialize(result);
    if (text !== remote.text) {
      pushed = countItemChanges(theirs, result);
      try {
        const out = await gh.writeFile(refOf(c), text, remote.sha, commitMessage(project?.name ?? "project", pushed));
        fileSha = out.sha;
        commitSha = out.commitSha;
      } catch (e) {
        // Someone pushed since the read: start over from the new file (what was applied to todoi stays and merges again).
        if (e instanceof GitHubError && e.reason === "stale") continue;
        throw e;
      }
    }
    await db.update(gitConnections).set({ base: result, fileSha, lastSyncedAt: new Date(), state: "ok", lastError: null, pending: null }).where(eq(gitConnections.id, c.id));
    const outcome = pulled && pushed ? "merged" : pulled ? "pulled" : pushed || commitSha ? "pushed" : "unchanged";
    // A push or scheduled sync that changed nothing (often todoi's own commit echoing back) leaves no line in the history.
    if (outcome === "unchanged" && (trigger === "webhook" || trigger === "auto")) return { id: "", connectionId: c.id, actorId: actor, trigger, outcome, pulled: 0, pushed: 0, conflicts: 0, error: null, notes, before: null, commitSha: null, createdAt: new Date() };
    return record(c, { actorId: actor, trigger, outcome, pulled, pushed, conflicts: merged.conflicts.length, notes, before: pulled ? ours : null, commitSha });
  }
  throw new SyncFailure("busy", "The file and the project kept changing during the sync. Try again in a moment");
}

// ── Connecting ───────────────────────────────────────────────────────────────────────────────────────
/** What a new connection reaches GitHub with: a pasted token, or the app's installation on the repository (githubApp.ts). */
export type GitAccess = { token: string; installationId?: undefined } | { token: string; installationId: number; repo: RepoInfo };

export interface ConnectInput {
  projectId: string;
  access: GitAccess;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  format: FileFormat;
  /** "store": write the project to a new file; "use": the existing file becomes the project's content */
  mode: "store" | "use";
  conflictPolicy?: GitConflictPolicy;
}

/** Check the token, repository, branch and path for a connection, before anything is saved. */
export async function checkTarget(input: Pick<ConnectInput, "access" | "owner" | "repo" | "branch" | "path">) {
  const { access } = input;
  const gh = githubClient(access.token);
  const ref = { owner: input.owner, repo: input.repo, branch: input.branch, path: input.path, installationId: access.installationId };
  try {
    // Through the app, the person's own access was the check (appAccess); a token is asked what it may do.
    const repo = access.installationId ? access.repo : await gh.repo(input.owner, input.repo);
    if (!repo.canPush) throw new SyncFailure("access", `The token can read ${repo.fullName} but not write to it. Give it Contents: Read and write access`);
    if (!(await gh.branchExists(input.owner, input.repo, input.branch))) throw new SyncFailure("access", `${repo.fullName} has no branch named ${input.branch}${input.branch === repo.defaultBranch ? ". An empty repository needs a first commit on GitHub" : ""}`);
    const file = await gh.readFile(ref);
    return { repo, file };
  } catch (e) {
    if (e instanceof GitHubError) throw new SyncFailure(e.reason === "unauthorized" ? "token" : "github", explainGitHub(e, ref));
    throw e;
  }
}

export async function connectProject(input: ConnectInput, actorId: string): Promise<{ connection: GitConnection; run: GitSyncRun }> {
  const { access } = input;
  const { file, repo } = await checkTarget(input);
  const codec = CODECS[input.format];
  if (input.mode === "store" && file) throw new SyncFailure("file-exists", `${input.path} already exists in ${input.owner}/${input.repo}. Use the existing file, or pick another path`);
  if (input.mode === "use" && !file) throw new SyncFailure("missing-file", `There's no ${input.path} in ${input.owner}/${input.repo} (${input.branch}). Store a new file there instead`);
  const parsed = file ? codec.parse(file.text) : null;
  const theirs = parsed ? withIds(parsed.doc) : null;
  const [existing] = await db.select({ id: gitConnections.id }).from(gitConnections).where(eq(gitConnections.projectId, input.projectId));
  if (existing) await disconnectProject(input.projectId);
  const [connection] = await db
    .insert(gitConnections)
    .values({
      id: nanoid(),
      projectId: input.projectId,
      // GitHub's own spelling of the names, and the id that outlives them.
      owner: repo.owner,
      repo: repo.name,
      repoId: repo.id,
      branch: input.branch,
      path: input.path,
      format: input.format,
      ...(access.installationId ? { installationId: access.installationId, tokenCipher: null, tokenHint: "" } : { tokenCipher: seal(access.token), tokenHint: tokenHint(access.token) }),
      createdBy: actorId,
      conflictPolicy: input.conflictPolicy ?? "ask",
    })
    .returning();
  const c = connection!;
  return withConnectionLock(c.id, async () => {
    const gh = githubClient(access.token);
    const ours = await readOurs(input.projectId);
    let before: ProjectDoc | null = null, target = ours, pulled = 0;
    if (input.mode === "use" && theirs) {
      // The file becomes the project; what was there before can come back with Undo.
      const applied = await applyIfUnchanged(input.projectId, ours, { ...theirs, title: ours.title }, actorId);
      if (!applied) throw new SyncFailure("busy", "The project changed while connecting. Try again");
      before = ours;
      pulled = countItemChanges(ours, theirs);
      target = await readOurs(input.projectId);
    }
    const text = codec.serialize(target);
    let fileSha = file?.sha ?? null, commitSha: string | null = null;
    if (!file || text !== file.text) {
      const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, input.projectId));
      const out = await gh.writeFile(refOf(c), text, file?.sha ?? null, file ? `todoi: link “${project?.name}” (ids added)` : `todoi: store “${project?.name}”`);
      fileSha = out.sha;
      commitSha = out.commitSha;
    }
    const [saved] = await db.update(gitConnections).set({ base: target, fileSha, lastSyncedAt: new Date(), state: "ok" }).where(eq(gitConnections.id, c.id)).returning();
    const run = await record(c, { actorId, trigger: "connect", outcome: input.mode === "use" ? "pulled" : "pushed", pulled, notes: parsed?.warnings.length ? parsed.warnings : null, pushed: input.mode === "store" ? countItemChanges({ ...target, lists: [] }, target) : 0, before, commitSha });
    return { connection: saved!, run };
  });
}

/** Stop syncing a project: the file stays in the repository, the project stays in todoi. */
export async function disconnectProject(projectId: string): Promise<boolean> {
  const [c] = await db.select().from(gitConnections).where(eq(gitConnections.projectId, projectId));
  if (!c) return false;
  if (c.hookId) {
    const token = c.tokenCipher ? open(c.tokenCipher) : null;
    if (token) await githubClient(token).deleteHook(c.owner, c.repo, c.hookId).catch(() => undefined);
  }
  await db.delete(gitConnections).where(eq(gitConnections.id, c.id));
  return true;
}

/** Put todoi back as it was before the last sync that changed it, then sync that to the file. */
export async function undoLastSync(connectionId: string, actorId: string): Promise<GitSyncRun> {
  const [last] = await db
    .select()
    .from(gitSyncRuns)
    .where(and(eq(gitSyncRuns.connectionId, connectionId), isNotNull(gitSyncRuns.before)))
    .orderBy(desc(gitSyncRuns.createdAt))
    .limit(1);
  if (!last) throw new SyncFailure("nothing-to-undo", "There's no sync to undo");
  return withConnectionLock(connectionId, async () => {
    const c = await loadConnection(connectionId);
    const ours = await readOurs(c.projectId);
    const applied = await applyIfUnchanged(c.projectId, ours, withIds(last.before!), actorId);
    if (!applied) throw new SyncFailure("busy", "The project changed while undoing. Try again");
    await db.update(gitSyncRuns).set({ before: null }).where(eq(gitSyncRuns.id, last.id));
    // Base stays the merged document, so this sync writes the restored state to the file; the run reads as the undo.
    const run = await syncLocked(await loadConnection(connectionId), "undo", actorId, { resolveAll: "ours" });
    const [undone] = await db.update(gitSyncRuns).set({ outcome: "undone", pulled: countItemChanges(ours, last.before!), before: null }).where(eq(gitSyncRuns.id, run.id)).returning();
    return undone ?? run;
  });
}

/** A fresh webhook secret (sealed for storage). */
export const newHookSecret = () => randomBytes(24).toString("base64url");

/** Sync history older than `days` goes, except each connection's 20 latest runs. */
export async function pruneSyncRuns(days = 90): Promise<number> {
  const res = await db.execute(sql`
    delete from ${gitSyncRuns} where id in (
      select id from (
        select id, created_at, row_number() over (partition by connection_id order by created_at desc) as n from ${gitSyncRuns}
      ) ranked where n > 20 and created_at < now() - ${days} * interval '1 day'
    )`);
  return res.rowCount ?? 0;
}
