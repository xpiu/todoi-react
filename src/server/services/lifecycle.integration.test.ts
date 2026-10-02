import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";

import { db } from "../db";
import { activity, attachments, comments, groups, invites, itemAssignees, itemLabels, itemRelations, items, itemWatchers, labels, lists, members, projects, savedViews, uploadCleanup, users } from "../db/schema";
import { env } from "../env";
import { destroyItem, destroyProject, itemContainersLive, itemIsLive, setItemLifecycle, setProjectLifecycle } from "./lifecycle";
import { drainUploadCleanup } from "./uploadCleanup";
import { readUpload, saveUpload } from "./uploads";

async function fixture() {
  const userId = nanoid(), groupId = nanoid(), projectId = nanoid(), listId = nanoid();
  const parent = nanoid(), child = nanoid(), removed = nanoid(), archived = nanoid(), labelId = nanoid();
  await db.insert(users).values({ id: userId, name: "Lifecycle test", email: `${userId}@example.test` });
  await db.insert(groups).values({ id: groupId, name: "Test", keyPrefix: "TEST", ownerId: userId });
  await db.insert(projects).values({ id: projectId, groupId, name: "Lifecycle test" });
  await db.insert(lists).values({ id: listId, projectId, name: "List" });
  await db.insert(members).values({ projectId, userId, role: "owner" });
  await db.insert(items).values([
    { id: parent, projectId, listId, title: "Parent" },
    { id: child, projectId, listId, title: "Child", parentItemId: parent },
    { id: removed, projectId, listId, title: "Deleted child", parentItemId: parent, deletedAt: new Date() },
    { id: archived, projectId, listId, title: "Archived child", parentItemId: parent, archivedAt: new Date() },
  ]);
  await db.insert(labels).values({ id: labelId, projectId, name: "Label", color: "blue" });
  await db.insert(itemLabels).values({ itemId: child, labelId });
  await db.insert(itemAssignees).values({ itemId: child, userId });
  await db.insert(itemWatchers).values({ itemId: child, userId });
  await db.insert(itemRelations).values({ itemId: parent, targetId: child, type: "related" });
  await db.insert(comments).values({ id: nanoid(), itemId: child, authorId: userId, body: "Comment" });
  await db.insert(activity).values({ id: nanoid(), projectId, itemId: child, type: "item", text: "Created child" });
  await db.insert(savedViews).values({ id: nanoid(), projectId, ownerId: userId, name: "View", definition: {} });
  await db.insert(invites).values({ id: nanoid(), code: nanoid(), projectId, invitedBy: userId, role: "editor", expiresAt: new Date(Date.now() + 86400000) });
  const storageKeys = await Promise.all([saveUpload(Buffer.from("parent")), saveUpload(Buffer.from("child"))]);
  await db.insert(attachments).values(storageKeys.map((storageKey, index) => ({ id: nanoid(), itemId: index ? child : parent, name: "test.txt", storageKey })));
  return { userId, projectId, parent, child, removed, archived, storageKeys };
}

