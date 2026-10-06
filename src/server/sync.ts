import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import { authorizeOperationScopes, workspaceAccess } from "./access";
import { viewerOf } from "./auth";
import { db, requestTransaction } from "./db";
import { operationReceipts, type OperationScope } from "./db/schema";
import { ApiFailure, fail } from "./errors";

const WORKSPACE_RESOURCES = new Set(["groups", "projects", "lists", "items", "labels", "comments", "saved-views", "archive", "inbox", "invites", "me", "attachments"]);
const VERSION_TABLES: Record<string, string> = { groups: "groups", projects: "projects", lists: "lists", items: "items", labels: "labels", comments: "comments", "saved-views": "saved_views", attachments: "attachments" };

interface Target { table: string; id: string }
function versionTarget(c: Context, body: Record<string, unknown>): Target | undefined {
  const [resource, id, child] = c.req.path.replace(/^\/api\//, "").split("/");
  if (resource === "archive" && (id === "items" || id === "projects") && child) return { table: id, id: child };
  const table = VERSION_TABLES[resource ?? ""];
  if (!table) return;
  if (id && id !== "import") return { table, id };
  if (typeof body.id === "string") return { table, id: body.id };
}
async function targetVersion(target: Target, lock = false) {
  const result = await db.execute<{ version: number }>(sql`select version from ${sql.identifier(target.table)} where id = ${target.id} ${lock ? sql`for update` : sql``}`);
  return result.rows[0]?.version;
}

// Hono turns thrown route errors into responses within next(); throwing this forces their writes to roll back.
class RefusedMutation extends Error {}

/** Transactional, actor-scoped receipts for queued JSON workspace writes. Authorization runs on every replay. */
export const workspaceMutations: MiddlewareHandler = async (c, next) => {
  const [resource, id, action] = c.req.path.replace(/^\/api\//, "").split("/");
  const contentType = c.req.header("content-type");
  const operationId = c.req.header("X-Todoi-Operation-Id");
  const baseVersion = c.req.header("X-Todoi-Base-Version");
  const eligible = !["GET", "HEAD", "OPTIONS"].includes(c.req.method)
    && WORKSPACE_RESOURCES.has(resource ?? "")
    && !(resource === "me" && id === "tokens")
    && !(resource === "items" && action === "attachments")
    && (!contentType || contentType.includes("application/json"));
  if (!eligible || (!operationId && baseVersion === undefined)) return workspaceAccess(c, next);
  if (operationId !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(operationId)) return fail(c, 400, "This operation id isn't valid");
  if (baseVersion !== undefined && (!/^[1-9]\d*$/.test(baseVersion) || !Number.isSafeInteger(Number(baseVersion)))) return fail(c, 400, "This change's saved version isn't valid");
  const viewer = viewerOf(c);
  const expectedActor = c.req.header("X-Todoi-Owner-Id");
  if (expectedActor !== undefined && expectedActor !== viewer.userId) return fail(c, 401, "Your account changed. Sign in to the account that saved this change.");
  const rawBody = await c.req.text();
  const url = new URL(c.req.url);
  const fingerprint = createHash("sha256").update(JSON.stringify([c.req.method, url.pathname + url.search, rawBody])).digest("hex");
  let body: Record<string, unknown> = {};
  try { body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {}; } catch { /* The existing route validator reports malformed input. */ }
  const target = versionTarget(c, body ?? {});

  try {
    await requestTransaction(async () => {
      if (operationId) {
        // Database lock (including across API processes) makes concurrent copies wait for the committed receipt.
        await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([viewer.userId, operationId])}, 0))`);
        const [receipt] = await db.select().from(operationReceipts).where(and(eq(operationReceipts.actorId, viewer.userId), eq(operationReceipts.operationId, operationId)));
        if (receipt) {
          await authorizeOperationScopes(viewer, receipt.scopes, c.req.method === "DELETE" && resource === "archive" && id === "projects");
          try { await workspaceAccess(c, async () => {}); } catch (error) {
            // A successful hard delete removed the row; retained scopes still check today's project rights.
            if (!(c.req.method === "DELETE" && error instanceof HTTPException && error.status === 404)) throw error;
          }
          if (receipt.fingerprint !== fingerprint) throw new ApiFailure(409, "This operation id was already used for a different change");
          c.res = new Response(receipt.status === 204 ? null : receipt.body, { status: receipt.status, headers: { ...receipt.headers, "X-Todoi-Replayed": "true" } });
          return;
        }
      }
      if (operationId) await db.execute(sql`select set_config('todoi.sync_versions', '{}', true)`);
      await workspaceAccess(c, async () => {});
      const before = target ? await targetVersion(target, true) : undefined;
      if (baseVersion !== undefined) {
        if (!target || before === undefined) throw new ApiFailure(409, "This content no longer exists. Your saved change has been kept.");
        if (before !== Number(baseVersion)) throw new ApiFailure(409, "Someone else changed this content. Your saved change has been kept.");
      }
      await next();
      if (c.error || c.res.status >= 400) throw new RefusedMutation();
      const version = target ? await targetVersion(target) : undefined;
      if (version !== undefined) c.header("X-Todoi-Version", String(version));
      if (operationId) {
        const affected = await db.execute<{ versions: Record<string, { before: number; after: number }> }>(sql`select current_setting('todoi.sync_versions')::jsonb as versions`);
        const versions = affected.rows[0]?.versions ?? {};
        if (c.res.status !== 204 && c.res.headers.get("content-type")?.includes("application/json")) {
          const payload: unknown = await c.res.clone().json();
          if (payload && typeof payload === "object" && !Array.isArray(payload)) {
            c.res = new Response(JSON.stringify({ ...payload, __syncVersions: versions }), { status: c.res.status, headers: c.res.headers });
          } else c.header("X-Todoi-Affected-Versions", JSON.stringify(versions));
        } else c.header("X-Todoi-Affected-Versions", JSON.stringify(versions));
        const headers: Record<string, string> = {};
        for (const name of ["content-type", "X-Todoi-Version", "X-Todoi-Affected-Versions"]) {
          const value = c.res.headers.get(name);
          if (value !== null) headers[name] = value;
        }
        await db.insert(operationReceipts).values({
          actorId: viewer.userId, operationId, fingerprint,
          status: c.res.status, body: await c.res.clone().text(), headers,
          scopes: (c.get("operationScopes") as OperationScope[] | undefined) ?? [],
        });
      }
    });
  } catch (error) {
    if (!(error instanceof RefusedMutation)) throw error;
  }
};
