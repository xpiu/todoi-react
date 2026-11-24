// Who is calling. Better Auth (email + password; sessions in Postgres) answers that per request; the
// `authMiddleware` resolves the session once and stores the viewer on the context. Visitors receive
// an anonymous session; resource permissions also cover direct public reads without a session.
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";

import { EMAIL_LINK_HOURS, RESET_LINK_MINUTES } from "../shared/accountLinks";
import { DEV_USER } from "../shared/devUser";
import { db } from "./db";
import { createHash } from "node:crypto";

import { accounts, apiTokens, lists, sessions, users, verifications } from "./db/schema";
import { DEV, env } from "./env";
import { passwordResetEmail, sendEmail, verifyEmailEmail } from "./email";
import { createGuestWorkspace, transferGuestWorkspace } from "./services/guests";
import { fail } from "./errors";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  // Vite moves to the next port when 5173 is taken; in development any loopback port may call the API.
  trustedOrigins: [env.APP_URL, ...(DEV ? [`http://localhost:${env.PORT}`, "http://localhost:*", "http://127.0.0.1:*"] : [])],
  database: drizzleAdapter(db, { provider: "pg", schema: { user: users, session: sessions, account: accounts, verification: verifications } }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: RESET_LINK_MINUTES * 60,
    // The link opens /reset?token=… (or ?error=INVALID_TOKEN once used or expired); ResetScreen finishes there.
    sendResetPassword: async ({ user, url }) => sendEmail({ to: user.email, ...passwordResetEmail({ email: user.email, url }) }),
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: EMAIL_LINK_HOURS * 3600,
    sendVerificationEmail: async ({ user, url }, request) => {
      if ((user as { isAnonymous?: boolean | null }).isAnonymous) return;
      // Every confirmation link lands on /verify-email, whatever the asking page passed.
      const link = new URL(url);
      link.searchParams.set("callbackURL", `${env.APP_URL}/verify-email`);
      const send = sendEmail({ to: user.email, ...verifyEmailEmail({ email: user.email, url: link.toString() }) });
      // A sign-up never fails over its welcome email: Settings › Notifications can send it again.
      if (request && new URL(request.url).pathname.endsWith("/sign-up/email")) await send.catch((error: unknown) => console.error("The confirmation email after sign-up wasn't sent", error));
      else await send;
    },
  },
  plugins: [anonymous({
    generateName: () => "Guest",
    onLinkAccount: async ({ anonymousUser, newUser }) => {
      if (!newUser.user.isAnonymous && anonymousUser.user.id !== newUser.user.id) {
        await transferGuestWorkspace(anonymousUser.user.id, newUser.user.id);
      }
    },
  })],
  databaseHooks: { user: { create: { after: async (user) => {
    if (user.isAnonymous) await createGuestWorkspace(user.id);
  } } } },
  user: { additionalFields: { nickname: { type: "string", required: false }, avatarColor: { type: "string", required: false } } },
  session: { cookieCache: { enabled: true, maxAge: 60 } },
});

/** The seed's local account (migration 0001 creates it); dev password in README. */
export const LOCAL_USER_ID = "local_user_000000000a";
export const LOCAL_INBOX_ID = "local_inbox_00000000a";
export const DEV_PASSWORD = DEV_USER.password;

export interface Viewer {
  userId: string;
  name: string;
  email: string;
  inboxListId: string;
  isAnonymous: boolean;
}

const VIEWER = "viewer";

/** Each user has one Inbox list (kind inbox); created on first sight. */
export async function inboxFor(userId: string): Promise<string> {
  const [row] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.kind, "inbox"), eq(lists.userId, userId)));
  if (row) return row.id;
  const id = userId === LOCAL_USER_ID ? LOCAL_INBOX_ID : nanoid();
  const [inserted] = await db.insert(lists).values({ id, kind: "inbox", userId, name: "Inbox", position: 0 }).onConflictDoNothing().returning({ id: lists.id });
  if (inserted) return inserted.id;
  // Another request may have created the Inbox while this one was resolving its session.
  const [created] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.kind, "inbox"), eq(lists.userId, userId)));
  return created!.id;
}

/** Resolves the session once per request; workspaceAccess checks resource permissions afterward. */
export const hashToken = (secret: string) => createHash("sha256").update(secret).digest("hex");

const LAST_USED_GRANULARITY = 60_000;

/** `Authorization: Bearer tdi_…` acts as the token's owner. */
async function viewerFromBearer(header: string | undefined): Promise<Viewer | null> {
  const m = /^Bearer\s+(tdi_[A-Za-z0-9_-]+)$/.exec(header ?? "");
  if (!m) return null;
  const [row] = await db.select({ token: apiTokens, user: users }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId)).where(eq(apiTokens.hash, hashToken(m[1]!)));
  const now = new Date();
  if (!row || row.token.revokedAt || row.token.expiresAt < now) return null;
  // "Last used" is informational: refresh it at most once a minute, off the request path.
  if (!row.token.lastUsedAt || now.getTime() - row.token.lastUsedAt.getTime() > LAST_USED_GRANULARITY) {
    void db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id)).catch(() => undefined);
  }
  return { userId: row.user.id, name: row.user.name, email: row.user.email, inboxListId: await inboxFor(row.user.id), isAnonymous: row.user.isAnonymous };
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
    c.set(VIEWER, { userId: u.id, name: u.name, email: u.email, inboxListId: await inboxFor(u.id), isAnonymous: !!u.isAnonymous } satisfies Viewer);
    return next();
  }
  c.set(VIEWER, null);
  if (c.req.method === "GET") return next();
  return fail(c, 401, "Sign in to continue");
};

export function maybeViewer(c: Context): Viewer | null {
  return (c.get(VIEWER) as Viewer | null | undefined) ?? null;
}
export function viewerOf(c: Context): Viewer {
  const v = maybeViewer(c);
  if (!v) throw new HTTPException(401, { message: "Sign in to continue" });
  return v;
}
