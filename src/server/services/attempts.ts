// Attempts counted per subject in Postgres, so a limit holds across restarts and instances: wrong passwords
// at the confirm step (services/sudo.ts) and log-ins per account (auth.ts). Better Auth's rate limiter can't
// do this (it counts every request per IP and path). One row per subject in Better Auth's verifications table,
// as services/emailChange.ts keeps a change in flight: value = attempts in the window, expiresAt = its end.
// An attempt counts before the password is checked, so parallel guesses can't get past the limit; a success
// clears the count (clearAttempts). No lockout: once the window ends, the count starts again.
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "../db";
import { verifications } from "../db/schema";

export interface AttemptRule {
  max: number;
  windowMinutes: number;
}

/** Counts one attempt. Returns its number in the window, or when the next one may be made once the window is full. */
export async function reserveAttempt(identifier: string, { max, windowMinutes }: AttemptRule, now = new Date()): Promise<{ try: number } | { retryAt: Date }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identifier}))`);
    const [row] = await tx.select().from(verifications).where(eq(verifications.identifier, identifier));
    if (row && row.expiresAt > now) {
      const count = Number(row.value);
      if (count >= max) return { retryAt: row.expiresAt };
      await tx.update(verifications).set({ value: String(count + 1) }).where(eq(verifications.id, row.id));
      return { try: count + 1 };
    }
    if (row) await tx.delete(verifications).where(eq(verifications.id, row.id));
    await tx.insert(verifications).values({ id: nanoid(), identifier, value: "1", expiresAt: new Date(now.getTime() + windowMinutes * 60_000) });
    return { try: 1 };
  });
}

export async function clearAttempts(identifier: string): Promise<void> {
  await db.delete(verifications).where(eq(verifications.identifier, identifier));
}

/** "Try again in 12 minutes." for a 429's message */
export function retryIn(retryAt: Date, now = Date.now()): { seconds: number; words: string } {
  const seconds = Math.max(1, Math.ceil((retryAt.getTime() - now) / 1000));
  const minutes = Math.ceil(seconds / 60);
  return { seconds, words: `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` };
}
