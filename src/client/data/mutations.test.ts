import { describe, expect, it } from "vitest";

import type { Item } from "./api";
import { optimisticCreate } from "./mutations";

const item = (id: string, over: Partial<Item> = {}): Item => ({ id, projectId: "p", listId: "l1", parentItemId: null, keyNumber: 1, title: id, description: null, status: null, priorStatus: null, done: false, priority: null, startDate: null, dueDate: null, dueTime: null, repeatRule: null, repeatCount: 0, cover: null, notification: null, unread: false, position: 0, createdBy: null, archivedAt: null, deletedAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "", labelIds: [], assigneeIds: [], attachmentCount: 0, ...over }) as Item;
const order = (items: Item[], listId = "l1") => items.filter((it) => it.listId === listId && !it.parentItemId).sort((a, b) => a.position - b.position).map((it) => `${it.id}@${it.position}`);
const dest = { listId: "l1", projectId: "p", statusRole: null };

describe("optimisticCreate", () => {
  // Gaps and ties, as archived or concurrently placed items leave them; the server renumbers the same way.
  const items = [item("b", { position: 4 }), item("a", { position: 1 }), item("c", { position: 4, createdAt: "2026-09-02T00:00:00.000Z" }), item("x", { listId: "l2", position: 0 }), item("sub", { parentItemId: "a", position: 9 })];

  it("places at the top or the end and renumbers the list's top-level items like the API", () => {
    expect(order(optimisticCreate(items, { id: "new", title: "New", position: "top" }, dest))).toEqual(["new@0", "a@1", "b@2", "c@3"]);
    expect(order(optimisticCreate(items, { id: "new", title: "New" }, dest))).toEqual(["a@0", "b@1", "c@2", "new@3"]);
    expect(order(optimisticCreate([], { id: "new", title: "New", position: "top" }, dest))).toEqual(["new@0"]);
    expect(order(optimisticCreate(items, { id: "new", title: "New" }, dest), "l2")).toEqual(["x@0"]);
  });

  it("takes the Status from the list's role, done in a Done list, unless one is given", () => {
    const made = (statusRole: Item["status"], status?: Item["status"]) => optimisticCreate([], { id: "new", title: "New", status }, { ...dest, statusRole }).at(-1)!;
    expect(made("DOING")).toMatchObject({ status: "DOING", done: false });
    expect(made("DONE")).toMatchObject({ status: "DONE", done: true, priorStatus: null });
    expect(made("DONE", "TODO")).toMatchObject({ status: "TODO", done: false });
    expect(made(null)).toMatchObject({ status: null, done: false });
  });

  it("puts subitems last without renumbering the list", () => {
    const next = optimisticCreate(items, { id: "s2", title: "Sub", parentItemId: "a" }, dest);
    expect(next.find((it) => it.id === "s2")).toMatchObject({ parentItemId: "a", position: 10 });
    expect(order(next)).toEqual(order(items));
  });
});
