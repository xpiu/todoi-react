import { describe, expect, it } from "vitest";

import type { Item, Label } from "../data/api";
import { addedHiddenNotice, availableFilters, hiddenReason, itemComparator, matchesFilters, nextSort, sortLists, weekRange } from "./filters";

const label = (id: string, name: string): Label => ({ id, projectId: "p", name, color: "blue", createdAt: "", updatedAt: "" }) as Label;
const item = (over: Partial<Item>): Item =>
  ({ id: "x", projectId: "p", listId: "l", parentItemId: null, keyNumber: 1, title: "t", description: null, status: null, priorStatus: null, done: false, priority: null, startDate: null, dueDate: null, dueTime: null, repeatRule: null, repeatCount: 0, cover: null, notification: null, unread: false, position: 0, createdBy: null, archivedAt: null, deletedAt: null, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "", labelIds: [], assigneeIds: [], ...over }) as Item;
const ctx = { labels: [label("l1", "design"), label("l2", "shop")], people: [{ id: "u1", name: "Flo" }], today: "2026-10-01" };

describe("matchesFilters", () => {
  it("ORs within a type and ANDs across types", () => {
    const it1 = item({ labelIds: ["l1"], dueDate: "2026-09-01" });
    expect(matchesFilters(it1, [{ type: "label", value: "design" }, { type: "label", value: "shop" }], ctx)).toBe(true);
    expect(matchesFilters(it1, [{ type: "label", value: "shop" }], ctx)).toBe(false);
    expect(matchesFilters(it1, [{ type: "label", value: "design" }, { type: "due", value: "Overdue" }], ctx)).toBe(true);
    expect(matchesFilters(item({ labelIds: ["l1"], dueDate: "2026-12-01" }), [{ type: "label", value: "design" }, { type: "due", value: "Overdue" }], ctx)).toBe(false);
  });
  it("treats done items as never overdue and Unassigned as no assignees", () => {
    expect(matchesFilters(item({ dueDate: "2026-09-01", done: true }), [{ type: "due", value: "Overdue" }], ctx)).toBe(false);
    expect(matchesFilters(item({}), [{ type: "assignee", value: "Unassigned" }], ctx)).toBe(true);
    expect(matchesFilters(item({ assigneeIds: ["u1"] }), [{ type: "assignee", value: "Flo" }], ctx)).toBe(true);
  });
  it("matches the four Due values in the person's day, Monday to Sunday weeks, ORed together", () => {
    // 2026-10-01 is a Thursday: its week runs Monday 2026-09-28 to Sunday 2026-10-04.
    expect(weekRange("2026-10-01")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekRange("2026-09-28")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekRange("2026-10-04")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    const due = (value: string) => [{ type: "due", value }];
    expect(matchesFilters(item({ dueDate: "2026-10-01" }), due("Today"), ctx)).toBe(true);
    expect(matchesFilters(item({ dueDate: "2026-10-01", done: true }), due("Today"), ctx)).toBe(true);
    expect(matchesFilters(item({ dueDate: "2026-10-02" }), due("Today"), ctx)).toBe(false);
    expect(matchesFilters(item({ dueDate: "2026-09-28", done: true }), due("This week"), ctx)).toBe(true);
    expect(matchesFilters(item({ dueDate: "2026-10-04" }), due("This week"), ctx)).toBe(true);
    expect(matchesFilters(item({ dueDate: "2026-10-05" }), due("This week"), ctx)).toBe(false);
    expect(matchesFilters(item({ dueDate: "2026-09-27" }), due("This week"), ctx)).toBe(false);
    expect(matchesFilters(item({}), due("No date"), ctx)).toBe(true);
    expect(matchesFilters(item({ dueDate: "2026-10-01" }), due("No date"), ctx)).toBe(false);
    expect(matchesFilters(item({}), [...due("Overdue"), ...due("No date")], ctx)).toBe(true);
    expect(matchesFilters(item({ dueDate: "2026-09-01" }), [...due("Overdue"), ...due("No date")], ctx)).toBe(true);
  });
  it("windows created / start dates and maps priority and status names", () => {
    expect(matchesFilters(item({}), [{ type: "created", value: "Last 30 days" }], ctx)).toBe(true);
    expect(matchesFilters(item({}), [{ type: "created", value: "Last 7 days" }], ctx)).toBe(false);
    expect(matchesFilters(item({ createdAt: "2026-07-01T00:00:00.000Z" }), [{ type: "created", value: "Older" }], ctx)).toBe(true);
    expect(matchesFilters(item({}), [{ type: "start", value: "No start date" }], ctx)).toBe(true);
    expect(matchesFilters(item({ priority: "HIGH" }), [{ type: "priority", value: "High" }], ctx)).toBe(true);
    expect(matchesFilters(item({}), [{ type: "priority", value: "None" }], ctx)).toBe(true);
    expect(matchesFilters(item({ done: true }), [{ type: "status", value: "Done" }], ctx)).toBe(true);
    expect(matchesFilters(item({ status: "DOING" }), [{ type: "status", value: "Doing" }], ctx)).toBe(true);
  });
  it("offers labels, people, and the fixed sections", () => {
    const av = availableFilters(ctx.labels, ctx.people);
    expect(av.filter((f) => f.type === "label").map((f) => f.value)).toEqual(["design", "shop"]);
    expect(av.filter((f) => f.type === "assignee").map((f) => f.value)).toEqual(["Flo", "Unassigned"]);
    expect(av.some((f) => f.type === "status" && f.value === "Backlog")).toBe(true);
    expect(av.filter((f) => f.type === "due").map((f) => f.value)).toEqual(["Overdue", "Today", "This week", "No date"]);
  });
});

describe("sort", () => {
  it("cycles: new key → natural direction, same key → reversed, none → cleared", () => {
    const s0 = { lists: null, items: null };
    const s1 = nextSort(s0, "items", "created");
    expect(s1.items).toEqual({ key: "created", dir: "desc" });
    expect(nextSort(s1, "items", "created").items).toEqual({ key: "created", dir: "asc" });
    expect(nextSort(s1, "items", "none").items).toBeNull();
  });
  it("sorts items with empty dates last and lists by name or count", () => {
    const a = item({ id: "a", dueDate: null, title: "b" }), b = item({ id: "b", dueDate: "2026-10-02", title: "a" }), c = item({ id: "c", dueDate: "2026-10-01", title: "c" });
    expect([a, b, c].sort(itemComparator({ key: "due", dir: "asc" })!).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect([a, b, c].sort(itemComparator({ key: "due", dir: "desc" })!).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect([a, b, c].sort(itemComparator({ key: "title", dir: "asc" })!).map((x) => x.id)).toEqual(["b", "a", "c"]);
    const sorted = (key: string, dir: "asc" | "desc", xs: Item[], people = ctx.people) => [...xs].sort(itemComparator({ key, dir }, { people })!).map((x) => x.id);
    // Updated: newest first by default, empty last both ways
    const u1 = item({ id: "u1", updatedAt: "2026-10-01T10:00:00.000Z" }), u2 = item({ id: "u2", updatedAt: "2026-10-02T10:00:00.000Z" }), u0 = item({ id: "u0", updatedAt: "" });
    expect(nextSort({ lists: null, items: null }, "items", "updated").items).toEqual({ key: "updated", dir: "desc" });
    expect(sorted("updated", "desc", [u1, u0, u2])).toEqual(["u2", "u1", "u0"]);
    expect(sorted("updated", "asc", [u0, u2, u1])).toEqual(["u1", "u2", "u0"]);
    // Assignee: the first assignee's name; unassigned last both ways
    const people = [{ id: "p1", name: "Ann" }, { id: "p2", name: "Zed" }];
    const ann = item({ id: "ann", assigneeIds: ["p1", "p2"] }), zed = item({ id: "zed", assigneeIds: ["p2"] }), none = item({ id: "none" });
    expect(sorted("assignee", "asc", [none, zed, ann], people)).toEqual(["ann", "zed", "none"]);
    expect(sorted("assignee", "desc", [none, ann, zed], people)).toEqual(["zed", "ann", "none"]);
    // Status: STATUSES order (New … Done); a done item without a Status reads as Done; no Status last both ways
    const sNew = item({ id: "new", status: "NEW" }), sDoing = item({ id: "doing", status: "DOING" }), sDone = item({ id: "done", done: true }), sNone = item({ id: "nostatus" });
    expect(sorted("status", "asc", [sNone, sDone, sDoing, sNew])).toEqual(["new", "doing", "done", "nostatus"]);
    expect(sorted("status", "desc", [sNone, sNew, sDoing, sDone])).toEqual(["done", "doing", "new", "nostatus"]);
    // Priority: no priority last both ways
    const pu = item({ id: "pu", priority: "URGENT" }), pl = item({ id: "pl", priority: "LOW" }), pn = item({ id: "pn" });
    expect(sorted("priority", "asc", [pn, pl, pu])).toEqual(["pu", "pl", "pn"]);
    expect(sorted("priority", "desc", [pn, pu, pl])).toEqual(["pl", "pu", "pn"]);
    const lists = [{ name: "To-do", count: 2 }, { name: "Doing", count: 5 }];
    expect(sortLists(lists, { key: "name", dir: "asc" }).map((l) => l.name)).toEqual(["Doing", "To-do"]);
    expect(sortLists(lists, { key: "count", dir: "desc" }).map((l) => l.name)).toEqual(["Doing", "To-do"]);
  });
});

describe("hiddenReason", () => {
  it("says why the view leaves an item out: completed items hidden first, then the filters", () => {
    expect(hiddenReason(item({ priority: "HIGH" }), [{ type: "priority", value: "High" }], ctx, false)).toBeNull();
    expect(hiddenReason(item({ priority: "LOW" }), [{ type: "priority", value: "High" }], ctx, true)).toBe("hidden by the current filters");
    expect(hiddenReason(item({ done: true, priority: "LOW" }), [{ type: "priority", value: "High" }], ctx, false)).toBe("completed items are hidden");
    expect(hiddenReason(item({ done: true }), [], ctx, true)).toBeNull();
  });
  it("makes the quick add's toast line, or none when the item shows", () => {
    expect(addedHiddenNotice("hidden by the current filters")).toBe("Added · hidden by the current filters");
    expect(addedHiddenNotice(null)).toBeNull();
  });
});
