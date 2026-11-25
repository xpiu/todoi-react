// Inbound GitHub push webhooks: a push that touches a connected file starts a sync of that project, so
// an edit on GitHub (by a person, an agent or CI) reaches Todoi without anyone pressing Sync now.
//
// Each connection has its own webhook with its own secret (sealed at rest). A delivery is trusted only
// when its X-Hub-Signature-256 verifies — in constant time — against a connection for that repository
// and branch; anything else gets a bare 401. Deliveries are capped in size, repeated delivery ids are
// dropped, Todoi's own commits are recognised and skipped, and bursts coalesce into one sync per
// connection. Syncs run after the response (GitHub wants an answer within 10 seconds).
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../db";
import { gitConnections, gitSyncRuns, type GitConnection } from "../db/schema";
import { env } from "../env";
import { newHookSecret, syncConnection, SyncFailure } from "./engine";
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

interface PushPayload {
  ref?: string;
  after?: string;
  repository?: { full_name?: string; name?: string; owner?: { login?: string; name?: string } };
  commits?: Array<{ id?: string; added?: string[]; modified?: string[]; removed?: string[] }>;
  head_commit?: { id?: string; added?: string[]; modified?: string[]; removed?: string[] } | null;
}

// Recently seen delivery ids (GitHub redelivers on request; a copy changes nothing but costs a sync).
const seen = new Set<string>();
const remember = (id: string) => {
  seen.add(id);
  if (seen.size > 2000) seen.delete(seen.values().next().value!);
};

// One sync at a time per connection; a push during a sync asks for one more afterwards.
const running = new Map<string, Promise<void>>();
const again = new Set<string>();
export function scheduleSync(connectionId: string): Promise<void> {
  if (running.has(connectionId)) {
    again.add(connectionId);
    return running.get(connectionId)!;
  }
  const run = (async () => {
    // A busy connection (someone pressed Sync now) is tried again after a breath, a few times at most.
    for (let attempt = 0; attempt < 5; attempt++) {
      again.delete(connectionId);
      try {
        await syncConnection(connectionId, "webhook", null);
      } catch (e) {
        const busy = e instanceof SyncFailure && e.reason === "busy";
        if (busy) {
          again.add(connectionId);
          await new Promise((r) => setTimeout(r, 2000));
        } else if (!(e instanceof SyncFailure)) console.error(JSON.stringify({ level: "error", msg: "webhook sync failed", connectionId, error: String(e) }));
      }
      if (!again.has(connectionId)) break;
    }
  })().finally(() => running.delete(connectionId));
  running.set(connectionId, run);
  return run;
}

export type WebhookOutcome = { status: 202 | 200; synced: string[] } | { status: 401 | 400 | 413 };

/** Handle one delivery. `schedule` is injectable so tests can await the syncs it starts. */
export async function handleWebhook(headers: { event?: string; delivery?: string; signature?: string }, body: string, schedule: (id: string) => Promise<void> = scheduleSync): Promise<WebhookOutcome> {
  if (Buffer.byteLength(body) > MAX_WEBHOOK_BYTES) return { status: 413 };
  let payload: PushPayload;
  try {
    payload = JSON.parse(body) as PushPayload;
  } catch {
    return { status: 400 };
  }
  const [owner, repo] = (payload.repository?.full_name ?? "").split("/");
  if (!owner || !repo) return { status: 400 };
  const candidates = await db
    .select()
    .from(gitConnections)
    .where(and(sql`lower(${gitConnections.owner}) = ${owner.toLowerCase()}`, sql`lower(${gitConnections.repo}) = ${repo.toLowerCase()}`));
  const verified = candidates.filter((c) => {
    const secret = c.hookSecretCipher ? open(c.hookSecretCipher) : null;
    return !!secret && signatureValid(secret, body, headers.signature);
  });
  if (!verified.length) return { status: 401 };
  if (headers.delivery) {
    if (seen.has(headers.delivery)) return { status: 200, synced: [] };
    remember(headers.delivery);
  }
  if (headers.event !== "push") return { status: 200, synced: [] };
  const branch = payload.ref?.replace(/^refs\/heads\//, "");
  const commits = [...(payload.commits ?? []), ...(payload.head_commit ? [payload.head_commit] : [])];
  const touched = new Set(commits.flatMap((c) => [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]));
  // GitHub lists at most 20 commits in a push; past that, assume the file may have changed.
  const truncated = (payload.commits?.length ?? 0) >= 20;
  const synced: string[] = [];
  for (const c of verified) {
    if (c.branch !== branch || (!truncated && !touched.has(c.path))) continue;
    // Todoi's own commit coming back: nothing new in it.
    const [last] = await db.select({ commitSha: gitSyncRuns.commitSha }).from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, c.id)).orderBy(desc(gitSyncRuns.createdAt)).limit(1);
    if (payload.after && last?.commitSha === payload.after) continue;
    synced.push(c.id);
    void schedule(c.id);
  }
  return { status: 202, synced };
}
