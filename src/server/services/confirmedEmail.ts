// Confirmed sign-in addresses (work plan R4). Signing up and signing in never wait for the confirmation
// link; work that relies on owning the address does: inviting people (Todoi emails strangers on the
// inviter's behalf), joining through an invite sent to an address (otherwise whoever signs up first with
// a teammate's address takes their seat), and getting notification email. The flag is read from the
// database, not the session, whose cookie cache can lag a just-opened link by up to a minute.
import { eq } from "drizzle-orm";

import { EMAIL_UNCONFIRMED } from "../../shared/accountLinks";
import { db } from "../db";
import { users } from "../db/schema";
import { ApiFailure } from "../errors";

export async function emailConfirmed(userId: string): Promise<boolean> {
  const [row] = await db.select({ emailVerified: users.emailVerified }).from(users).where(eq(users.id, userId));
  return !!row?.emailVerified;
}

/** Refuses (403, `fields.confirmEmail`) until the person has confirmed their address. `toDo` completes "Confirm your email address to …". */
export async function requireConfirmedEmail(person: { userId: string; email: string; isAnonymous?: boolean }, toDo: string): Promise<void> {
  if (person.isAnonymous) throw new ApiFailure(403, `Create an account to ${toDo}`);
  if (await emailConfirmed(person.userId)) return;
  throw new ApiFailure(403, `Confirm your email address to ${toDo}. Open the link we sent to ${person.email}, or send a new one from Settings › Notifications.`, { confirmEmail: EMAIL_UNCONFIRMED });
}
