import { and, eq, inArray, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { groups, itemAssignees, itemLabels, itemRelations, items, itemWatchers, labels, lists, members, projects, users } from "../db/schema";
import { readableItemIds } from "../access";
import { moveItem } from "./items";

/** Two projects in different groups; the family's numbers 1–2 are already used in the destination. */
async function fixture() {
  const owner = nanoid(), outsider = nanoid();
  await db.insert(users).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: outsider, name: "Source-only member", email: `${outsider}@example.test` },
  ]);
  const srcGroup = nanoid(), destGroup = nanoid(), src = nanoid(), dest = nanoid(), srcList = nanoid(), destList = nanoid();
  await db.insert(groups).values([
    { id: srcGroup, name: "Source", keyPrefix: "SRC", ownerId: owner, nextItemNumber: 10 },
    { id: destGroup, name: "Destination", keyPrefix: "DST", ownerId: owner, nextItemNumber: 3 },
  ]);
  await db.insert(projects).values([
    { id: src, groupId: srcGroup, name: "Source" },
    { id: dest, groupId: destGroup, name: "Destination" },
  ]);
  await db.insert(lists).values([
    { id: srcList, projectId: src, name: "Source list" },
    { id: destList, projectId: dest, name: "Destination list" },
  ]);
  await db.insert(members).values([
    { projectId: src, userId: owner, role: "owner" },
    { projectId: src, userId: outsider, role: "editor" },
    { projectId: dest, userId: owner, role: "owner" },
  ]);
  const parent = nanoid(), child = nanoid(), stay = nanoid(), occupiedA = nanoid(), occupiedB = nanoid();
  await db.insert(items).values([
    { id: parent, projectId: src, listId: srcList, title: "Parent", keyNumber: 1 },
    { id: child, projectId: src, listId: srcList, title: "Child", keyNumber: 2, parentItemId: parent },
    { id: stay, projectId: src, listId: srcList, title: "Stays behind", keyNumber: 3, position: 1 },
    { id: occupiedA, projectId: dest, listId: destList, title: "DST-1", keyNumber: 1 },
    { id: occupiedB, projectId: dest, listId: destList, title: "DST-2", keyNumber: 2, position: 1 },
  ]);
  const bug = nanoid(), docs = nanoid(), destBug = nanoid();
  await db.insert(labels).values([
    { id: bug, projectId: src, name: "Bug", color: "red" },
    { id: docs, projectId: src, name: "Docs", color: "blue" },
    { id: destBug, projectId: dest, name: "bug", color: "orange" },
  ]);
  await db.insert(itemLabels).values([{ itemId: parent, labelId: bug }, { itemId: child, labelId: docs }]);
  await db.insert(itemAssignees).values([{ itemId: parent, userId: owner }, { itemId: child, userId: outsider }]);
  await db.insert(itemWatchers).values([{ itemId: parent, userId: owner }, { itemId: parent, userId: outsider }]);
  await db.insert(itemRelations).values([
    { itemId: parent, targetId: child, type: "related" },
    { itemId: child, targetId: stay, type: "blocked_by" },
  ]);
  return { owner, outsider, src, dest, srcList, destList, parent, child, stay, bug, docs, destBug };
}

const snapshot = async (ids: string[]) => ({
  items: (await db.select({ id: items.id, projectId: items.projectId, listId: items.listId, keyNumber: items.keyNumber, parentItemId: items.parentItemId, position: items.position }).from(items).where(inArray(items.id, ids))).sort((a, b) => a.id.localeCompare(b.id)),
  labels: (await db.select().from(itemLabels).where(inArray(itemLabels.itemId, ids))).sort((a, b) => (a.itemId + a.labelId).localeCompare(b.itemId + b.labelId)),
  assignees: (await db.select().from(itemAssignees).where(inArray(itemAssignees.itemId, ids))).sort((a, b) => (a.itemId + a.userId).localeCompare(b.itemId + b.userId)),
  watchers: (await db.select().from(itemWatchers).where(inArray(itemWatchers.itemId, ids))).sort((a, b) => (a.itemId + a.userId).localeCompare(b.itemId + b.userId)),
  relations: (await db.select({ itemId: itemRelations.itemId, targetId: itemRelations.targetId, type: itemRelations.type }).from(itemRelations).where(or(inArray(itemRelations.itemId, ids), inArray(itemRelations.targetId, ids)))).sort((a, b) => (a.itemId + a.targetId).localeCompare(b.itemId + b.targetId)),
});

