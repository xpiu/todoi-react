import { describe, expect, it } from "vitest";

import type { Item, Label } from "../data/api";
import { availableFilters, itemComparator, matchesFilters, nextSort, sortLists } from "./filters";

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
    const lists = [{ name: "To-do", count: 2 }, { name: "Doing", count: 5 }];
    expect(sortLists(lists, { key: "name", dir: "asc" }).map((l) => l.name)).toEqual(["Doing", "To-do"]);
    expect(sortLists(lists, { key: "count", dir: "desc" }).map((l) => l.name)).toEqual(["Doing", "To-do"]);
  });
});
