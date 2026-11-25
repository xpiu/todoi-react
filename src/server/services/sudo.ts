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
