// Sudo mode (services/sudo.ts): whether this session may do the sensitive account actions now, and
// confirming it's you with the password. Account › Sign-in methods › Primary email: ask for a change of
// address, send the link again, cancel it. Better Auth signs and applies the link; services/emailChange.ts
// keeps the change in flight. Account › Data › Delete account: the review and the deletion
// (services/accountDeletion.ts). Asking for a change of address and deleting need sudo mode. Every route
// here is for registered accounts only (access.ts).
import { isAPIError } from "better-auth/api";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import { SUDO_REQUIRED } from "../../shared/sudo";
import { auth, viewerOf } from "../auth";
import { EmailNotSent } from "../email";
import { fail, validate } from "../errors";
import { deleteAccount, deletionReview } from "../services/accountDeletion";
import { cancelEmailChange, confirmEmailChangeUrl, pendingEmailChange, recordEmailChange } from "../services/emailChange";
import { confirmSession, sudoUntil } from "../services/sudo";

/** This request's browser session (read past the cookie cache); API tokens have none. */
async function browserSession(c: Context) {
  return (await auth.api.getSession({ headers: c.req.raw.headers, query: { disableCookieCache: true } }))?.session ?? null;
}

/**
 * Null when this browser session is in sudo mode; otherwise the refusal to send. API tokens never do these
 * actions; a session outside the window gets `fields.sudo`, and the client asks the person to confirm.
 */
async function sudoRefusal(c: Context, action: string) {
  const session = await browserSession(c);
  if (!session) return fail(c, 401, `Log in to ${action}`);
  if (await sudoUntil(session.id)) return null;
  return fail(c, 403, "Confirm it's you to continue", { fields: { sudo: SUDO_REQUIRED } });
}

/** GET: whether this session is in sudo mode (`confirmedUntil`, or null). POST: confirm with the password. */
export const sudoRoute = new Hono()
  .get("/", async (c) => {
    const session = await browserSession(c);
    const until = session ? await sudoUntil(session.id) : null;
    return c.json({ confirmedUntil: until?.toISOString() ?? null });
  })
  .post("/", validate("json", z.object({ password: z.string().min(1, "Enter your password").max(256) })), async (c) => {
    const session = await browserSession(c);
    if (!session) return fail(c, 401, "Log in to continue");
    try {
      await auth.api.verifyPassword({ body: { password: c.req.valid("json").password }, headers: c.req.raw.headers });
    } catch (error) {
      if (!isAPIError(error)) throw error;
      if (error.statusCode === 401) return fail(c, 401, "Log in to continue");
      return fail(c, 400, "That password isn't right.", { fields: { password: "That password isn't right." } });
    }
    const until = await confirmSession(session.id);
    return c.json({ confirmedUntil: until?.toISOString() ?? null });
  });

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
  .post("/", validate("json", z.object({ email: z.email("Enter a full email address, like name@company.com.").max(254) })), async (c) => {
    const v = viewerOf(c);
    const email = c.req.valid("json").email.trim().toLowerCase();
    if (email === v.email.toLowerCase()) return fail(c, 400, "That's already your email.", { fields: { email: "That's already your email." } });
    const refused = await sudoRefusal(c, "change your email");
    if (refused) return refused;
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

/** Account › Data › Delete account: what would go, what blocks it, then the deletion itself. */
export const deletionRoute = new Hono()
  .get("/", async (c) => c.json(await deletionReview(viewerOf(c).userId)))
  .post("/", validate("json", z.object({ email: z.string().trim().min(1, "Type your account email").max(254) })), async (c) => {
    const v = viewerOf(c);
    if (c.req.valid("json").email.toLowerCase() !== v.email.toLowerCase()) return fail(c, 400, "That isn't your account email", { fields: { email: "Type your account email exactly" } });
    const refused = await sudoRefusal(c, "delete your account");
    if (refused) return refused;
    await deleteAccount(v.userId);
    // Clear this browser's session cookies (the sessions themselves went with the account).
    const out = await auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
    for (const cookie of out.headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    return c.body(null, 204);
  });
