// Changing the sign-in email (Settings › Account › Primary email). Better Auth's changeEmail signs the
// link (24 hours, to the NEW address only) and its /verify-email applies the change; it keeps no record
// of a change in flight, so this module does, in Better Auth's own verifications table: one row per
// account (identifier "email-change:<user id>", value = the new address). That record is what the
// Primary email row shows, what Send it again re-sends and what Cancel the change deletes; a link whose
// change was cancelled or replaced stops working (`refusedChange`, run before /verify-email).
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { EMAIL_LINK_HOURS } from "../../shared/accountLinks";
import { db } from "../db";
import { users, verifications } from "../db/schema";
import { env } from "../env";

const identifier = (userId: string) => `email-change:${userId}`;

/** The address waiting for its link, while the link can still work. */
export async function pendingEmailChange(userId: string): Promise<string | null> {
  const [row] = await db.select({ value: verifications.value }).from(verifications).where(and(eq(verifications.identifier, identifier(userId)), gt(verifications.expiresAt, new Date())));
  return row?.value ?? null;
}

export async function recordEmailChange(userId: string, email: string) {
  await db.transaction(async (tx) => {
    await tx.delete(verifications).where(eq(verifications.identifier, identifier(userId)));
    await tx.insert(verifications).values({ id: nanoid(), identifier: identifier(userId), value: email, expiresAt: new Date(Date.now() + EMAIL_LINK_HOURS * 3600_000) });
  });
}

export async function cancelEmailChange(userId: string) {
  await db.delete(verifications).where(eq(verifications.identifier, identifier(userId)));
}

/** Where the confirmation link sends the person: ConfirmEmailChangePage, which reads `email` and `error`. */
export const confirmEmailChangeUrl = (email: string, error?: string) => {
  const url = new URL(`${env.APP_URL}/confirm-email`);
  url.searchParams.set("email", email);
  if (error) url.searchParams.set("error", error);
  return url.toString();
};

/** The claims of a Better Auth email link, unverified (Better Auth checks the signature itself). */
export function emailLinkClaims(token: string | undefined): { email?: string; updateTo?: string; requestType?: string; userId?: string } | null {
  try {
    return JSON.parse(Buffer.from(token?.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
  } catch {
    return null;
  }
}

/**
 * Before Better Auth applies a change-of-address link: a reason code when it must not, else null.
 * A link already used falls through: Better Auth refuses it (INVALID_TOKEN), which the page reads as "used".
 */
export async function refusedChange(claims: { updateTo?: string; userId?: string }): Promise<"CHANGE_CANCELLED" | "EMAIL_TAKEN" | null> {
  if (!claims.updateTo || !claims.userId) return null;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, claims.userId));
  if (!user || user.email.toLowerCase() === claims.updateTo.toLowerCase()) return null;
  if ((await pendingEmailChange(claims.userId))?.toLowerCase() !== claims.updateTo.toLowerCase()) return "CHANGE_CANCELLED";
  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(sql`lower(${users.email})`, claims.updateTo.toLowerCase()), ne(users.id, claims.userId)));
  return taken ? "EMAIL_TAKEN" : null;
}

/** After Better Auth changed the address: the record goes, and the new address counts as confirmed (its link was opened). */
export async function settleEmailChange(user: { id: string; email: string; emailVerified: boolean }) {
  const pending = await pendingEmailChange(user.id);
  if (pending?.toLowerCase() !== user.email.toLowerCase()) return;
  await cancelEmailChange(user.id);
  if (!user.emailVerified) await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
}