describe("cross-project moves", () => {
  it("carries the family under the destination's rules and Undo restores it exactly", async () => {
    const f = await fixture();
    const ids = [f.parent, f.child, f.stay];
    const before = await snapshot(ids);

    const moved = await moveItem(f.parent, { listId: f.destList }, f.owner);
    expect(moved?.changed).toMatchObject({ project: true, key: "DST-3", subitems: 1, labelsCreated: ["Docs"], assigneesRemoved: 1, watchersRemoved: 1, relationsRemoved: 1 });
    const family = await db.select().from(items).where(inArray(items.id, [f.parent, f.child]));
    expect(family.every((it) => it.projectId === f.dest && it.listId === f.destList)).toBe(true);
    // Keys are unique in the destination: issued from its group, not carried from the source's numbering.
    expect(family.map((it) => it.keyNumber).sort()).toEqual([3, 4]);
    expect((await db.select({ n: groups.nextItemNumber }).from(groups).where(eq(groups.keyPrefix, "DST")))[0]?.n).toBe(5);
    // Labels map to the destination's by name; a missing one is created there.
    const destLabels = await db.select().from(labels).where(eq(labels.projectId, f.dest));
    const docsCopy = destLabels.find((l) => l.name === "Docs");
    expect(docsCopy).toMatchObject({ color: "blue" });
    expect((await db.select().from(itemLabels).where(inArray(itemLabels.itemId, [f.parent, f.child]))).map((l) => l.labelId).sort()).toEqual([f.destBug, docsCopy!.id].sort());
    // Only destination members stay assigned or watching; only same-project relations remain.
    expect(await db.select().from(itemAssignees).where(inArray(itemAssignees.itemId, [f.parent, f.child]))).toEqual([{ itemId: f.parent, userId: f.owner }]);
    expect(await db.select().from(itemWatchers).where(inArray(itemWatchers.itemId, [f.parent, f.child]))).toEqual([{ itemId: f.parent, userId: f.owner }]);
    expect(await db.select({ itemId: itemRelations.itemId, targetId: itemRelations.targetId }).from(itemRelations).where(or(inArray(itemRelations.itemId, ids), inArray(itemRelations.targetId, ids)))).toEqual([{ itemId: f.parent, targetId: f.child }]);

    const undone = await moveItem(f.parent, { listId: f.srcList, position: 0, restore: moved!.undo! }, f.owner);
    expect(undone?.changed.key).toBe("SRC-1");
    expect(await snapshot(ids)).toEqual(before);
    // The label the move created is gone again; the destination's own label is untouched.
    expect((await db.select().from(labels).where(eq(labels.projectId, f.dest))).map((l) => l.id)).toEqual([f.destBug]);
  });

  it("promotes a moved subitem and nests it again on Undo", async () => {
    const f = await fixture();
    const moved = await moveItem(f.child, { listId: f.destList }, f.owner);
    expect((await db.select().from(items).where(eq(items.id, f.child)))[0]).toMatchObject({ projectId: f.dest, parentItemId: null });
    await moveItem(f.child, { listId: f.srcList, position: 0, restore: moved!.undo! }, f.owner);
    expect((await db.select().from(items).where(eq(items.id, f.child)))[0]).toMatchObject({ projectId: f.src, parentItemId: f.parent, keyNumber: 2 });
    expect((await db.select().from(itemRelations).where(and(eq(itemRelations.itemId, f.child), eq(itemRelations.targetId, f.stay))))).toHaveLength(1);
  });

  it("ignores restore entries the destination would not allow", async () => {
    const f = await fixture();
    const moved = await moveItem(f.parent, { listId: f.destList }, f.owner);
    // A forged hand-back: the outsider is not a member here, and the key is already taken.
    await moveItem(f.parent, { listId: f.destList, restore: { ...moved!.undo!, assignees: [{ itemId: f.parent, userId: f.outsider }] } }, f.owner);
    expect((await db.select().from(itemAssignees).where(eq(itemAssignees.itemId, f.parent))).map((a) => a.userId)).toEqual([f.owner]);
    const forged = await moveItem(f.stay, { listId: f.destList, restore: { keys: [{ itemId: f.stay, keyNumber: 1 }], labels: [], assignees: [], watchers: [], relations: [], createdLabelIds: [] } }, f.owner);
    expect(forged?.item.keyNumber).not.toBe(1);
  });

  it("never describes a related item the viewer cannot read", async () => {
    const f = await fixture();
    const scopes = await db.select({ id: items.id, projectId: items.projectId, listId: items.listId }).from(items).where(inArray(items.id, [f.parent, f.stay]));
    // The outsider is a member of the source only; a private destination hides the moved item from them.
    await moveItem(f.parent, { listId: f.destList }, f.owner);
    const moved = await db.select({ id: items.id, projectId: items.projectId, listId: items.listId }).from(items).where(inArray(items.id, [f.parent, f.stay]));
    expect(await readableItemIds({ userId: f.outsider, inboxListId: "none" }, scopes)).toEqual(new Set([f.parent, f.stay]));
    expect(await readableItemIds({ userId: f.outsider, inboxListId: "none" }, moved)).toEqual(new Set([f.stay]));
    expect(await readableItemIds({ userId: f.owner, inboxListId: "none" }, moved)).toEqual(new Set([f.parent, f.stay]));
    await db.update(projects).set({ visibility: "shared" }).where(eq(projects.id, f.dest));
    expect(await readableItemIds({ userId: f.outsider, inboxListId: "none" }, moved)).toEqual(new Set([f.parent, f.stay]));
    expect(await readableItemIds(null, moved)).toEqual(new Set());
  });
});
