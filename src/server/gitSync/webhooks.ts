// Inbound GitHub push webhooks: a push that touches a connected file starts a sync of that project, so
// an edit on GitHub (by a person, an agent or CI) reaches todoi without anyone pressing Sync now.
//
// A connection made with a token has its own webhook with its own secret (sealed at rest); connections
// through the GitHub App share the app's webhook and its GITHUB_APP_WEBHOOK_SECRET. A delivery is trusted
// only when its X-Hub-Signature-256 verifies — in constant time — against one of those for that
// repository; anything else gets a bare 401. The app's webhook also says when an installation is removed,
// suspended or loses repositories: those connections sync at once, so they say what happened. Deliveries are capped in size, repeated delivery ids are
// dropped, todoi's own commits are recognised and skipped, and the sync is a durable job (jobKinds.ts),
// coalesced per connection and retried, that runs after the response (GitHub wants one within 10 s).
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";

import { db } from "../db";
import { gitConnections, gitSyncRuns, type GitConnection } from "../db/schema";
import { env } from "../env";
import { enqueueGitSync } from "../jobKinds";
import { newHookSecret } from "./engine";
import { githubClient } from "./github";
import { open, seal } from "./secrets";

/** GitHub sends at most 25 MB; a push that matters here is a few KB. */
export const MAX_WEBHOOK_BYTES = 1024 * 1024;
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** Where GitHub can reach this app, or null when it can't (a laptop, unless a test GitHub stands in). */
export function webhookUrl(): string | null {
  const app = new URL(env.APP_URL);
  const realGitHub = new URL(env.GITHUB_API_URL).hostname === "api.github.com";
  if (realGitHub && (app.protocol !== "https:" || LOOPBACK.test(app.hostname))) return null;
  return new URL("/api/webhooks/github", env.APP_URL).toString();
}

/** Register the push webhook for a connection; false when GitHub can't reach the app or the token may not. */
export async function registerWebhook(c: GitConnection, token: string): Promise<boolean> {
  const url = webhookUrl();
  if (!url) return false;
  const secret = newHookSecret();
  try {
    const hookId = await githubClient(token).createHook(c.owner, c.repo, url, secret);
    await db.update(gitConnections).set({ hookId, hookSecretCipher: seal(secret) }).where(eq(gitConnections.id, c.id));
    return true;
  } catch (e) {
    // Without "Webhooks: Read and write" on the token, sync still works on demand.
    console.warn(JSON.stringify({ level: "warn", msg: "webhook not registered", connectionId: c.id, error: String(e) }));
    return false;
  }
}

export function signatureValid(secret: string, body: string, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Pushes to app connections sync on their own when the app's webhook secret is set and GitHub can reach this app. */
export const appWebhook = () => !!env.GITHUB_APP_WEBHOOK_SECRET && webhookUrl() !== null;

interface PushPayload {
  ref?: string;
  after?: string;
  installation?: { id?: number };
  repository?: { id?: number; full_name?: string; name?: string; owner?: { login?: string; name?: string } };
  commits?: Array<{ id?: string; added?: string[]; modified?: string[]; removed?: string[] }>;
  head_commit?: { id?: string; added?: string[]; modified?: string[]; removed?: string[] } | null;
}

// Recently seen delivery ids (GitHub redelivers on request; a copy changes nothing but costs a sync).
const seen = new Set<string>();
const remember = (id: string) => {
  seen.add(id);
  if (seen.size > 2000) seen.delete(seen.values().next().value!);
};

export type WebhookOutcome = { status: 202 | 200; synced: string[] } | { status: 401 | 400 | 413 };

/** Handle one delivery. `schedule` queues the sync (a durable job, coalesced per connection); tests pass their own. */
export async function handleWebhook(headers: { event?: string; delivery?: string; signature?: string }, body: string, schedule: (id: string) => Promise<unknown> = (id) => enqueueGitSync(id, "webhook")): Promise<WebhookOutcome> {
  if (Buffer.byteLength(body) > MAX_WEBHOOK_BYTES) return { status: 413 };
  let payload: PushPayload;
  try {
    payload = JSON.parse(body) as PushPayload;
  } catch {
    return { status: 400 };
  }
  // Unverified so far: a body that isn't an object, or ids that aren't whole numbers, never reach a query.
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { status: 400 };
  const wholeId = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);
  const installationId = wholeId(payload.installation?.id), repoId = wholeId(payload.repository?.id);
  const fromApp = !!env.GITHUB_APP_WEBHOOK_SECRET && signatureValid(env.GITHUB_APP_WEBHOOK_SECRET, body, headers.signature);
  const fresh = () => {
    if (!headers.delivery) return true;
    if (seen.has(headers.delivery)) return false;
    remember(headers.delivery);
    return true;
  };
  // The app was removed, suspended or lost repositories: its connections sync now and report it themselves.
  if (fromApp && (headers.event === "installation" || headers.event === "installation_repositories")) {
    if (!installationId || !fresh()) return { status: 200, synced: [] };
    const hit = await db.select({ id: gitConnections.id }).from(gitConnections).where(eq(gitConnections.installationId, installationId));
    for (const c of hit) await schedule(c.id);
    return { status: 202, synced: hit.map((c) => c.id) };
  }
  const fullName = payload.repository?.full_name;
  const [owner, repo] = (typeof fullName === "string" ? fullName : "").split("/");
  if (!owner || !repo) return fromApp ? { status: 200, synced: [] } : { status: 400 };
  // By name, or by id: a repository renamed on GitHub pushes under its new name before todoi has followed it.
  const named = and(sql`lower(${gitConnections.owner}) = ${owner.toLowerCase()}`, sql`lower(${gitConnections.repo}) = ${repo.toLowerCase()}`);
  const candidates = await db.select().from(gitConnections).where(repoId ? or(named, eq(gitConnections.repoId, repoId)) : named);
  const verified = candidates.filter((c) => {
    if (c.installationId) return fromApp;
    const secret = c.hookSecretCipher ? open(c.hookSecretCipher) : null;
    return !!secret && signatureValid(secret, body, headers.signature);
  });
  if (!verified.length) return fromApp ? { status: 200, synced: [] } : { status: 401 };
  if (!fresh() || headers.event !== "push") return { status: 200, synced: [] };
  const branch = payload.ref?.replace(/^refs\/heads\//, "");
  const commits = [...(payload.commits ?? []), ...(payload.head_commit ? [payload.head_commit] : [])];
  const touched = new Set(commits.flatMap((c) => [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]));
  // GitHub lists at most 20 commits in a push; past that, assume the file may have changed.
  const truncated = (payload.commits?.length ?? 0) >= 20;
  const synced: string[] = [];
  for (const c of verified) {
    if (c.branch !== branch || (!truncated && !touched.has(c.path))) continue;
    // todoi's own commit coming back: nothing new in it.
    const [last] = await db.select({ commitSha: gitSyncRuns.commitSha }).from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, c.id)).orderBy(desc(gitSyncRuns.createdAt)).limit(1);
    if (payload.after && last?.commitSha === payload.after) continue;
    synced.push(c.id);
    await schedule(c.id);
  }
  return { status: 202, synced };
}