describe("item and project lifecycle", () => {
  it("inherits container removal and preserves independently removed children on restore", async () => {
    const f = await fixture();
    const live = async () => (await db.select({ id: items.id }).from(items).where(and(eq(items.projectId, f.projectId), itemIsLive))).map((r) => r.id).sort();
    const archive = async () => (await db.select({ id: items.id }).from(items).where(and(eq(items.projectId, f.projectId), itemContainersLive, or(isNotNull(items.archivedAt), isNotNull(items.deletedAt))))).map((r) => r.id).sort();
    expect(await live()).toEqual([f.parent, f.child].sort());
    await setItemLifecycle(f.parent, { archived: true }, f.userId);
    expect(await live()).toEqual([]);
    expect(await archive()).toEqual([f.parent]);
    await setItemLifecycle(f.parent, { archived: false }, f.userId);
    expect(await live()).toEqual([f.parent, f.child].sort());
    expect(await archive()).toEqual([f.removed, f.archived].sort());
    await setItemLifecycle(f.parent, { deleted: true }, f.userId);
    expect(await live()).toEqual([]);
    await setItemLifecycle(f.parent, { deleted: false }, f.userId);
    expect(await live()).toEqual([f.parent, f.child].sort());
    for (const change of [{ archived: true }, { archived: false, deleted: true }]) {
      await setProjectLifecycle(f.projectId, change);
      expect(await live()).toEqual([]);
      expect(await archive()).toEqual([]);
    }
    await setProjectLifecycle(f.projectId, { archived: false, deleted: false });
    expect(await live()).toEqual([f.parent, f.child].sort());
    expect(await archive()).toEqual([f.removed, f.archived].sort());
  });

  it("permanently deletes a parent and all descendants, relationships and bytes", async () => {
    const f = await fixture();
    await destroyItem(f.parent);
    expect(await db.select().from(items).where(eq(items.projectId, f.projectId))).toEqual([]);
    for (const table of [comments, attachments, itemLabels, itemAssignees, itemWatchers, itemRelations]) {
      expect(await db.select().from(table).where(inArray(table.itemId, [f.parent, f.child, f.removed, f.archived]))).toEqual([]);
    }
    for (const key of f.storageKeys) expect(await readUpload(key!)).toBeNull();
    expect(await db.select().from(projects).where(eq(projects.id, f.projectId))).toHaveLength(1);
  });

  it("deletes a populated project and all project dependents atomically", async () => {
    const f = await fixture();
    await destroyProject(f.projectId);
    expect(await db.select().from(projects).where(eq(projects.id, f.projectId))).toEqual([]);
    for (const table of [items, lists, members, labels, activity, savedViews, invites]) {
      expect(await db.select().from(table).where(eq(table.projectId, f.projectId))).toEqual([]);
    }
    for (const key of f.storageKeys) expect(await readUpload(key!)).toBeNull();
  });

  it("rolls back cascading rows and cleanup jobs together, leaving file bytes untouched", async () => {
    const f = await fixture();
    await expect(db.transaction(async (tx) => {
      await tx.delete(projects).where(eq(projects.id, f.projectId));
      expect(await tx.select().from(uploadCleanup).where(inArray(uploadCleanup.storageKey, f.storageKeys))).toHaveLength(2);
      throw new Error("Simulated failure after cascade");
    })).rejects.toThrow("Simulated failure after cascade");
    expect(await db.select().from(items).where(eq(items.projectId, f.projectId))).toHaveLength(4);
    expect(await db.select().from(attachments).where(inArray(attachments.itemId, [f.parent, f.child]))).toHaveLength(2);
    expect(await db.select().from(uploadCleanup).where(inArray(uploadCleanup.storageKey, f.storageKeys))).toEqual([]);
    for (const key of f.storageKeys) expect(await readUpload(key!)).not.toBeNull();
  });

  it("retains failed filesystem cleanup for retry after the deletion commits", async () => {
    const f = await fixture();
    const key = f.storageKeys[0]!;
    const path = join(env.UPLOAD_DIR, key);
    await rm(path);
    await mkdir(path); // rm(force) rejects directories: exercise an actual filesystem failure.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await destroyItem(f.parent);
      const [job] = await db.select().from(uploadCleanup).where(eq(uploadCleanup.storageKey, key));
      expect(job?.attempts).toBe(1);
      expect(job!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(await db.select().from(items).where(eq(items.id, f.parent))).toEqual([]);
      await rm(path, { recursive: true });
      await writeFile(path, "recovered file");
      await db.update(uploadCleanup).set({ nextAttemptAt: new Date(0) }).where(eq(uploadCleanup.storageKey, key));
      await Promise.all([drainUploadCleanup(), drainUploadCleanup()]);
      expect(await readUpload(key)).toBeNull();
      expect(await db.select().from(uploadCleanup).where(eq(uploadCleanup.storageKey, key))).toEqual([]);
    } finally { warn.mockRestore(); }
  });

  it("rejects new orphaned subitems at the database boundary", async () => {
    const f = await fixture();
    await expect(db.update(items).set({ parentItemId: nanoid() }).where(eq(items.id, f.child))).rejects.toThrow();
  });
});
