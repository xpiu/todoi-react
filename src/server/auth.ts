// Who is calling. Better Auth (email + password, or a passkey; GitHub and Google once switched on, see
// socialSignIn.ts; sessions in Postgres) answers that per request; the
// `authMiddleware` resolves the session once and stores the viewer on the context. Visitors receive
// an anonymous session; resource permissions also cover direct public reads without a session.
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { anonymous } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";

import { EMAIL_LINK_HOURS, RESET_LINK_MINUTES } from "../shared/accountLinks";
import type { TokenAccess } from "../shared/apiTokens";
import { DEV_USER } from "../shared/devUser";
import { db } from "./db";
import { createHash } from "node:crypto";

import { accounts, apiTokens, lists, passkeys, sessions, users, verifications } from "./db/schema";
import { DEV, env } from "./env";
import { changeEmailEmail, passwordResetEmail, sendEmail, verifyEmailEmail } from "./email";
import { isDeletedAddress } from "./services/accountDeletion";
import { confirmEmailChangeUrl, emailLinkClaims, refusedChange, settleEmailChange } from "./services/emailChange";
import { createGuestWorkspace, transferGuestWorkspace } from "./services/guests";
import { GUESTS_OFF_MESSAGE, INVITE_ONLY, maySignUp, NOT_INVITED_MESSAGE } from "./services/signUpGate";
import { socialProvidersFor } from "./socialSignIn";
import { confirmSession, sudoUntil } from "./services/sudo";
import { clearAttempts, reserveAttempt, retryIn } from "./services/attempts";
import { createCounter } from "./rateLimit";
import { SUDO_REQUIRED } from "../shared/sudo";
import { fail } from "./errors";
import { V1_PREFIX, viaV1 } from "./apiV1";

/** "Last used today" in Settings › Account › Passkeys: one more field on Better Auth's passkey model, so its list returns it. */
const passkeyLastUsed = {
  id: "passkey-last-used",
  schema: { passkey: { fields: { lastUsedAt: { type: "date", required: false, input: false } } } },
} satisfies BetterAuthPlugin;

/**
 * Better Auth's passkey routes that change how the account logs in: registered accounts only (a guest has no
 * account to log back into), in sudo mode (services/sudo.ts). A registration's verify step needs the
 * challenge these options set, bound to the same session.
 */
const PASSKEY_CHANGES = ["/passkey/generate-register-options", "/passkey/delete-passkey"];

/**
 * Log-ins per account (work plan R3), on top of the per-address limits in rateLimit.ts: at most SIGN_IN_TRIES
 * password log-ins for one email address in the window, counted before the password is checked and cleared by
 * any log-in to the account (password or passkey) or a password reset. No lockout: a passkey and the reset
 * link still work, and the count starts again when the window ends. Unknown addresses count the same way, so
 * the answer doesn't tell whether an account exists.
 */
export const SIGN_IN_TRIES = { max: 10, windowMinutes: 15 };
const signInTries = (email: string) => `sign-in-tries:${email.trim().toLowerCase()}`;
/** Reset and confirmation emails per recipient address and hour, wherever they're asked for from (R3). */
const EMAILS_PER_ADDRESS = 5;
const authEmails = createCounter({ limit: EMAILS_PER_ADDRESS, windowMs: 3600_000 });
const EMAIL_SENDERS = ["/request-password-reset", "/send-verification-email"];
const tooMany = (message: string, seconds: number) => new APIError("TOO_MANY_REQUESTS", { message }, { "Retry-After": String(seconds) });

