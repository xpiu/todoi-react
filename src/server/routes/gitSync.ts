// Git sync over HTTP: a project's connection to a file in a GitHub repository (status, check a target,
// connect, settings, sync, undo, disconnect), and the signed-in person's connections for Settings. The
// token goes in once and never comes back out; responses carry its hint only. Access (workspaceAccess):
// members only, edit to sync or undo, admin to connect, change or disconnect.
import { desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { gitCheckSchema, gitConnectSchema, gitSettingsSchema, gitSyncSchema, type GitConnectionView, type GitRunView } from "../../shared/gitSync";
import type { ProjectDoc } from "../../shared/projectDoc/model";
import { viewerOf } from "../auth";
import { db } from "../db";
import { gitConnections, gitSyncRuns, projects, type GitConnection, type GitSyncRun } from "../db/schema";
import { fail, idParam, validate } from "../errors";
import { checkTarget, connectProject, disconnectProject, SyncFailure, syncConnection, undoLastSync } from "../gitSync/engine";
import { handleWebhook, MAX_WEBHOOK_BYTES, registerWebhook } from "../gitSync/webhooks";
import { STALE_AFTER_MS } from "../jobKinds";
import { seal, tokenHint } from "../gitSync/secrets";
import { requireConfirmedEmail } from "../services/confirmedEmail";
import { memberProjectIds } from "../services/projects";

const runView = (r: GitSyncRun): GitRunView => ({ id: r.id, trigger: r.trigger, outcome: r.outcome, pulled: r.pulled, pushed: r.pushed, conflicts: r.conflicts, error: r.error, notes: r.notes ?? [], undoable: !!r.before, commitSha: r.commitSha, at: r.createdAt.toISOString() });

/** "list:<id>" and "item:<id>" → names, from the documents a conflict came from (the file's first). */
function placeNames(docs: Array<ProjectDoc | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of docs) for (const l of d?.lists ?? []) {
    out[`list:${l.id}`] ??= l.name;
    for (const it of l.items) out[`item:${it.id}`] ??= it.title;
  }
  return out;
}

async function connectionView(c: GitConnection, projectName: string): Promise<GitConnectionView> {
  const runs = await db.select().from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, c.id)).orderBy(desc(gitSyncRuns.createdAt)).limit(10);
  return {
    id: c.id,
    projectId: c.projectId,
    projectName,
    provider: c.provider,
    owner: c.owner,
    repo: c.repo,
    branch: c.branch,
    path: c.path,
    format: c.format,
    tokenHint: c.tokenHint,
    state: c.state,
    lastError: c.lastError,
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
    conflictPolicy: c.conflictPolicy,
    autoSync: c.autoSync,
    stale: c.autoSync && c.state === "ok" && !!c.lastSyncedAt && Date.now() - c.lastSyncedAt.getTime() > STALE_AFTER_MS,
    webhook: c.hookId !== null,
    conflicts: c.state === "conflict" ? (c.pending?.conflicts ?? []) : [],
    places: c.state === "conflict" ? placeNames([c.pending?.theirs, c.base]) : {},
    runs: runs.map(runView),
  };
}

/** A refused sync request in the API's error shape: busy is a 409, the rest are 422 with the reason. */
const refuse = (c: Parameters<typeof fail>[0], e: unknown) => {
  if (e instanceof SyncFailure) return fail(c, e.reason === "busy" ? 409 : e.reason === "not-found" ? 404 : 422, e.message);
  throw e;
};

const projectName = async (id: string) => (await db.select({ name: projects.name }).from(projects).where(eq(projects.id, id)))[0]?.name ?? "";
const connectionOf = async (projectId: string) => (await db.select().from(gitConnections).where(eq(gitConnections.projectId, projectId)))[0];

