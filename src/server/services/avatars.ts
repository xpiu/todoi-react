import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { MAX_AVATAR_BYTES } from "../../shared/avatars";
import { db } from "../db";
import { uploadCleanup, users } from "../db/schema";
import { ApiFailure } from "../errors";
import { previewType } from "./attachmentResponse";
import { drainUploadCleanup } from "./uploadCleanup";
import { saveUpload } from "./uploads";

export const avatarKey = (image: string | null) => /^\/api\/avatars\/(avatar-[A-Za-z0-9_-]{21})$/.exec(image ?? "")?.[1];

/** Reuse attachment storage and its crash-safe cleanup leases; the user row serializes replacements. */
export async function setAvatar(userId: string, file: File | null) {
  let key: string | undefined;
  let bytes: Uint8Array | undefined;
  if (file) {
    if (!file.size || file.size > MAX_AVATAR_BYTES) throw new ApiFailure(413, "Choose an image up to 2 MB");
    bytes = new Uint8Array(await file.arrayBuffer());
    if (!previewType(bytes)) throw new ApiFailure(400, "Choose a PNG, JPEG, GIF or WebP image");
    key = `avatar-${nanoid()}`;
    await db.insert(uploadCleanup).values({ storageKey: key, nextAttemptAt: sql`now() + interval '1 hour'` });

  }
  try {
    if (key && bytes) await saveUpload(bytes, key);
    const user = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!current) throw new ApiFailure(404, "Account not found");
      const previous = avatarKey(current.image);
      const [updated] = await tx.update(users).set({ image: key ? `/api/avatars/${key}` : null }).where(eq(users.id, userId)).returning();
      if (key) await tx.delete(uploadCleanup).where(eq(uploadCleanup.storageKey, key));
      if (previous) await tx.insert(uploadCleanup).values({ storageKey: previous }).onConflictDoNothing();
      return updated!;
    });
    await drainUploadCleanup();
    return user;
  } catch (error) {
    if (key) {
      await db.update(uploadCleanup).set({ nextAttemptAt: sql`now()` }).where(eq(uploadCleanup.storageKey, key)).catch(() => undefined);
      await drainUploadCleanup();
    }
    throw error;
  }
}
