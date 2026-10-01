// Who is calling. Better Auth (email + password; sessions in Postgres) answers that per request; the
// `authMiddleware` resolves the session once and stores the viewer on the context. Anonymous requests
// may only read public projects. Spec: DESIGN.md › Sign-in, Guest.
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { and, eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";

import { db } from "./db";
import { createHash } from "node:crypto";

import { accounts, apiTokens, lists, projects, sessions, users, verifications } from "./db/schema";
import { env } from "./env";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL, `http://localhost:${env.PORT}`],
  database: drizzleAdapter(db, { provider: "pg", schema: { user: users, session: sessions, account: accounts, verification: verifications } }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  user: { additionalFields: { nickname: { type: "string", required: false }, avatarColor: { type: "string", required: false } } },
  session: { cookieCache: { enabled: true, maxAge: 60 } },
});

/** The seed's local account (migration 0001 creates it); dev password in README. */
export const LOCAL_USER_ID = "local_user_000000000a";
export const LOCAL_INBOX_ID = "local_inbox_00000000a";
export const DEV_PASSWORD = "todoi-dev-password";

export interface Viewer {
  userId: string;
  name: string;
  email: string;
  inboxListId: string;
}

const VIEWER = "viewer";

/** Each user has one Inbox list (kind inbox); created on first sight. */
async function inboxFor(userId: string): Promise<string> {
  const [row] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.kind, "inbox"), eq(lists.userId, userId)));
  if (row) return row.id;
  const id = userId === LOCAL_USER_ID ? LOCAL_INBOX_ID : nanoid();
  await db.insert(lists).values({ id, kind: "inbox", userId, name: "Inbox", position: 0 }).onConflictDoNothing();
  return id;
}

/** Resolves the session once per request. Anonymous callers pass only for public-project reads. */
export const hashToken = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** `Authorization: Bearer tdi_…` acts as the token's owner. */
async function viewerFromBearer(header: string | undefined): Promise<Viewer | null> {
  const m = /^Bearer\s+(tdi_[A-Za-z0-9_-]+)$/.exec(header ?? "");
  if (!m) return null;
  const [row] = await db.select({ token: apiTokens, user: users }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId)).where(eq(apiTokens.hash, hashToken(m[1]!)));
  if (!row || row.token.revokedAt || row.token.expiresAt < new Date()) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.token.id));
  return { userId: row.user.id, name: row.user.name, email: row.user.email, inboxListId: await inboxFor(row.user.id) };
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const bearer = await viewerFromBearer(c.req.header("authorization"));
  if (bearer) {
    c.set(VIEWER, bearer);
    return next();
  }
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    const u = session.user;
    c.set(VIEWER, { userId: u.id, name: u.name, email: u.email, inboxListId: await inboxFor(u.id) } satisfies Viewer);
    return next();
  }
  c.set(VIEWER, null);
  if (c.req.method === "GET" && (await isPublicRead(c))) return next();
  return c.json({ error: "Sign in to continue" }, 401);
};

/** GET /projects/:id, /items?projectId=, /labels?projectId=, /invites/:code, /attachments/:id/file for public projects. */
async function isPublicRead(c: Context): Promise<boolean> {
  const path = c.req.path.replace(/^\/api/, "");
  if (/^\/invites\/[^/]+$/.test(path) || /^\/attachments\/[^/]+\/file$/.test(path)) return true;
  const m = /^\/projects\/([^/]+)$/.exec(path);
  const projectId = m?.[1] ?? c.req.query("projectId");
  if (!projectId || !/^\/(projects\/[^/]+|items|labels)$/.test(path)) return false;
  const [p] = await db.select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, projectId));
  return p?.visibility === "public";
}

export function maybeViewer(c: Context): Viewer | null {
  return (c.get(VIEWER) as Viewer | null | undefined) ?? null;
}
export function viewerOf(c: Context): Viewer {
  const v = maybeViewer(c);
  if (!v) throw new HTTPException(401, { message: "Sign in to continue" });
  return v;
}