/** /verify-email, keeping the asking page's `next` when it is a path in this app ("/i/abc", not "//evil.test"). */
export function verifyLanding(asked: string | null): string {
  const landing = new URL("/verify-email", env.APP_URL);
  let next: string | null = null;
  try { next = asked ? new URL(asked, env.APP_URL).searchParams.get("next") : null; } catch { next = null; }
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) landing.searchParams.set("next", next);
  return landing.toString();
}

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  // Throttling is rateLimit.ts's (one rule for the client address, trusted proxies included) and the per-account
  // counts in the hooks below; Better Auth's own limiter would read X-Forwarded-For as sent, so it stays off.
  rateLimit: { enabled: false },
  // Vite moves to the next port when 5173 is taken; in development any loopback port may call the API.
  trustedOrigins: [env.APP_URL, ...(DEV ? [`http://localhost:${env.PORT}`, "http://localhost:*", "http://127.0.0.1:*"] : [])],
  database: drizzleAdapter(db, { provider: "pg", schema: { user: users, session: sessions, account: accounts, verification: verifications, passkey: passkeys } }),
  // GitHub and Google (work plan R9): none registered for now, see socialSignIn.ts.
  socialProviders: socialProvidersFor(env),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: RESET_LINK_MINUTES * 60,
    // The link opens /reset?token=… (or ?error=INVALID_TOKEN once used or expired); ResetScreen finishes there.
    sendResetPassword: async ({ user, url }) => sendEmail({ to: user.email, ...passwordResetEmail({ email: user.email, url }) }),
    // A new password ends the log-in throttle for the account.
    onPasswordReset: async ({ user }) => clearAttempts(signInTries(user.email)),
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: EMAIL_LINK_HOURS * 3600,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      if ((user as { isAnonymous?: boolean | null }).isAnonymous) return;
      // A change of address (services/emailChange.ts): `user.email` is already the new address here.
      const claims = emailLinkClaims(token);
      if (claims?.updateTo && claims.email) return sendEmail({ to: user.email, ...changeEmailEmail({ oldEmail: claims.email, newEmail: user.email, url }) });
      // Every confirmation link lands on /verify-email, whatever the asking page passed; only an in-app
      // `next` (e.g. the invite that asked for the confirmation) rides along for its Continue button.
      const link = new URL(url);
      link.searchParams.set("callbackURL", verifyLanding(link.searchParams.get("callbackURL")));
      const send = sendEmail({ to: user.email, ...verifyEmailEmail({ email: user.email, url: link.toString() }) });
      // A sign-up never fails over its welcome email: Settings › Notifications can send it again.
      if (request && new URL(request.url).pathname.endsWith("/sign-up/email")) await send.catch((error: unknown) => console.error("The confirmation email after sign-up wasn't sent", error));
      else await send;
    },
  },
  plugins: [passkey({
    // The relying party is the app's own address (APP_URL): a passkey made for localhost works on localhost only.
    rpID: new URL(env.APP_URL).hostname,
    rpName: "Todoi",
    origin: new URL(env.APP_URL).origin,
    // Sudo mode (hooks.before) replaces the plugin's own "fresh session" rule (a log-in under a day old).
    // Without it the registration still belongs to the session that asked for the options.
    registration: { requireSession: false },
    authentication: {
      afterVerification: async ({ clientData }) => {
        await db.update(passkeys).set({ lastUsedAt: new Date() }).where(eq(passkeys.credentialID, String(clientData.id)));
      },
    },
  }), passkeyLastUsed, anonymous({
    generateName: () => "Guest",
    onLinkAccount: async ({ anonymousUser, newUser }) => {
      if (!newUser.user.isAnonymous && anonymousUser.user.id !== newUser.user.id) {
        await transferGuestWorkspace(anonymousUser.user.id, newUser.user.id);
      }
    },
  })],
  databaseHooks: { user: {
    create: { after: async (user) => {
      if (user.isAnonymous) await createGuestWorkspace(user.id);
    } },
    // A change-of-address link was opened: clear the pending change and count the new address as confirmed.
    update: { after: async (user) => settleEmailChange(user) },
  } },
  // A change of address needs sudo mode (POST /api/me/email-change checks it, then calls changeEmail on
  // the server), so the endpoint isn't reachable from the browser directly.
  disabledPaths: ["/change-email"],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
      if (env.SIGN_UP === "invite") {
        if (ctx.path === "/sign-in/anonymous") throw new APIError("FORBIDDEN", { message: GUESTS_OFF_MESSAGE, code: INVITE_ONLY });
        if (ctx.path === "/sign-up/email" && !(email && (await maySignUp(email, ctx.body?.callbackURL)))) throw new APIError("FORBIDDEN", { message: NOT_INVITED_MESSAGE, code: INVITE_ONLY });
      }
      if (ctx.path === "/sign-in/email" && email) {
        const reserved = await reserveAttempt(signInTries(email), SIGN_IN_TRIES);
        if ("retryAt" in reserved) {
          const { seconds, words } = retryIn(reserved.retryAt);
          console.warn(JSON.stringify({ level: "warn", at: new Date().toISOString(), event: "sign-in-throttled", path: ctx.path, retryAt: reserved.retryAt.toISOString() }));
          throw tooMany(`Too many log-in attempts for this account. ${words} You can also reset your password or log in with a passkey.`, seconds);
        }
        return;
      }
      if (EMAIL_SENDERS.includes(ctx.path) && email && env.RATE_LIMIT) {
        const hit = authEmails.hit(email.trim().toLowerCase());
        if (!hit.allowed) throw tooMany("We've sent several emails to this address in the last hour. Check your inbox and spam folder, or try again later.", Math.ceil((hit.resetAt - Date.now()) / 1000));
        return;
      }
      if (PASSKEY_CHANGES.includes(ctx.path)) {
        const session = await getSessionFromCtx(ctx);
        if (!session) throw new APIError("UNAUTHORIZED", { message: "Log in to manage your passkeys" });
        if (session.user.isAnonymous) throw new APIError("FORBIDDEN", { message: "Create an account to add a passkey" });
        if (!(await sudoUntil(session.session.id))) throw new APIError("FORBIDDEN", { message: "Confirm it's you to continue", code: SUDO_REQUIRED });
        return;
      }
      if (ctx.path !== "/verify-email") return;
      const claims = emailLinkClaims(typeof ctx.query?.token === "string" ? ctx.query.token : undefined);
      if (!claims?.updateTo) return;
      // A change cancelled or replaced since the link was sent, or an address someone took meanwhile.
      const refusal = await refusedChange(claims);
      if (refusal) throw ctx.redirect(confirmEmailChangeUrl(claims.updateTo, refusal));
    }),
    // A passkey log-in from a browser already signed in to the same account is the passkey way to confirm
    // it's them (sudo mode): it replaces that browser's session, so Devices doesn't list this browser twice,
    // and the new session counts as confirmed. A log-in from the log-in page (no session, a guest's, or an
    // expired one) is only a log-in and confirms nothing.
    after: createAuthMiddleware(async (ctx) => {
      // A log-in that worked, either way, starts the account's count again.
      if ((ctx.path === "/sign-in/email" || ctx.path === "/passkey/verify-authentication") && ctx.context.newSession) await clearAttempts(signInTries(ctx.context.newSession.user.email));
      if (ctx.path !== "/passkey/verify-authentication") return;
      const fresh = ctx.context.newSession;
      const replaced = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
      if (!fresh || !replaced || replaced === fresh.session.token) return;
      const [old] = await db.delete(sessions).where(and(eq(sessions.token, replaced), eq(sessions.userId, fresh.user.id))).returning({ expiresAt: sessions.expiresAt });
      if (old && old.expiresAt > new Date()) await confirmSession(fresh.session);
    }),
  },
  user: {
    additionalFields: { nickname: { type: "string", required: false }, avatarColor: { type: "string", required: false } },
    changeEmail: { enabled: true },
  },
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
  /** Set when an API token signed the request: what that token may reach (shared/apiTokens.ts, access.ts) */
  grant?: TokenGrant;
}

