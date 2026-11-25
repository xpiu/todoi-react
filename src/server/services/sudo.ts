// Sudo mode (src/shared/sudo.ts): a browser session may do the sensitive account actions for SUDO_HOURS
// after its log-in or after the person last confirmed it's them in it. The window is per session: another
// device, or another session on this one, is not covered. Confirming with a password stamps the session
// (`sessions.confirmed_at`); confirming with a passkey is a passkey log-in, so the new session counts from
// its creation (auth.ts retires the session it replaced).
import { eq } from "drizzle-orm";

import { SUDO_HOURS } from "../../shared/sudo";
import { db } from "../db";
import { sessions } from "../db/schema";

const WINDOW_MS = SUDO_HOURS * 3600_000;

/** Until when the session may do sensitive actions without confirming again; null once that has passed. */
export async function sudoUntil(sessionId: string, now = Date.now()): Promise<Date | null> {
  const [row] = await db.select({ createdAt: sessions.createdAt, confirmedAt: sessions.confirmedAt }).from(sessions).where(eq(sessions.id, sessionId));
  if (!row) return null;
  const until = Math.max(row.createdAt.getTime(), row.confirmedAt?.getTime() ?? 0) + WINDOW_MS;
  return until > now ? new Date(until) : null;
}

/** The person just confirmed it's them (their password checked out) in this session. */
export async function confirmSession(sessionId: string): Promise<Date | null> {
  await db.update(sessions).set({ confirmedAt: new Date() }).where(eq(sessions.id, sessionId));
  return sudoUntil(sessionId);
}
