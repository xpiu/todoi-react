// Invite-only sign-up (SIGN_UP=invite, as on staging.todoi.com while a few testers try todoi): no guest
// workspaces, and a new account only for an address that was invited. Invited means one of: listed in
// SIGN_UP_EMAILS or ADMIN_EMAILS; an open project invite locked to the address; or the open invite link
// the sign-up came from (/i/:code, carried in the confirmation link's `next`), when that link isn't
// locked to another address. Existing accounts log in as usual.
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import { INVITE_ONLY } from "../../shared/accountLinks";
import { db } from "../db";
import { invites } from "../db/schema";
import { env } from "../env";

export { INVITE_ONLY };
export const GUESTS_OFF_MESSAGE = "todoi is invite-only for now. Log in, or open the invite link you were sent.";
export const NOT_INVITED_MESSAGE = "Sign-up is by invitation for now. Use the address your invite was sent to, or open the invite link again and create your account from there.";

/** The invite code in a sign-up's callbackURL ("/verify-email?next=%2Fi%2F<code>"), if any */
export function inviteCodeOf(callbackURL: unknown): string | null {
  if (typeof callbackURL !== "string") return null;
  try {
    const next = new URL(callbackURL, "http://callback.invalid").searchParams.get("next");
    return (next && /^\/i\/([\w-]{6,64})$/.exec(next)?.[1]) || null;
  } catch {
    return null;
  }
}

export async function maySignUp(email: string, callbackURL: unknown): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (env.SIGN_UP_EMAILS.includes(address) || env.ADMIN_EMAILS.includes(address)) return true;
  const sentTo = sql`lower(${invites.email}) = ${address}`;
  const code = inviteCodeOf(callbackURL);
  const [open] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date()), code ? or(sentTo, and(eq(invites.code, code), or(isNull(invites.email), sentTo))) : sentTo))
    .limit(1);
  return !!open;
}