export const gitSyncRoute = new Hono()
  .get("/:id/git", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const conn = await connectionOf(id);
    return c.json({ connection: conn ? await connectionView(conn, await projectName(id)) : null });
  })
  // Check a token and target before connecting: the repository, whether it can be written, and whether the file is there.
  .post("/:id/git/check", idParam, validate("json", gitCheckSchema), async (c) => {
    // Connecting acts on the person's behalf in a repository: their address must be theirs (R4).
    await requireConfirmedEmail(viewerOf(c), "connect a repository");
    try {
      const { repo, file } = await checkTarget(c.req.valid("json"));
      return c.json({ repo: { fullName: repo.fullName, defaultBranch: repo.defaultBranch, private: repo.private }, fileExists: !!file });
    } catch (e) {
      return refuse(c, e);
    }
  })
  .post("/:id/git", idParam, validate("json", gitConnectSchema), async (c) => {
    const { id } = c.req.valid("param");
    await requireConfirmedEmail(viewerOf(c), "connect a repository");
    try {
      const input = c.req.valid("json");
      const { connection } = await connectProject({ ...input, projectId: id }, viewerOf(c).userId);
      // Pushes to GitHub start a sync when GitHub can reach todoi and the token may add a webhook.
      await registerWebhook(connection, input.token);
      return c.json({ connection: await connectionView((await connectionOf(id))!, await projectName(id)) }, 201);
    } catch (e) {
      return refuse(c, e);
    }
  })
  .patch("/:id/git", idParam, validate("json", gitSettingsSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { token, ...patch } = c.req.valid("json");
    let [row] = await db
      .update(gitConnections)
      .set({ ...patch, ...(token ? { tokenCipher: seal(token), tokenHint: tokenHint(token) } : {}) })
      .where(eq(gitConnections.projectId, id))
      .returning();
    // A new token may be allowed what the old one wasn't: try the webhook again.
    if (row && token && !row.hookId && (await registerWebhook(row, token))) row = await connectionOf(id);
    return row ? c.json({ connection: await connectionView(row, await projectName(id)) }) : fail(c, 404, "This project isn't connected to a repository");
  })
  .post("/:id/git/sync", idParam, validate("json", gitSyncSchema), async (c) => {
    const { id } = c.req.valid("param");
    const conn = await connectionOf(id);
    if (!conn) return fail(c, 404, "This project isn't connected to a repository");
    const { choices, resolveAll } = c.req.valid("json");
    try {
      const run = await syncConnection(conn.id, choices || resolveAll ? "resolve" : "manual", viewerOf(c).userId, { choices, resolveAll });
      return c.json({ run: runView(run), connection: await connectionView((await connectionOf(id))!, await projectName(id)) });
    } catch (e) {
      return refuse(c, e);
    }
  })
  .post("/:id/git/undo", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const conn = await connectionOf(id);
    if (!conn) return fail(c, 404, "This project isn't connected to a repository");
    try {
      const run = await undoLastSync(conn.id, viewerOf(c).userId);
      return c.json({ run: runView(run), connection: await connectionView((await connectionOf(id))!, await projectName(id)) });
    } catch (e) {
      return refuse(c, e);
    }
  })
  .delete("/:id/git", idParam, async (c) => {
    return (await disconnectProject(c.req.valid("param").id)) ? c.body(null, 204) : fail(c, 404, "This project isn't connected to a repository");
  });

/** Every connection in the signed-in person's projects, for Settings › Storage & sync. */
export const gitConnectionsRoute = new Hono().get("/", async (c) => {
  const mine = await memberProjectIds(viewerOf(c).userId);
  if (!mine.length) return c.json({ connections: [] });
  const rows = await db.select({ c: gitConnections, name: projects.name }).from(gitConnections).innerJoin(projects, eq(projects.id, gitConnections.projectId)).where(inArray(gitConnections.projectId, mine));
  return c.json({ connections: await Promise.all(rows.map((r) => connectionView(r.c, r.name))) });
});

/** POST /api/webhooks/github — GitHub's push deliveries (no session; the signature is the proof). */
export const webhooksRoute = new Hono().post("/github", bodyLimit({ maxSize: MAX_WEBHOOK_BYTES, onError: (c) => c.body(null, 413) }), async (c) => {
  const out = await handleWebhook({ event: c.req.header("x-github-event"), delivery: c.req.header("x-github-delivery"), signature: c.req.header("x-hub-signature-256") }, await c.req.text());
  return "synced" in out ? c.json({ syncing: out.synced.length }, out.status) : c.body(null, out.status);
});
