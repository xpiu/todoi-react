import { asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { attachments, comments, groups, itemAssignees, itemLabels, itemRelations, items, itemWatchers, labels, lists, members, projects, users } from "../db/schema";
import { duplicateItem } from "./items";

// A richly populated item in project A (owner + Sam), copied within A and into project B of another group
// (owner only, a "design" label of its own) — and into the owner's Inbox.
async function fixture() {
  const owner = nanoid(), sam = nanoid(), [ga, gb] = [nanoid(), nanoid()], [pa, pb] = [nanoid(), nanoid()];
  const [todo, done, arrivals, inbox] = [nanoid(), nanoid(), nanoid(), nanoid()];
  await db.insert(users).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: sam, name: "Sam", email: `${sam}@example.test` },
  ]);
  await db.insert(groups).values([
    { id: ga, name: "A", keyPrefix: "DPA", ownerId: owner, nextItemNumber: 10 },
    { id: gb, name: "B", keyPrefix: "DPB", ownerId: owner, nextItemNumber: 50 },
  ]);
  await db.insert(projects).values([{ id: pa, groupId: ga, name: "A" }, { id: pb, groupId: gb, name: "B", linkStatuses: true }]);
  await db.insert(lists).values([
    { id: todo, projectId: pa, name: "To-do", statusRole: "TODO", position: 0 },
    { id: done, projectId: pa, name: "Done", statusRole: "DONE", position: 1 },
    { id: arrivals, projectId: pb, name: "Arrivals", statusRole: "DOING", position: 0 },
    { id: inbox, projectId: null, userId: owner, name: "Inbox", position: 0 },
  ]);
  await db.insert(members).values([{ projectId: pa, userId: owner, role: "owner" }, { projectId: pa, userId: sam, role: "editor" }, { projectId: pb, userId: owner, role: "owner" }]);
  const [urgent, design, designB] = [nanoid(), nanoid(), nanoid()];
  await db.insert(labels).values([
    { id: urgent, projectId: pa, name: "Urgent", color: "red" },
    { id: design, projectId: pa, name: "Design", color: "teal" },
    { id: designB, projectId: pb, name: "design", color: "blue" },
  ]);
  const [rich, sub1, sub2, trashedSub, after, other] = [nanoid(), nanoid(), nanoid(), nanoid(), nanoid(), nanoid()];
  const attachment = nanoid();
  await db.insert(items).values([
    {
      id: rich, projectId: pa, listId: todo, keyNumber: 1, position: 0, title: "Rich", description: "**Notes**", status: "DOING", priority: "HIGH",
      startDate: "2026-10-12", dueDate: "2026-10-14", dueTime: "09:30", repeatRule: { freq: "weekly" }, repeatCount: 2, cover: { color: "teal" },
    },
    { id: after, projectId: pa, listId: todo, keyNumber: 2, position: 1, title: "After" },
    { id: other, projectId: pa, listId: todo, keyNumber: 3, position: 2, title: "Other" },
    { id: sub1, projectId: pa, listId: todo, parentItemId: rich, keyNumber: 4, position: 0, title: "First step", done: true, status: "DONE", priorStatus: "TODO" },
    { id: sub2, projectId: pa, listId: todo, parentItemId: rich, keyNumber: 5, position: 1, title: "Second step" },
    { id: trashedSub, projectId: pa, listId: todo, parentItemId: rich, keyNumber: 6, position: 2, title: "Trashed step", deletedAt: new Date() },
  ]);
  await db.insert(itemLabels).values([{ itemId: rich, labelId: urgent }, { itemId: rich, labelId: design }, { itemId: sub2, labelId: design }]);
  await db.insert(itemAssignees).values([{ itemId: rich, userId: owner }, { itemId: rich, userId: sam }, { itemId: sub2, userId: sam }]);
  await db.insert(itemWatchers).values({ itemId: rich, userId: sam });
  await db.insert(comments).values({ id: nanoid(), itemId: rich, authorId: sam, body: "Looks good" });
  await db.insert(attachments).values({ id: attachment, itemId: rich, name: "plan.pdf", storageKey: "x" });
  await db.insert(itemRelations).values({ itemId: rich, targetId: other, type: "related" });
  return { owner, sam, pa, pb, todo, done, arrivals, inbox, urgent, design, designB, rich, sub1, sub2, after, attachment };
}
type F = Awaited<ReturnType<typeof fixture>>;

