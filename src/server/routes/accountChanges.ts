// Account › Sign-in methods › Primary email: ask for a change of address (current password required),
// send the link again, cancel it. Better Auth signs and applies the link; services/emailChange.ts keeps
// the change in flight. Account › Data › Delete account: the review and the deletion
// (services/accountDeletion.ts). Every route here is for registered accounts only (access.ts).
import { isAPIError } from "better-auth/api";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import { auth, viewerOf } from "../auth";
import { EmailNotSent } from "../email";
import { fail, validate } from "../errors";
import { deleteAccount, deletionReview } from "../services/accountDeletion";
import { cancelEmailChange, confirmEmailChangeUrl, pendingEmailChange, recordEmailChange } from "../services/emailChange";

/** Better Auth signs a 24-hour link to the new address and sends it (auth.ts › sendVerificationEmail). */
async function sendChangeLink(c: Context, userId: string, email: string) {
  try {
    await auth.api.changeEmail({ body: { newEmail: email, callbackURL: confirmEmailChangeUrl(email) }, headers: c.req.raw.headers });
  } catch (error) {
    if (error instanceof EmailNotSent) return fail(c, 502, error.message, { code: "unavailable" });
    if (isAPIError(error)) return fail(c, error.statusCode === 401 ? 401 : 400, error.body?.message ?? "Couldn't start the change");
    throw error;
  }
  await recordEmailChange(userId, email);
  return c.json({ pendingEmail: email });
}

export const emailChangeRoute = new Hono()
  .post("/", validate("json", z.object({ email: z.email("Enter a full email address, like name@company.com.").max(254), password: z.string().min(1, "Enter your current password").max(256) })), async (c) => {
    const v = viewerOf(c);
    const { email: typed, password } = c.req.valid("json");
    const email = typed.trim().toLowerCase();
    if (email === v.email.toLowerCase()) return fail(c, 400, "That's already your email.", { fields: { email: "That's already your email." } });
    try {
      await auth.api.verifyPassword({ body: { password }, headers: c.req.raw.headers });
    } catch (error) {
      if (!isAPIError(error)) throw error;
      // No browser session (an API token): changing the sign-in address needs one.
      if (error.statusCode === 401) return fail(c, 401, "Log in again to change your email");
      return fail(c, 400, "That password isn't right.", { fields: { password: "That password isn't right." } });
    }
    return sendChangeLink(c, v.userId, email);
  })
  .post("/resend", async (c) => {
    const v = viewerOf(c);
    const pending = await pendingEmailChange(v.userId);
    if (!pending) return fail(c, 409, "No change is waiting anymore. Start again.");
    return sendChangeLink(c, v.userId, pending);
  })
  .delete("/", async (c) => {
    await cancelEmailChange(viewerOf(c).userId);
    return c.body(null, 204);
  });

/**
 * A browser session younger than Better Auth's freshAge (a day), as its own sensitive endpoints ask for:
 * deleting needs a recent log-in. API tokens never delete an account.
 */
async function freshSession(c: Context): Promise<{ fresh: boolean } | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers, query: { disableCookieCache: true } });
  if (!session) return null;
  const { freshAge } = (await auth.$context).sessionConfig;
  return { fresh: freshAge === 0 || Date.now() - new Date(session.session.createdAt).getTime() < freshAge * 1000 };
}

/** Account › Data › Delete account: what would go, what blocks it, then the deletion itself. */
export const deletionRoute = new Hono()
  .get("/", async (c) => {
    const v = viewerOf(c);
    const session = await freshSession(c);
    return c.json({ ...(await deletionReview(v.userId)), fresh: !!session?.fresh });
  })
  .post("/", validate("json", z.object({ email: z.string().trim().min(1, "Type your account email").max(254) })), async (c) => {
    const v = viewerOf(c);
    if (c.req.valid("json").email.toLowerCase() !== v.email.toLowerCase()) return fail(c, 400, "That isn't your account email", { fields: { email: "Type your account email exactly" } });
    const session = await freshSession(c);
    if (!session) return fail(c, 401, "Log in to delete your account");
    if (!session.fresh) return fail(c, 403, "For your safety, log in again before deleting your account", { fields: { session: "stale" } });
    await deleteAccount(v.userId);
    // Clear this browser's session cookies (the sessions themselves went with the account).
    const out = await auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
    for (const cookie of out.headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    return c.body(null, 204);
  });
