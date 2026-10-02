import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { activity, groups, items, lists, members, projects, users } from "../db/schema";
import { moveItem, updateItem } from "./items";
import { importProject, updateList } from "./projects";

async function fixture() {
  const userId = nanoid(), groupId = nanoid(), projectId = nanoid(), todo = nanoid(), doneList = nanoid();
  await db.insert(users).values({ id: userId, name: "Completion test", email: `${userId}@example.test` });
  await db.insert(groups).values({ id: groupId, name: "Test", keyPrefix: "CMP", ownerId: userId });
  await db.insert(projects).values({ id: projectId, groupId, name: "Completion test" });
  await db.insert(lists).values([
    { id: todo, projectId, name: "To-do", statusRole: "TODO", position: 0 },
    { id: doneList, projectId, name: "Done", statusRole: "DONE", position: 1 },
  ]);
  await db.insert(members).values({ projectId, userId, role: "owner" });
  const recurring = nanoid(), plain = nanoid();
  await db.insert(items).values([
    { id: recurring, projectId, listId: todo, title: "Weekly check", status: "DOING", dueDate: "2026-09-12", repeatRule: { freq: "weekly", ends: { type: "after", count: 2 } } },
    { id: plain, projectId, listId: todo, title: "Plain", status: "DOING" },
  ]);
  return { userId, groupId, projectId, todo, doneList, recurring, plain };
}
const row = async (id: string) => (await db.select().from(items).where(eq(items.id, id)))[0]!;
const state = ({ status, priorStatus, done, dueDate, repeatCount }: typeof items.$inferSelect) => ({ status, priorStatus, done, dueDate, repeatCount });

describe("completion on the server", () => {
  it("advances a recurring item once per occurrence and finishes it on the last", async () => {
    const f = await fixture();
    const first = await updateItem(f.recurring, { done: true, ifDue: "2026-09-12" }, {}, {}, f.userId);
    expect(first?.occurrence).toEqual({ from: "2026-09-12", next: "2026-09-19", count: 1, ended: false });
    expect(state(await row(f.recurring))).toEqual({ status: "DOING", priorStatus: null, done: false, dueDate: "2026-09-19", repeatCount: 1 });
    // The same request again (a retry after a lost response) finds the occurrence already completed.
    const retry = await updateItem(f.recurring, { done: true, ifDue: "2026-09-12" }, {}, {}, f.userId);
    expect(retry?.occurrence).toBeNull();
    expect(state(await row(f.recurring))).toMatchObject({ dueDate: "2026-09-19", repeatCount: 1 });
    const last = await updateItem(f.recurring, { done: true, ifDue: "2026-09-19" }, {}, {}, f.userId);
    expect(last?.occurrence).toEqual({ from: "2026-09-19", next: null, count: 2, ended: true });
    expect(state(await row(f.recurring))).toEqual({ status: "DONE", priorStatus: "DOING", done: true, dueDate: "2026-09-19", repeatCount: 2 });
    // Undo of the last occurrence reopens with the remembered Status.
    await updateItem(f.recurring, { done: false }, { repeatCount: 1 }, {}, f.userId);
    expect(state(await row(f.recurring))).toEqual({ status: "DOING", priorStatus: null, done: false, dueDate: "2026-09-19", repeatCount: 1 });
    const log = await db.select({ text: activity.text }).from(activity).where(eq(activity.itemId, f.recurring));
    expect(log.map((l) => l.text).sort()).toEqual(["completed “Weekly check”", "completed “Weekly check” — it repeats", "reopened “Weekly check”"]);
  });

  it("serializes concurrent completions of one occurrence", async () => {
    const f = await fixture();
    const results = await Promise.all([1, 2, 3].map(() => updateItem(f.recurring, { done: true, ifDue: "2026-09-12" }, {}, {}, f.userId)));
    expect(results.filter((r) => r?.occurrence)).toHaveLength(1);
    expect(state(await row(f.recurring))).toMatchObject({ dueDate: "2026-09-19", repeatCount: 1 });
  });

  it("treats a Done Status as literal and keeps the invariant on every path", async () => {
    const f = await fixture();
    await updateItem(f.recurring, { status: "DONE" }, {}, {}, f.userId);
    expect(state(await row(f.recurring))).toEqual({ status: "DONE", priorStatus: "DOING", done: true, dueDate: "2026-09-12", repeatCount: 0 });
    await updateItem(f.recurring, { status: "TODO" }, {}, {}, f.userId);
    expect(state(await row(f.recurring))).toMatchObject({ status: "TODO", priorStatus: null, done: false });
    // Into the Done list: done, remembering where it came from; out again: the list's role, open.
    await moveItem(f.plain, { listId: f.doneList }, f.userId);
    expect(state(await row(f.plain))).toMatchObject({ status: "DONE", priorStatus: "DOING", done: true });
    await updateItem(f.plain, { done: false }, {}, {}, f.userId);
    expect(state(await row(f.plain))).toMatchObject({ status: "DOING", priorStatus: null, done: false });
    await moveItem(f.plain, { listId: f.todo }, f.userId);
    await moveItem(f.plain, { listId: f.doneList }, f.userId);
    await moveItem(f.plain, { listId: f.todo }, f.userId);
    expect(state(await row(f.plain))).toMatchObject({ status: "TODO", priorStatus: null, done: false });
  });

  it("applies a list's new role to existing items by the same rule", async () => {
    const f = await fixture();
    await updateList(f.todo, { statusRole: "DONE", applyToExisting: true });
    expect([state(await row(f.recurring)), state(await row(f.plain))].map(({ status, priorStatus, done }) => ({ status, priorStatus, done }))).toEqual([
      { status: "DONE", priorStatus: "DOING", done: true },
      { status: "DONE", priorStatus: "DOING", done: true },
    ]);
    await updateList(f.todo, { statusRole: "BACKLOG", applyToExisting: true });
    expect(state(await row(f.plain))).toMatchObject({ status: "BACKLOG", priorStatus: null, done: false });
  });

  it("imports done items so that reopening restores the list's Status", async () => {
    const f = await fixture();
    const { project } = await importProject({ id: nanoid(), groupId: f.groupId, name: "Imported", plan: { name: "Imported", lists: [
      { name: "Doing", statusRole: "DOING", items: [{ title: "Finished", done: true, labels: [], subitems: [{ title: "Sub", done: true }] }] },
      { name: "Done", statusRole: "DONE", items: [{ title: "In Done", done: false, labels: [], subitems: [] }] },
    ], labels: [], warnings: [] } }, f.userId);
    const rows = await db.select().from(items).where(inArray(items.projectId, [project.id]));
    const by = (t: string) => rows.find((r) => r.title === t)!;
    expect(state(by("Finished"))).toMatchObject({ status: "DONE", priorStatus: "DOING", done: true });
    expect(state(by("Sub"))).toMatchObject({ status: "DONE", priorStatus: "DOING", done: true });
    expect(state(by("In Done"))).toMatchObject({ status: "DONE", priorStatus: null, done: true });
    await updateItem(by("Finished").id, { done: false }, {}, {}, f.userId);
    expect(state(await row(by("Finished").id))).toMatchObject({ status: "DOING", done: false });
  });
});
