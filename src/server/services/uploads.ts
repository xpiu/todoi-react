// Attachment bytes on local disk under UPLOAD_DIR. An object store is a later swap: only these
// three helpers and `attachments.storageKey` change.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import { join } from "node:path";

import { env } from "../env";

const pathOf = (storageKey: string) => join(env.UPLOAD_DIR, storageKey);

/** Store the bytes; the returned key goes in `attachments.storageKey`. */
export async function saveUpload(bytes: Uint8Array): Promise<string> {
  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const storageKey = nanoid();
  await writeFile(pathOf(storageKey), bytes);
  return storageKey;
}

/** The stored bytes, or null when the file is gone. */
export const readUpload = (storageKey: string) => readFile(pathOf(storageKey)).catch(() => null);

export const removeUpload = (storageKey: string) => rm(pathOf(storageKey), { force: true });
