// Sudo mode (src/shared/sudo.ts): a browser session may do the sensitive account actions for SUDO_HOURS
// after the person last confirmed it's them in it. Only that explicit "Confirm it's you" step counts, not a
// log-in (GitHub's sudo mode, Laravel's password.confirm). The window is per session: another device, or
// another session on this one, is not covered. Confirming with a password stamps the session
// (`sessions.confirmed_at`); confirming with a passkey is a passkey log-in from a browser already signed in
// to the account, so auth.ts stamps the session that replaces it the same way. A passkey log-in on the
// log-in page stamps nothing.
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { SUDO_HOURS } from "../../shared/sudo";
import { db } from "../db";
import { sessions, verifications } from "../db/schema";

const WINDOW_MS = SUDO_HOURS * 3600_000;

/** Until when the session may do sensitive actions without confirming again; null once that has passed. */
export async function sudoUntil(sessionId: string, now = Date.now()): Promise<Date | null> {
  const [row] = await db.select({ confirmedAt: sessions.confirmedAt }).from(sessions).where(eq(sessions.id, sessionId));
  if (!row?.confirmedAt) return null;
  const until = row.confirmedAt.getTime() + WINDOW_MS;
  return until > now ? new Date(until) : null;
}

/** The person just confirmed it's them (their password, or a passkey from this browser) in this session. */
export async function confirmSession(sessionId: string): Promise<Date | null> {
  await db.update(sessions).set({ confirmedAt: new Date() }).where(eq(sessions.id, sessionId));
  return sudoUntil(sessionId);
}

// Password tries at the confirm step, throttled per account as OWASP advises (decision R2): at most
// MAX_TRIES wrong ones in TRY_WINDOW_MINUTES, then 429 until the window ends — no lockout, a passkey still
// works, and the right password clears the count. Better Auth's own rate limiter can't do this (it counts
// every request per IP and path, and only on its own endpoints), so the count is one row per account in its
// verifications table, as services/emailChange.ts keeps a change in flight: value = tries in the window,
// expiresAt = the window's end.
export const MAX_TRIES = 5;
export const TRY_WINDOW_MINUTES = 15;
const tries = (userId: string) => `sudo-tries:${userId}`;

/**
 * Counts one password try before the password is checked, so parallel guesses can't get past the limit.
 * Returns the try's number in the window, or when the person may try again once the window is full.
 */
export async function reserveTry(userId: string, now = new Date()): Promise<{ try: number } | { retryAt: Date }> {
  const identifier = tries(userId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identifier}))`);
    const [row] = await tx.select().from(verifications).where(eq(verifications.identifier, identifier));
    if (row && row.expiresAt > now) {
      const count = Number(row.value);
      if (count >= MAX_TRIES) return { retryAt: row.expiresAt };
      await tx.update(verifications).set({ value: String(count + 1) }).where(eq(verifications.id, row.id));
      return { try: count + 1 };
    }
    if (row) await tx.delete(verifications).where(eq(verifications.id, row.id));
    await tx.insert(verifications).values({ id: nanoid(), identifier, value: "1", expiresAt: new Date(now.getTime() + TRY_WINDOW_MINUTES * 60_000) });
    return { try: 1 };
  });
}

/** The right password: the count starts again. */
export async function clearTries(userId: string) {
  await db.delete(verifications).where(eq(verifications.identifier, tries(userId)));
}
