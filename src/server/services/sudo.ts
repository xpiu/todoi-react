// Sudo mode (src/shared/sudo.ts): a browser session may do the sensitive account actions for SUDO_HOURS
// after the person last confirmed it's them in it. Only that explicit "Confirm it's you" step counts, not a
// log-in (GitHub's sudo mode, Laravel's password.confirm). The window is per session: another device, or
// another session on this one, is not covered. Confirming with a password stamps the session
// (`sessions.confirmed_at`); confirming with a passkey is a passkey log-in from a browser already signed in
// to the account, so auth.ts stamps the session that replaces it the same way. A passkey log-in on the
// log-in page stamps nothing.
import { eq } from "drizzle-orm";

import { SUDO_HOURS } from "../../shared/sudo";
import { db } from "../db";
import { sessions } from "../db/schema";
import { clearAttempts, reserveAttempt } from "./attempts";

const WINDOW_MS = SUDO_HOURS * 3600_000;

/** Until when the session may do sensitive actions without confirming again; null once that has passed. */
export async function sudoUntil(sessionId: string, now = Date.now()): Promise<Date | null> {
  const [row] = await db.select({ confirmedAt: sessions.confirmedAt }).from(sessions).where(eq(sessions.id, sessionId));
  if (!row?.confirmedAt) return null;
  const until = row.confirmedAt.getTime() + WINDOW_MS;
  return until > now ? new Date(until) : null;
}

/**
 * The person just confirmed it's them in this session — their password, or a passkey from this browser (the
 * one path for both): the session is stamped, and the account's wrong-password count starts again.
 */
export async function confirmSession(session: { id: string; userId: string }): Promise<Date | null> {
  await db.update(sessions).set({ confirmedAt: new Date() }).where(eq(sessions.id, session.id));
  await clearAttempts(tries(session.userId));
  return sudoUntil(session.id);
}

// Password tries at the confirm step, throttled per account as OWASP advises (decision R2): at most
// MAX_TRIES wrong ones in TRY_WINDOW_MINUTES, then 429 until the window ends — no lockout, a passkey still
// works, and any confirmation (confirmSession) clears the count. Counted in Postgres (services/attempts.ts).
export const MAX_TRIES = 5;
export const TRY_WINDOW_MINUTES = 15;
const tries = (userId: string) => `sudo-tries:${userId}`;

/**
 * Counts one password try before the password is checked, so parallel guesses can't get past the limit.
 * Returns the try's number in the window, or when the person may try again once the window is full.
 */
export const reserveTry = (userId: string, now = new Date()) => reserveAttempt(tries(userId), { max: MAX_TRIES, windowMinutes: TRY_WINDOW_MINUTES }, now);
