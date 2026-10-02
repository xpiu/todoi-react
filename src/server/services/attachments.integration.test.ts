import { readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";

import { ATTACHMENT_QUOTA_BYTES, MAX_ATTACHMENT_BYTES } from "../../shared/uploads";
import { db } from "../db";
import { activity, attachments, groups, items, lists, projects, uploadCleanup, users } from "../db/schema";
import { env } from "../env";
import { storeAttachments, UploadRejected } from "./attachments";
import { openUpload } from "./uploads";

// Widen the window between the quota check and the commit, so racing uploads really overlap.
vi.mock("./activity", async (original) => {
  const actual = await original<typeof import("./activity")>();
  return { ...actual, logActivity: async (...args: Parameters<typeof actual.logActivity>) => { await new Promise((done) => setTimeout(done, 40)); return actual.logActivity(...args); } };
});

async function fixture(isAnonymous = false) {
  const userId = nanoid(), groupId = nanoid(), projectId = nanoid(), listId = nanoid(), itemId = nanoid();
  await db.insert(users).values({ id: userId, name: "Upload test", email: `${userId}@example.test`, isAnonymous });
  await db.insert(groups).values({ id: groupId, name: "Test", keyPrefix: "UP", ownerId: userId });
  await db.insert(projects).values({ id: projectId, groupId, name: "Uploads" });
  await db.insert(lists).values({ id: listId, projectId, name: "List" });
  await db.insert(items).values({ id: itemId, projectId, listId, title: "Has files" });
  return { item: { id: itemId, projectId, title: "Has files" }, uploader: { userId, isAnonymous } };
}

const stored = async () => (await readdir(env.UPLOAD_DIR).catch(() => [])).sort();
const file = (name: string, size: number) => new File([new Uint8Array(size).fill(65)], name, { type: "text/plain" });
const rejection = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);

describe("storing attachment uploads", () => {
  it("stores a batch with one activity entry and no leftover cleanup leases", async () => {
    const f = await fixture();
    const made = await storeAttachments(f.item, [file("a.txt", 3), file("b.txt", 5)], f.uploader);
    expect(made.map((m) => [m.name, m.size])).toEqual([["a.txt", 3], ["b.txt", 5]]);
    for (const m of made) expect((await openUpload(m.storageKey))?.size).toBe(m.size);
    expect(await db.select().from(uploadCleanup)).toEqual([]);
    expect((await db.select().from(activity).where(eq(activity.itemId, f.item.id))).map((a) => a.text)).toEqual(["attached 2 files to “Has files”"]);
  });

  it("refuses a mixed batch before writing any bytes", async () => {
    const f = await fixture();
    const before = await stored();
    const error = await rejection(storeAttachments(f.item, [file("ok.txt", 3), file("huge.bin", MAX_ATTACHMENT_BYTES + 1)], f.uploader));
    expect(error).toBeInstanceOf(UploadRejected);
    expect(error).toMatchObject({ status: 413, message: "huge.bin is larger than 25 MB" });
    expect(await stored()).toEqual(before);
    expect(await db.select().from(attachments).where(eq(attachments.itemId, f.item.id))).toEqual([]);
  });

  it("removes written bytes when the database rejects the batch", async () => {
    const f = await fixture();
    const before = await stored();
    // The item vanished after the request started: the insert fails on its foreign key.
    await db.delete(items).where(eq(items.id, f.item.id));
    await expect(storeAttachments(f.item, [file("a.txt", 3), file("b.txt", 3)], f.uploader)).rejects.toThrow();
    expect(await stored()).toEqual(before);
    expect(await db.select().from(uploadCleanup)).toEqual([]);
  });

  it("holds guests to their quota when uploads race", async () => {
    const f = await fixture(true);
    // Existing usage leaves room for exactly one of the racing files (recorded without bytes on disk).
    await db.insert(attachments).values({ id: nanoid(), itemId: f.item.id, name: "old.bin", size: ATTACHMENT_QUOTA_BYTES.guest - 15, storageKey: nanoid(), uploadedBy: f.uploader.userId });
    const before = await stored();
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => storeAttachments(f.item, [file(`${i}.txt`, 10)], f.uploader)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) expect(r.reason).toMatchObject({ status: 403, message: expect.stringContaining("Guest workspaces can store up to 100 MB") });
    expect((await stored()).length).toBe(before.length + 1);
    expect(await db.select().from(uploadCleanup)).toEqual([]);
  });
});
