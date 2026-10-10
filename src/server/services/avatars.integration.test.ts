import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { expect, it } from "vitest";

import { db } from "../db";
import { uploadCleanup, users } from "../db/schema";
import { avatarKey, setAvatar } from "./avatars";
import { readUpload } from "./uploads";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
async function user() {
  const id = nanoid();
  await db.insert(users).values({ id, name: "Avatar", email: `${id}@example.test` });
  return id;
}
const file = () => new File([png], "image.png", { type: "text/html" });

it("concurrent replacements keep only the current image and clean both leases", async () => {
  const id = await user();
  const updates = await Promise.all([setAvatar(id, file()), setAvatar(id, file())]);
  const [current] = await db.select().from(users).where(eq(users.id, id));
  for (const update of updates) {
    const bytes = await readUpload(avatarKey(update.image)!);
    if (update.image === current!.image) expect(bytes).toEqual(Buffer.from(png));
    else expect(bytes).toBeNull();
  }
  expect(await db.select().from(uploadCleanup)).toHaveLength(0);
  const removed = await setAvatar(id, null);
  expect(removed.image).toBeNull();
  expect(await readUpload(avatarKey(current!.image)!)).toBeNull();
});

it("refuses active content, empty files and oversized images without changing the stored image", async () => {
  const id = await user();
  const current = await setAvatar(id, file());
  for (const rejected of [new File(["<svg />"], "fake.png", { type: "image/png" }), new File([], "empty.png"), new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png")]) {
    await expect(setAvatar(id, rejected)).rejects.toThrow(/Choose/);
  }
  expect((await db.select().from(users).where(eq(users.id, id)))[0]!.image).toBe(current.image);
  expect(await readUpload(avatarKey(current.image)!)).toEqual(Buffer.from(png));
});
