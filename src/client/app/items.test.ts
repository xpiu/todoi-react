import { describe, expect, it } from "vitest";

import type { Item, Label } from "../data/api";
import { coverOf, dueStateOf, keyOf, rowsForList } from "./items";

const item = (over: Partial<Item>): Item => ({ id: "x", projectId: "p", listId: "l1", parentItemId: null, keyNumber: 7, title: "T", description: null, status: "TODO", priorStatus: null, done: false, priority: null, startDate: null, dueDate: null, dueTime: null, repeatRule: null, repeatCount: 0, cover: null, notification: null, unread: false, position: 0, createdBy: null, archivedAt: null, deletedAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "", labelIds: [], assigneeIds: [], attachmentCount: 0, ...over }) as Item;

describe("item helpers", () => {
  it("derives due state from today and done", () => {
    expect(dueStateOf({ dueDate: "2026-09-30", done: false }, "2026-10-01")).toBe("overdue");
    expect(dueStateOf({ dueDate: "2026-10-01", done: false }, "2026-10-01")).toBe("default");
    expect(dueStateOf({ dueDate: "2026-09-30", done: true }, "2026-10-01")).toBe("complete");
  });
  it("formats keys only with a prefix", () => {
    expect(keyOf({ keyNumber: 12 }, "MP")).toBe("MP-12");
    expect(keyOf({ keyNumber: 12 }, "")).toBeUndefined();
    expect(keyOf({ keyNumber: null }, "MP")).toBeUndefined();
  });
  it("resolves covers by attachment, sample or colour", () => {
    expect(coverOf(undefined)).toBeNull();
    expect(coverOf({ cover: { color: "blue" } })).toEqual({ color: "var(--label-blue)" });
    expect(coverOf({ cover: { attachmentId: "a1" } })).toMatchObject({ attachmentId: "a1" });
    expect(coverOf({ cover: { sample: "nope" } })).toBeNull();
  });
  it("builds rows per list with subitems, labels, people and order", () => {
    const labels = [{ id: "lb", name: "design", color: "pink" }] as Label[];
    const people = [{ id: "u1", name: "Lena", avatarColor: "teal" }];
    const items = [item({ id: "b", position: 1, title: "Second" }), item({ id: "a", position: 0, title: "First", labelIds: ["lb"], assigneeIds: ["u1"], dueDate: "2026-09-30", priority: "HIGH", attachmentCount: 2 }), item({ id: "s", parentItemId: "a", title: "Sub" }), item({ id: "o", listId: "l2", title: "Other" })];
    const rows = rowsForList(items, "l1", { prefix: "MP", labels, people, today: "2026-10-01" });
    expect(rows.map((r) => r.title)).toEqual(["First", "Second"]);
    expect(rows[0]).toMatchObject({ itemId: "MP-7", dueState: "overdue", priority: "High", attachments: 2, labels: [{ color: "pink", text: "design" }], assignees: [{ name: "Lena", color: "var(--label-teal)" }] });
    expect(rows[0]!.subitems.map((s) => s.title)).toEqual(["Sub"]);
    const sorted = rowsForList(items, "l1", { prefix: "MP", labels, people, today: "2026-10-01", order: (a, b) => b.title.localeCompare(a.title) });
    expect(sorted.map((r) => r.title)).toEqual(["Second", "First"]);
  });
});