export interface TokenGrant {
  access: TokenAccess;
  /** null = every project the owner is in, and their Inbox */
  projectIds: string[] | null;
}

const VIEWER = "viewer";

/** Each user has one Inbox list (kind inbox); created on first sight. */
export async function inboxFor(userId: string): Promise<string> {
  const [row] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.kind, "inbox"), eq(lists.userId, userId)));
  if (row) return row.id;
  // A deleted account has no Inbox and never gets one back: another device's cached session (Better Auth's
  // 60-second cookie cache) ends here instead of writing into a removed account.
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!owner || isDeletedAddress(owner.email)) throw new HTTPException(401, { message: "Sign in to continue" });
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
async function viewerFromBearer(header: string | undefined): Promise<(Viewer & { tokenId: string; grant: TokenGrant }) | null> {
  const m = /^Bearer\s+(tdi_[A-Za-z0-9_-]+)$/.exec(header ?? "");
  if (!m) return null;
  const [row] = await db.select({ token: apiTokens, user: users }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId)).where(eq(apiTokens.hash, hashToken(m[1]!)));
  const now = new Date();
  if (!row || row.token.revokedAt || row.token.expiresAt < now) return null;
  // "Last used" is informational: refresh it at most once a minute, off the request path.
  if (!row.token.lastUsedAt || now.getTime() - row.token.lastUsedAt.getTime() > LAST_USED_GRANULARITY) {
    void db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id)).catch(() => undefined);
  }
  return { userId: row.user.id, name: row.user.name, email: row.user.email, inboxListId: await inboxFor(row.user.id), isAnonymous: row.user.isAnonymous, grant: { access: row.token.access, projectIds: row.token.projectIds }, tokenId: row.token.id };
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // API tokens work on the versioned API only (apiV1.ts): the unversioned /api is the app's own.
  const authorization = c.req.header("authorization");
  if (/^Bearer\s/i.test(authorization ?? "") && !viaV1(c)) return fail(c, 401, `API tokens work on ${V1_PREFIX}, e.g. ${V1_PREFIX}/groups. See /docs/agents.`);
  const bearer = await viewerFromBearer(authorization);
  if (bearer) {
    const { tokenId, ...viewer } = bearer;
    c.set(VIEWER, viewer);
    // Which token answered (rateLimit.ts counts the ones that don't).
    c.set("tokenId", tokenId);
    if (viewer.grant.access === "read" && c.req.method !== "GET" && c.req.method !== "HEAD") return fail(c, 403, "This API token can only read. To change things, create a token with Read and write access.");
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
