import { asc, eq, lte, sql } from "drizzle-orm";

import { db } from "../db";
import { uploadCleanup } from "../db/schema";
import { removeUpload } from "./uploads";

/** Bounded, retryable cleanup. Row locks let multiple API processes safely drain the same queue. */
export async function drainUploadCleanup() {
  try {
    return await db.transaction(async (tx) => {
      const pending = await tx.select().from(uploadCleanup).where(lte(uploadCleanup.nextAttemptAt, sql`now()`))
        .orderBy(asc(uploadCleanup.nextAttemptAt)).limit(100).for("update", { skipLocked: true });
      let removed = 0;
      for (const entry of pending) {
        try {
          // rm(force) is idempotent if a crash occurs after removing bytes but before committing.
          await removeUpload(entry.storageKey);
        } catch (error) {
          const attempts = entry.attempts + 1;
          const delay = Math.min(3600, 60 * 2 ** Math.min(attempts, 6));
          await tx.update(uploadCleanup).set({ attempts, nextAttemptAt: sql`now() + ${delay} * interval '1 second'` }).where(eq(uploadCleanup.storageKey, entry.storageKey));
          console.warn("Attachment cleanup will retry", entry.storageKey, error);
          continue;
        }
        await tx.delete(uploadCleanup).where(eq(uploadCleanup.storageKey, entry.storageKey));
        removed++;
      }
      return removed;
    });
  } catch (error) {
    // Cleanup failure must not turn a committed deletion into an apparent failed request.
    console.error("Attachment cleanup queue could not be drained", error);
    return 0;
  }
}
