// Storing an upload batch: validate everything first, then write the bytes and record every row in one
// transaction, so a request either attaches all its files or none and leaves no orphan bytes behind.
import { inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { ATTACHMENT_QUOTA_BYTES, MAX_ATTACHMENT_BYTES, MAX_FILES_PER_UPLOAD, quotaMessage, tooLargeMessage } from "../../shared/uploads";
import { db } from "../db";
import { attachments, uploadCleanup } from "../db/schema";
import { logActivity, quote } from "./activity";
import { drainUploadCleanup } from "./uploadCleanup";
import { saveUpload } from "./uploads";

export const safeName = (n: string) => n.replace(/[\\/]/g, "_").slice(0, 200) || "file";

/** A batch the API refuses as a whole; nothing was stored. */
export class UploadRejected extends Error {
  constructor(message: string, readonly status: 400 | 403 | 413) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const usedBytes = async (tx: Tx | typeof db, userId: string) =>
  Number((await tx.select({ n: sql<string>`coalesce(sum(${attachments.size}), 0)` }).from(attachments).where(sql`${attachments.uploadedBy} = ${userId}`))[0]!.n);

export async function storeAttachments(item: { id: string; projectId: string | null; title: string }, files: File[], uploader: { userId: string; isAnonymous: boolean }) {
  if (!files.length) throw new UploadRejected("No files", 400);
  if (files.length > MAX_FILES_PER_UPLOAD) throw new UploadRejected(`Upload at most ${MAX_FILES_PER_UPLOAD} files at a time`, 413);
  const tooLarge = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
  if (tooLarge) throw new UploadRejected(tooLargeMessage(tooLarge.name), 413);
  const total = files.reduce((n, f) => n + f.size, 0);
  const quota = uploader.isAnonymous ? ATTACHMENT_QUOTA_BYTES.guest : ATTACHMENT_QUOTA_BYTES.account;
  // Checked again under a lock below; this early check avoids writing bytes that cannot be kept.
  if ((await usedBytes(db, uploader.userId)) + total > quota) throw new UploadRejected(quotaMessage(uploader.isAnonymous), 403);

  // Lease the keys on the cleanup queue first: if the process dies between writing bytes and
  // committing their rows, the queue removes the bytes once the lease expires.
  const keys = files.map(() => nanoid());
  await db.insert(uploadCleanup).values(keys.map((storageKey) => ({ storageKey, nextAttemptAt: sql`now() + interval '1 hour'` })));
  try {
    for (const [i, f] of files.entries()) await saveUpload(new Uint8Array(await f.arrayBuffer()), keys[i]);
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"attachment-quota:" + uploader.userId}))`);
      if ((await usedBytes(tx, uploader.userId)) + total > quota) throw new UploadRejected(quotaMessage(uploader.isAnonymous), 403);
      const made = await tx
        .insert(attachments)
        .values(files.map((f, i) => ({ id: nanoid(), itemId: item.id, name: safeName(f.name), size: f.size, mime: f.type || null, storageKey: keys[i]!, uploadedBy: uploader.userId })))
        .returning();
      await tx.delete(uploadCleanup).where(inArray(uploadCleanup.storageKey, keys));
      await logActivity(tx, { projectId: item.projectId, actorId: uploader.userId, type: "item", text: `attached ${made.length === 1 ? quote(made[0]!.name) : `${made.length} files`} to ${quote(item.title)}`, itemId: item.id });
      return made;
    });
  } catch (error) {
    // Nothing was committed: end the lease now so the written bytes go immediately.
    await db.update(uploadCleanup).set({ nextAttemptAt: sql`now()` }).where(inArray(uploadCleanup.storageKey, keys)).catch(() => undefined);
    await drainUploadCleanup();
    throw error;
  }
}
