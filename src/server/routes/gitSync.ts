// Git sync over HTTP: a project's connection to a file in a GitHub repository (status, check a target,
// connect, settings, sync, undo, disconnect), and the signed-in person's connections for Settings. The
// token goes in once and never comes back out; responses carry its hint only. Access (workspaceAccess):
// members only, edit to sync or undo, admin to connect, change or disconnect.
import { desc, eq, inArray } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { gitCheckSchema, gitConnectSchema, gitSettingsSchema, gitSyncSchema, type GitConnectionView, type GitHubLinkView, type GitHubReturn, type GitRunView } from "../../shared/gitSync";
import type { ProjectDoc } from "../../shared/projectDoc/model";
import { maybeViewer, viewerOf } from "../auth";
import { db } from "../db";
import { gitConnections, gitSyncRuns, projects, type GitConnection, type GitSyncRun } from "../db/schema";
import { fail, idParam, validate } from "../errors";
import { env } from "../env";
import { checkTarget, connectProject, disconnectProject, SyncFailure, syncConnection, undoLastSync, type GitAccess } from "../gitSync/engine";
import { GitHubError } from "../gitSync/github";
import { accountOf, appAccess, authorizeUrl, githubApp, installUrl, linkAccount, linkedLogin, newNonce, pickableRepos, safeNext, sameNonce, unlinkAccount, type RoundTrip } from "../gitSync/githubApp";
import { appWebhook, handleWebhook, MAX_WEBHOOK_BYTES, registerWebhook } from "../gitSync/webhooks";
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
    via: c.installationId ? "app" : "token",
    state: c.state,
    lastError: c.lastError,
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
    conflictPolicy: c.conflictPolicy,
    autoSync: c.autoSync,
    stale: c.autoSync && c.state === "ok" && !!c.lastSyncedAt && Date.now() - c.lastSyncedAt.getTime() > STALE_AFTER_MS,
    webhook: c.installationId ? appWebhook() : c.hookId !== null,
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

