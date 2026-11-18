import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { activity, groups, items, lists, members, projects, users } from "../db/schema";
import { ApiFailure } from "../errors";
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
    // The last occurrence is a real completion, so "Checked items move to Done" takes it to the Done list and back.
    expect(log.map((l) => l.text).sort()).toEqual(["completed “Weekly check” — it repeats", "completed “Weekly check” — moved from To-do to Done", "reopened “Weekly check” — moved back to To-do"]);
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

describe("checked items move to Done", () => {
  const place = async (id: string) => (({ listId, priorListId, status, done }) => ({ listId, priorListId, status, done }))(await row(id));
  const logOf = async (id: string) => (await db.select({ text: activity.text }).from(activity).where(eq(activity.itemId, id))).map((l) => l.text).sort();

  it("moves a checked item to the Done list in a linked project and back when unchecked", async () => {
    const f = await fixture();
    const sub = nanoid();
    await db.insert(items).values({ id: sub, projectId: f.projectId, listId: f.todo, parentItemId: f.plain, title: "Sub" });
    await updateItem(f.plain, { done: true }, {}, {}, f.userId);
    expect(await place(f.plain)).toEqual({ listId: f.doneList, priorListId: f.todo, status: "DONE", done: true });
    // Subitems follow their item's list.
    expect((await row(sub)).listId).toBe(f.doneList);
    await updateItem(f.plain, { done: false }, {}, {}, f.userId);
    expect(await place(f.plain)).toEqual({ listId: f.todo, priorListId: null, status: "DOING", done: false });
    expect((await row(sub)).listId).toBe(f.todo);
    expect(await logOf(f.plain)).toEqual(["completed “Plain” — moved from To-do to Done", "reopened “Plain” — moved back to To-do"]);
  });

  it("checks a subitem in place and never moves a Status edit", async () => {
    const f = await fixture();
    const sub = nanoid();
    await db.insert(items).values({ id: sub, projectId: f.projectId, listId: f.todo, parentItemId: f.plain, title: "Sub" });
    await updateItem(sub, { done: true }, {}, {}, f.userId);
    expect(await place(sub)).toMatchObject({ listId: f.todo, done: true });
    await updateItem(f.plain, { status: "DONE" }, {}, {}, f.userId);
    expect(await place(f.plain)).toMatchObject({ listId: f.todo, status: "DONE", done: true });
  });

  it("follows Link lists with statuses until it is set, and an explicit setting overrides it", async () => {
    const f = await fixture();
    await db.update(projects).set({ linkStatuses: false }).where(eq(projects.id, f.projectId));
    await updateItem(f.plain, { done: true }, {}, {}, f.userId);
    expect(await place(f.plain)).toMatchObject({ listId: f.todo, done: true });
    await updateItem(f.plain, { done: false }, {}, {}, f.userId);
    await db.update(projects).set({ checkedMove: true }).where(eq(projects.id, f.projectId));
    await updateItem(f.plain, { done: true }, {}, {}, f.userId);
    expect(await place(f.plain)).toMatchObject({ listId: f.doneList, done: true });
    await db.update(projects).set({ linkStatuses: true, checkedMove: false }).where(eq(projects.id, f.projectId));
    // Off: unchecking leaves it in Done.
    await updateItem(f.plain, { done: false }, {}, {}, f.userId);
    expect(await place(f.plain)).toMatchObject({ listId: f.doneList, done: false });
  });

  it("keeps a recurring item that rolls on, skips a hidden Done list, and forgets the way back after another move", async () => {
    const f = await fixture();
    await updateItem(f.recurring, { done: true, ifDue: "2026-09-12" }, {}, {}, f.userId);
    expect(await place(f.recurring)).toMatchObject({ listId: f.todo, done: false });
    await db.update(lists).set({ hidden: true }).where(eq(lists.id, f.doneList));
    await updateItem(f.plain, { done: true }, {}, {}, f.userId);
    expect(await place(f.plain)).toMatchObject({ listId: f.todo, done: true });
    await updateItem(f.plain, { done: false }, {}, {}, f.userId);
    await db.update(lists).set({ hidden: false }).where(eq(lists.id, f.doneList));
    await updateItem(f.plain, { done: true }, {}, {}, f.userId);
    await moveItem(f.plain, { listId: f.doneList, position: 0 }, f.userId);
    expect(await place(f.plain)).toMatchObject({ listId: f.doneList, priorListId: null });
    await updateItem(f.plain, { done: false }, {}, {}, f.userId);
    expect(await place(f.plain)).toMatchObject({ listId: f.doneList, done: false });
  });
});

describe("item dates on the server", () => {
  it("checks a one-field change against the dates the item keeps, and writes nothing when it fails", async () => {
    const f = await fixture();
    await updateItem(f.plain, {}, { startDate: "2026-09-10", dueDate: "2026-09-12", dueTime: "09:00" }, {}, f.userId);
    await expect(updateItem(f.plain, {}, { startDate: "2026-09-13" }, {}, f.userId)).rejects.toThrow(ApiFailure);
    await expect(updateItem(f.plain, {}, { dueDate: "2026-09-09" }, {}, f.userId)).rejects.toThrow("The start date must be on or before the due date");
    expect(await row(f.plain)).toMatchObject({ startDate: "2026-09-10", dueDate: "2026-09-12", dueTime: "09:00" });
    // A whole-range move (the calendar drag) changes both at once.
    await updateItem(f.plain, {}, { startDate: "2026-09-13", dueDate: "2026-09-15" }, {}, f.userId);
    // Clearing the due drops its time; the start alone is fine.
    await updateItem(f.plain, {}, { dueDate: null }, {}, f.userId);
    expect(await row(f.plain)).toMatchObject({ startDate: "2026-09-13", dueDate: null, dueTime: null });
  });

  it("leaves an item whose stored dates break the rules editable in its other fields", async () => {
    const f = await fixture();
    await db.update(items).set({ startDate: "2026-06-28", dueDate: "2020-01-10" }).where(eq(items.id, f.plain));
    await updateItem(f.plain, {}, { title: "Renamed" }, {}, f.userId);
    expect(await row(f.plain)).toMatchObject({ title: "Renamed" });
  });

  it("moves a recurring range's start with its due", async () => {
    const f = await fixture();
    await updateItem(f.recurring, {}, { startDate: "2026-09-10" }, {}, f.userId);
    await updateItem(f.recurring, { done: true, ifDue: "2026-09-12" }, {}, {}, f.userId);
    expect(await row(f.recurring)).toMatchObject({ startDate: "2026-09-17", dueDate: "2026-09-19" });
  });
});
