// Every API failure leaves as the shared `ErrorBody` (src/shared/errors.ts): routes return `fail(...)`,
// access checks and validators throw, and `onError` turns anything thrown into that shape, mapping
// known database refusals to useful messages. One structured log line per server-side failure carries
// the request id the client shows, and never the request body, query string, or SQL parameters.
import { zValidator } from "@hono/zod-validator";
import type { Context, ErrorHandler, NotFoundHandler, ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodType } from "zod";

import { codeForStatus, type ErrorBody, type ErrorCode } from "../shared/errors";

const requestIdOf = (c: Context): string => (c.get("requestId") as string | undefined) ?? "";

/** The error response for a refusal a route decides on itself (`return fail(c, 404, "Not found")`). */
export function fail<S extends ContentfulStatusCode>(c: Context, status: S, message: string, extra: { code?: ErrorCode; fields?: Record<string, string> } = {}) {
  const body: ErrorBody = { error: message, code: extra.code ?? codeForStatus(status), requestId: requestIdOf(c), ...(extra.fields ? { fields: extra.fields } : {}) };
  return c.json(body, status);
}

/** Thrown where returning is awkward (middleware, services); `onError` sends it as `fail` would. */
export class ApiFailure extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(status, { message });
  }
}

/** `zValidator` whose refusal is the shared shape: the first problem as the message, every field's problem in `fields`. */
export const validate = <Target extends keyof ValidationTargets, T extends ZodType>(target: Target, schema: T) =>
  zValidator(target, schema, (result) => {
    if (result.success) return;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join(".") || target] ??= issue.message;
    throw new ApiFailure(400, result.error.issues[0]?.message ?? "That request isn't valid", fields);
  });

interface DbError {
  code?: string;
  constraint?: string;
}

/** The PostgreSQL error inside a driver/ORM wrapper (Drizzle's message embeds SQL parameters, so it is never used). */
function dbErrorOf(err: unknown): DbError | null {
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as DbError).code;
    if (typeof code === "string" && (/^[0-9A-Z]{5}$/.test(code) || /^E[A-Z]+$/.test(code))) return e as DbError;
  }
  return null;
}

/** Unique constraints whose refusal means something specific to the person. */
const UNIQUE_MESSAGES: Record<string, string> = {
  labels_name_per_project_idx: "A label with that name already exists in this project",
  members_pk_idx: "That person is already a member of this project",
  users_email_unique: "An account with that email already exists",
};

function databaseFailure(db: DbError): { status: ContentfulStatusCode; message: string } | null {
  switch (db.code) {
    case "23505":
      return { status: 409, message: (db.constraint && UNIQUE_MESSAGES[db.constraint]) || "That already exists" };
    case "23503":
      return { status: 409, message: "Something this change refers to no longer exists. Refresh and try again." };
    case "22P02":
    case "22007":
    case "22008":
    case "23502":
    case "23514":
      return { status: 400, message: "One of the values in that change isn't valid" };
    case "40001":
    case "40P01":
    case "55P03":
      return { status: 409, message: "Someone else changed this at the same moment. Try again." };
    case "ECONNREFUSED":
    case "ECONNRESET":
    case "ETIMEDOUT":
    case "57P01":
    case "57P03":
    case "53300":
      return { status: 503, message: "Todoi can't reach its database right now. Try again in a moment." };
    default:
      return null;
  }
}

function log(level: "warn" | "error", c: Context, status: number, err: unknown, db: DbError | null) {
  const e = err instanceof Error ? err : new Error(String(err));
  const viewer = c.get("viewer") as { userId?: string } | null | undefined;
  console[level](
    JSON.stringify({
      level,
      at: new Date().toISOString(),
      requestId: requestIdOf(c),
      method: c.req.method,
      path: c.req.path,
      status,
      user: viewer?.userId,
      error: db ? { name: e.name, db: db.code, constraint: db.constraint } : { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(1, 6).join("\n") },
    }),
  );
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    // Better Auth and other libraries may attach a ready response; keep it.
    if (!(err instanceof ApiFailure) && err.res) return err.res;
    const status = err.status as ContentfulStatusCode;
    if (status >= 500) log("error", c, status, err, null);
    return fail(c, status, err.message || defaultMessage(status), { fields: err instanceof ApiFailure ? err.fields : undefined });
  }
  const db = dbErrorOf(err);
  const known = db && databaseFailure(db);
  if (known) {
    log(known.status >= 500 ? "error" : "warn", c, known.status, err, db);
    return fail(c, known.status, known.message);
  }
  log("error", c, 500, err, db);
  return fail(c, 500, defaultMessage(500));
};

export const notFound: NotFoundHandler = (c) => fail(c, 404, "Not found");

function defaultMessage(status: number): string {
  if (status === 401) return "Sign in to continue";
  if (status === 403) return "You don't have access to this content";
  if (status === 404) return "Not found";
  if (status >= 500) return "Something went wrong on Todoi's side. Try again in a moment.";
  return "That request isn't valid";
}