async function copied(rootId: string) {
  const family = await db.select().from(items).where(inArray(items.id, [rootId, ...(await db.select({ id: items.id }).from(items).where(eq(items.parentItemId, rootId))).map((r) => r.id)])).orderBy(asc(items.position));
  const ids = family.map((r) => r.id);
  const labelRows = await db.select({ itemId: itemLabels.itemId, name: labels.name, projectId: labels.projectId }).from(itemLabels).innerJoin(labels, eq(labels.id, itemLabels.labelId)).where(inArray(itemLabels.itemId, ids));
  const people = await db.select().from(itemAssignees).where(inArray(itemAssignees.itemId, ids));
  family.sort((a, b) => Number(b.id === rootId) - Number(a.id === rootId));
  return family.map((r) => ({ ...r, labels: labelRows.filter((l) => l.itemId === r.id).map((l) => l.name).sort(), assignees: people.filter((p) => p.itemId === r.id).map((p) => p.userId) }));
}
const order = async (listId: string) => (await db.select({ title: items.title }).from(items).where(eq(items.listId, listId)).orderBy(asc(items.position))).filter((r) => r.title !== "Trashed step").map((r) => r.title);

describe("duplicating an item", () => {
  it("copies every included field and the live subitems, next to the original, and reports what stays behind", async () => {
    const f: F = await fixture();
    const id = nanoid();
    const result = await duplicateItem(f.rich, { id, listId: f.todo }, f.owner);
    expect(result?.report).toEqual({ subitems: 2, labelsCreated: [], labelsDropped: 0, assigneesDropped: 0, left: { comments: 1, attachments: 1, relations: 1 } });
    const [root, ...subs] = await copied(id);
    expect(root).toMatchObject({
      title: "Rich", description: "**Notes**", status: "DOING", done: false, priority: "HIGH", startDate: "2026-10-12", dueDate: "2026-10-14", dueTime: "09:30",
      repeatRule: { freq: "weekly" }, repeatCount: 2, cover: { color: "teal" }, projectId: f.pa, listId: f.todo, parentItemId: null, keyNumber: 10, labels: ["Design", "Urgent"],
    });
    expect(root!.assignees.sort()).toEqual([f.owner, f.sam].sort());
    expect(subs.map((s) => [s.title, s.done, s.status, s.priorStatus, s.parentItemId, s.keyNumber, s.labels, s.assignees])).toEqual([
      ["First step", true, "DONE", "TODO", id, 11, [], []],
      ["Second step", false, null, null, id, 12, ["Design"], [f.sam]],
    ]);
    // Beside the original; nothing else reordered.
    expect((await order(f.todo)).filter((t) => !["First step", "Second step"].includes(t))).toEqual(["Rich", "Rich", "After", "Other"]);
    // Comments, attachments, relations and watchers stay with the original.
    expect(await db.select().from(comments).where(eq(comments.itemId, id))).toHaveLength(0);
    expect(await db.select().from(attachments).where(eq(attachments.itemId, id))).toHaveLength(0);
    expect(await db.select().from(itemRelations).where(eq(itemRelations.itemId, id))).toHaveLength(0);
    expect(await db.select().from(itemWatchers).where(eq(itemWatchers.itemId, id))).toHaveLength(0);
  });

  it("into another project maps labels by name, keeps only members, takes the linked Status and new keys", async () => {
    const f: F = await fixture();
    await db.update(items).set({ cover: { attachmentId: f.attachment } }).where(eq(items.id, f.rich));
    const id = nanoid();
    const result = await duplicateItem(f.rich, { id, listId: f.arrivals }, f.owner);
    expect(result?.report).toMatchObject({ subitems: 2, labelsCreated: ["Urgent"], labelsDropped: 0, assigneesDropped: 1 });
    const [root, , second] = await copied(id);
    expect(root).toMatchObject({ projectId: f.pb, listId: f.arrivals, status: "DOING", keyNumber: 50, cover: null, labels: ["Urgent", "design"], assignees: [f.owner] });
    expect(second).toMatchObject({ projectId: f.pb, keyNumber: 52, labels: ["design"], assignees: [] });
    const destLabels = await db.select({ name: labels.name, projectId: labels.projectId }).from(labels).where(eq(labels.projectId, f.pb));
    expect(destLabels.map((l) => l.name).sort()).toEqual(["Urgent", "design"]);
    // The original is untouched.
    expect((await copied(f.rich))[0]).toMatchObject({ projectId: f.pa, keyNumber: 1, labels: ["Design", "Urgent"] });
  });

  it("into the Inbox drops labels and other people, and a subitem copied in place stays under its parent", async () => {
    const f: F = await fixture();
    const id = nanoid();
    const result = await duplicateItem(f.rich, { id, listId: f.inbox }, f.owner);
    expect(result?.report).toMatchObject({ labelsDropped: 2, assigneesDropped: 1 });
    expect((await copied(id))[0]).toMatchObject({ projectId: null, keyNumber: null, labels: [], assignees: [f.owner] });
    const subCopy = nanoid();
    await duplicateItem(f.sub2, { id: subCopy, listId: f.todo }, f.owner);
    const [row] = await db.select().from(items).where(eq(items.id, subCopy));
    expect(row).toMatchObject({ parentItemId: f.rich, title: "Second step", position: 3 });
  });
});
