// Attachment bytes on local disk under UPLOAD_DIR. An object store is a later swap: only these
// helpers and `attachments.storageKey` change.
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { nanoid } from "nanoid";

import { env } from "../env";

const pathOf = (storageKey: string) => join(env.UPLOAD_DIR, storageKey);

/** Store the bytes; the returned key goes in `attachments.storageKey`. */
export async function saveUpload(bytes: Uint8Array, storageKey = nanoid()): Promise<string> {
  await mkdir(env.UPLOAD_DIR, { recursive: true });
  await writeFile(pathOf(storageKey), bytes);
  return storageKey;
}

/** The stored bytes, or null when the file is gone. */
export const readUpload = (storageKey: string) => readFile(pathOf(storageKey)).catch(() => null);

/** Size, the first bytes (for type sniffing) and a stream of the whole file — never the file in memory. Null when gone. */
export async function openUpload(storageKey: string): Promise<{ size: number; head: Uint8Array; stream: ReadableStream<Uint8Array> } | null> {
  const handle = await open(pathOf(storageKey)).catch(() => null);
  if (!handle) return null;
  try {
    const { size } = await handle.stat();
    const head = new Uint8Array(Math.min(size, 16));
    await handle.read(head, 0, head.length, 0);
    // The stream owns the handle from here and closes it when the response ends or is aborted.
    return { size, head, stream: Readable.toWeb(handle.createReadStream({ start: 0 })) as ReadableStream<Uint8Array> };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export const removeUpload = (storageKey: string) => rm(pathOf(storageKey), { force: true });