/** What a new connection reaches GitHub with: the pasted token, or the app, once the person's own access says they may. */
async function accessFor(userId: string, input: { token?: string; owner: string; repo: string }): Promise<GitAccess> {
  if (input.token) return { token: input.token };
  if (!githubApp()) throw new SyncFailure("token", "Paste a GitHub token to connect");
  const name = `${input.owner}/${input.repo}`;
  try {
    const access = await appAccess(userId, input.owner, input.repo);
    if (access.ok) return access;
    throw new SyncFailure(
      access.why === "unlinked" ? "token" : "access",
      access.why === "unlinked" ? "Your link to GitHub ended. Continue with GitHub again" : access.why === "read-only" ? `You can read ${name} on GitHub but not write to it. Ask its owner for write access` : `todoi's GitHub app can't reach ${name}. Add the repository to the app on GitHub, then try again`,
    );
  } catch (e) {
    if (e instanceof GitHubError) throw new SyncFailure("github", e.reason === "rate-limited" || e.reason === "unavailable" ? "GitHub didn't answer. Try again in a minute" : `GitHub refused (${e.message}). Try again`);
    throw e;
  }
}

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
      const input = c.req.valid("json");
      const { repo, file } = await checkTarget({ ...input, access: await accessFor(viewerOf(c).userId, input) });
      return c.json({ repo: { fullName: repo.fullName, defaultBranch: repo.defaultBranch, private: repo.private }, fileExists: !!file });
    } catch (e) {
      return refuse(c, e);
    }
  })
  .post("/:id/git", idParam, validate("json", gitConnectSchema), async (c) => {
    const { id } = c.req.valid("param");
    await requireConfirmedEmail(viewerOf(c), "connect a repository");
    try {
      const { token, ...input } = c.req.valid("json");
      const { connection } = await connectProject({ ...input, projectId: id, access: await accessFor(viewerOf(c).userId, { token, ...input }) }, viewerOf(c).userId);
      // Pushes to GitHub start a sync when GitHub can reach todoi and the token may add a webhook (the app has its own).
      if (token) await registerWebhook(connection, token);
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
      // A new token replaces how the connection reaches GitHub, the app's installation included.
      .set({ ...patch, ...(token ? { tokenCipher: seal(token), tokenHint: tokenHint(token), installationId: null } : {}) })
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

// The round trip to GitHub rides in one short-lived cookie the page's scripts can't read. `__Host-` (on
// https) keeps a sibling subdomain from planting its own.
const TRIP = new URL(env.APP_URL).protocol === "https:" ? "__Host-td_github" : "td_github";
const tripOptions = { path: "/", httpOnly: true, sameSite: "Lax", secure: TRIP.startsWith("__Host-"), maxAge: 600 } as const;
const leave = (c: Context, trip: RoundTrip, to: (state: string) => string) => {
  setCookie(c, TRIP, JSON.stringify(trip), tripOptions);
  return c.redirect(to(trip.nonce));
};
const readTrip = (c: Context): RoundTrip | null => {
  try {
    const t = JSON.parse(getCookie(c, TRIP) ?? "") as RoundTrip;
    return typeof t.nonce === "string" && typeof t.next === "string" ? t : null;
  } catch {
    return null;
  }
};
/** Back into the app, saying how it went. */
const land = (c: Context, next: string, outcome: GitHubReturn) => {
  deleteCookie(c, TRIP, { path: "/", secure: tripOptions.secure });
  const url = new URL(safeNext(next), env.APP_URL);
  url.searchParams.set("github", outcome);
  return c.redirect(`${url.pathname}${url.search}`);
};

/** Every connection in the signed-in person's projects, for Settings › Storage & sync, and their link to GitHub. */
export const gitConnectionsRoute = new Hono()
  .get("/", async (c) => {
    const mine = await memberProjectIds(viewerOf(c).userId);
    // Whether "Continue with GitHub" exists here and who they are there, known before the dialog opens.
    const github = { app: !!githubApp(), login: githubApp() ? await linkedLogin(viewerOf(c).userId) : null };
    if (!mine.length) return c.json({ connections: [], github });
    const rows = await db.select({ c: gitConnections, name: projects.name }).from(gitConnections).innerJoin(projects, eq(projects.id, gitConnections.projectId)).where(inArray(gitConnections.projectId, mine));
    return c.json({ connections: await Promise.all(rows.map((r) => connectionView(r.c, r.name))), github });
  })
  // The connect dialog's view of GitHub: is there an app, is this person linked, and what can they pick.
  .get("/github", async (c) => {
    const none: GitHubLinkView = { app: !!githubApp(), login: null, repos: [], more: false, manageUrl: null };
    if (!none.app) return c.json(none);
    const userId = viewerOf(c).userId;
    try {
      const [account, picked] = [await accountOf(userId), await pickableRepos(userId)];
      if (!account || !picked) return c.json(none);
      return c.json({ app: true, login: account.login, repos: picked.repos.map((r) => ({ fullName: r.fullName, defaultBranch: r.defaultBranch, private: r.private, canPush: r.canPush })), more: picked.more, manageUrl: installUrl() } satisfies GitHubLinkView);
    } catch (e) {
      if (e instanceof GitHubError) return fail(c, 502, e.reason === "rate-limited" ? "GitHub's rate limit was reached. Try again in a minute" : "GitHub didn't answer. Try again in a minute");
      throw e;
    }
  })
  .delete("/github", async (c) => {
    await unlinkAccount(viewerOf(c).userId);
    return c.body(null, 204);
  })
  // Leave for GitHub: authorize first (one click, or none, when the app is already installed somewhere).
  .get("/github/start", async (c) => {
    const next = safeNext(c.req.query("next"));
    const viewer = maybeViewer(c);
    if (!githubApp()) return c.redirect(next);
    if (!viewer || viewer.isAnonymous) return c.redirect(`/login?next=${encodeURIComponent(next)}`);
    return leave(c, { nonce: newNonce(), next, step: "authorize" }, authorizeUrl);
  })
  // GitHub sends the browser back here after authorizing, installing, or asking an organization's owner to.
  // Nothing in the URL is trusted but the one-time state: what the person may connect is asked of GitHub
  // with their own token, never read from an installation id (anyone can type one).
  .get("/github/callback", async (c) => {
    const viewer = maybeViewer(c);
    const trip = readTrip(c);
    const state = c.req.query("state"), code = c.req.query("code");
    // Started on GitHub's side (an owner approving a request, an install from the app's page): nothing to finish here.
    if (!githubApp() || !viewer || viewer.isAnonymous) return c.redirect("/settings?s=storage");
    if (!trip || !state || !sameNonce(trip.nonce, state)) return trip || state ? land(c, trip?.next ?? "", "expired") : c.redirect("/settings?s=storage");
    if (c.req.query("error")) return land(c, trip.next, "denied");
    try {
      // With a code the link is made (or renewed); without one (a Setup URL return) the link they have answers.
      if (code && !(await linkAccount(viewer.userId, code))) return land(c, trip.next, "failed");
      const picked = await pickableRepos(viewer.userId);
      if (!picked) return land(c, trip.next, "failed");
      if (picked.installations) return land(c, trip.next, "linked");
      if (c.req.query("setup_action") === "request") return land(c, trip.next, "requested");
      // Authorized, but the app is installed nowhere they can reach: on to installing it, once.
      if (trip.step === "authorize") return leave(c, { nonce: newNonce(), next: trip.next, step: "install" }, installUrl);
      return land(c, trip.next, "none");
    } catch (e) {
      if (!(e instanceof GitHubError)) throw e;
      return land(c, trip.next, "failed");
    }
  });

/** POST /api/webhooks/github — GitHub's push deliveries (no session; the signature is the proof). */
export const webhooksRoute = new Hono().post("/github", bodyLimit({ maxSize: MAX_WEBHOOK_BYTES, onError: (c) => c.body(null, 413) }), async (c) => {
  const out = await handleWebhook({ event: c.req.header("x-github-event"), delivery: c.req.header("x-github-delivery"), signature: c.req.header("x-hub-signature-256") }, await c.req.text());
  return "synced" in out ? c.json({ syncing: out.synced.length }, out.status) : c.body(null, out.status);
});
