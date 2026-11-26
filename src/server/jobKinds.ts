// Every kind of background job and every schedule, in one place. Started by src/server/index.ts.
import { and, eq, ne } from "drizzle-orm";

import { db } from "./db";
import { gitConnections } from "./db/schema";
import { pruneSyncRuns, SyncFailure, syncConnection, type SyncTrigger } from "./gitSync/engine";
import { defineJob, enqueue, every, pruneJobs, startWorker } from "./jobs";
import { pruneErrorGroups } from "./services/errorTracking";
import { purgeIdleGuests } from "./services/guests";
import { purgeTrash } from "./services/lifecycle";
import { drainUploadCleanup } from "./services/uploadCleanup";
import { pruneOperationReceipts } from "./sync";

const MINUTE = 60_000;
/** How often every auto-sync connection is reconciled, catching pushes whose webhook never arrived. */
export const RECONCILE_EVERY_MS = 10 * MINUTE;
/** An auto-sync connection this long without a sync has stalled (its scheduled syncs aren't getting through). */
export const STALE_AFTER_MS = 3 * RECONCILE_EVERY_MS;

/** One sync of a connection. Coalesced: while one is queued, asking again changes nothing. */
export const enqueueGitSync = (connectionId: string, trigger: Extract<SyncTrigger, "webhook" | "auto">) => enqueue("git-sync", { connectionId, trigger }, { key: `git-sync:${connectionId}` });

export function defineJobs() {
  defineJob<{ connectionId: string; trigger: Extract<SyncTrigger, "webhook" | "auto"> }>("git-sync", {
    maxAttempts: 5,
    run: async ({ connectionId, trigger }) => {
      try {
        // Failures GitHub or the file cause are recorded on the run and the connection; only "busy" retries here.
        await syncConnection(connectionId, trigger, null);
      } catch (e) {
        if (e instanceof SyncFailure && e.reason === "not-found") return;
        throw e;
      }
    },
  });
  defineJob("git-reconcile", {
    run: async () => {
      // A paused connection waits for a person; the rest catch up with anything the webhooks missed.
      const due = await db.select({ id: gitConnections.id }).from(gitConnections).where(and(eq(gitConnections.autoSync, true), ne(gitConnections.state, "conflict")));
      for (const c of due) await enqueueGitSync(c.id, "auto");
    },
  });
  defineJob("trash-purge", {
    run: async () => {
      const gone = await purgeTrash();
      if (gone.items || gone.projects) console.log(JSON.stringify({ level: "info", msg: "trash purged", ...gone }));
      const guests = await purgeIdleGuests();
      if (guests.removed || guests.kept) console.log(JSON.stringify({ level: "info", msg: "idle guest workspaces purged", ...guests }));
      await pruneJobs();
      await pruneSyncRuns();
      await pruneErrorGroups();
    },
  });
  defineJob("upload-cleanup", { run: async () => void (await drainUploadCleanup()) });
  defineJob("receipts-prune", { run: async () => void (await pruneOperationReceipts()) });
}

/** Register the kinds, make sure every schedule exists, start this process's worker. Returns stop(). */
export async function startJobs(): Promise<() => void> {
  defineJobs();
  await Promise.all([every("upload-cleanup", MINUTE), every("receipts-prune", 10 * MINUTE), every("trash-purge", 6 * 60 * MINUTE), every("git-reconcile", RECONCILE_EVERY_MS)]);
  return startWorker();
}
