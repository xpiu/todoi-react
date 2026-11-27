// Error tracking (work plan R8): every server fault, error in the browser, job that gave up and unexpected
// Git sync failure becomes one row per kind of problem in `error_groups`, counting repeats — what the
// operator console lists. Recording goes through the pool directly, never the request's transaction (a
// fault usually rolls that back), and never throws: a broken tracker must not turn one failure into two.
import { createHash } from "node:crypto";

import { and, isNotNull, lt } from "drizzle-orm";

import { isProjectSlug } from "../../shared/projectLinks";
import { db } from "../db";
import { errorGroups, type ErrorGroup } from "../db/schema";

export interface ErrorEvent {
  source: ErrorGroup["source"];
  kind: string;
  message: string;
  where: string;
  requestId?: string | null;
  userId?: string | null;
  stack?: string | null;
}

/** A page's path with what names one project or row taken out, so one problem stays one group: /:project, /p/:id */
export const pagePathGroup = (path: string) =>
  path
    .split("?")[0]!
    .replace(/\b[A-Za-z0-9_-]{21}\b/g, ":id")
    .replace(/^\/([^/]+)/, (root, segment: string) => (isProjectSlug(segment) ? "/:project" : root));

/** The same problem with different ids or numbers in its message is still one problem. */
export const normalizeMessage = (m: string) =>
  m
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/\b[A-Za-z0-9_-]{21}\b/g, ":id")
    .replace(/\d+/g, "#")
    .slice(0, 300);

export const fingerprintOf = (e: Pick<ErrorEvent, "source" | "kind" | "message" | "where">) => createHash("sha256").update([e.source, e.kind, normalizeMessage(e.message), e.where].join("\n")).digest("hex").slice(0, 32);

export async function recordError(e: ErrorEvent): Promise<void> {
  try {
    const stack = e.stack ? e.stack.split("\n").slice(0, 12).join("\n").slice(0, 2000) : null;
    await db.$client.query(
      `insert into error_groups (fingerprint, source, kind, message, "where", last_request_id, last_user_id, sample)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (fingerprint) do update set
         count = error_groups.count + 1, last_seen = now(), message = excluded.message,
         last_request_id = excluded.last_request_id, last_user_id = excluded.last_user_id,
         sample = coalesce(excluded.sample, error_groups.sample), resolved_at = null`,
      [fingerprintOf(e), e.source, e.kind.slice(0, 80), e.message.slice(0, 500), e.where.slice(0, 200), e.requestId ?? null, e.userId ?? null, stack],
    );
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "error tracking failed", error: String(err) }));
  }
}

/** Resolved problems that haven't come back in 30 days are forgotten (with the Trash purge). */
export async function pruneErrorGroups(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db.delete(errorGroups).where(and(isNotNull(errorGroups.resolvedAt), lt(errorGroups.lastSeen, cutoff)));
}
