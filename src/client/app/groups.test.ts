import { describe, expect, it } from "vitest";

import type { Item, Label } from "../data/api";
import { dueBucket, GROUP_NONE, groupItems } from "./groups";

const label = (id: string, name: string, color = "blue"): Label => ({ id, projectId: "p", name, color, createdAt: "", updatedAt: "" }) as Label;
const item = (over: Partial<Item>): Item =>
  ({ id: "x", projectId: "p", listId: "l", parentItemId: null, keyNumber: 1, title: "t", description: null, status: null, priorStatus: null, done: false, priority: null, startDate: null, dueDate: null, dueTime: null, repeatRule: null, repeatCount: 0, cover: null, notification: null, unread: false, position: 0, createdBy: null, archivedAt: null, deletedAt: null, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "", labelIds: [], assigneeIds: [], ...over }) as Item;
// 2026-10-01 is a Thursday: this week runs to Sunday 2026-10-04.
const ctx = { today: "2026-10-01", labels: [label("l1", "design"), label("l2", "shop", "red")], people: [{ id: "u1", name: "Flo" }, { id: "u2", name: "Sam", image: "/a.png", avatarColor: "teal" }] };
const shape = (groups: ReturnType<typeof groupItems>) => groups.map((g) => [g.id, g.items.map((x) => x.id)]);

describe("dueBucket", () => {
  it("sorts a date into Overdue, Today, This week, Later, No date or Earlier", () => {
    expect(dueBucket("2026-09-30", false, ctx.today)).toBe("overdue");
    expect(dueBucket("2026-09-30", true, ctx.today)).toBe("earlier");
    expect(dueBucket("2026-10-01", true, ctx.today)).toBe("today");
    expect(dueBucket("2026-10-04", false, ctx.today)).toBe("week");
    expect(dueBucket("2026-10-05", false, ctx.today)).toBe("later");
    expect(dueBucket(null, false, ctx.today)).toBe("none");
  });
});

describe("groupItems", () => {
  it("groups by Status in STATUSES order, a done item without one under Done, No status last", () => {
    const items = [item({ id: "a", status: "DOING" }), item({ id: "b" }), item({ id: "c", done: true }), item({ id: "d", status: "NEW" })];
    expect(shape(groupItems(items, "status", ctx))).toEqual([["NEW", ["d"]], ["DOING", ["a"]], ["DONE", ["c"]], [GROUP_NONE, ["b"]]]);
    const all = groupItems(items, "status", { ...ctx, showEmpty: true });
    expect(all.map((g) => g.label)).toEqual(["New", "Backlog", "To-do", "Doing", "Done", "No status"]);
    // "No status" only shows while it holds items, and never takes a drop
    expect(groupItems([items[0]!], "status", { ...ctx, showEmpty: true }).some((g) => g.id === GROUP_NONE)).toBe(false);
    expect(all.find((g) => g.id === GROUP_NONE)?.accepts).toBe(false);
  });
  it("groups by priority with the flag colours and No priority last", () => {
    const groups = groupItems([item({ id: "a", priority: "LOW" }), item({ id: "b" }), item({ id: "c", priority: "URGENT" })], "priority", ctx);
    expect(shape(groups)).toEqual([["URGENT", ["c"]], ["LOW", ["a"]], [GROUP_NONE, ["b"]]]);
    expect(groups[0]).toMatchObject({ label: "Urgent", icon: "flag", iconColor: "var(--label-red)" });
  });
  it("puts an item with two assignees or labels in both groups, keeping the order it came in", () => {
    const items = [item({ id: "a", assigneeIds: ["u2", "u1"], labelIds: ["l2"] }), item({ id: "b", assigneeIds: ["u1"], labelIds: ["l1", "l2"] }), item({ id: "c" })];
    const byPerson = groupItems(items, "assignee", ctx);
    expect(shape(byPerson)).toEqual([["u1", ["a", "b"]], ["u2", ["a"]], [GROUP_NONE, ["c"]]]);
    expect(byPerson[1]).toMatchObject({ label: "Sam", avatar: { name: "Sam", src: "/a.png", color: "var(--label-teal)" } });
    expect(byPerson[2]).toMatchObject({ label: "Unassigned", icon: "user-x" });
    const byLabel = groupItems(items, "label", ctx);
    expect(shape(byLabel)).toEqual([["l1", ["b"]], ["l2", ["a", "b"]], [GROUP_NONE, ["c"]]]);
    expect(byLabel[1]).toMatchObject({ label: "shop", color: "var(--label-red)" });
  });
  it("keeps a former member's items in their own group before Unassigned", () => {
    expect(shape(groupItems([item({ id: "a", assigneeIds: ["gone"] }), item({ id: "b" })], "assignee", ctx))).toEqual([["gone", ["a"]], [GROUP_NONE, ["b"]]]);
  });
  it("groups by Due bucket; Earlier only shows with items; range groups refuse", () => {
    const items = [item({ id: "a", dueDate: "2026-09-01" }), item({ id: "b", dueDate: "2026-10-01" }), item({ id: "c", dueDate: "2026-10-03" }), item({ id: "d", dueDate: "2026-11-01" }), item({ id: "e" }), item({ id: "f", dueDate: "2026-09-01", done: true })];
    const groups = groupItems(items, "due", ctx);
    expect(shape(groups)).toEqual([["overdue", ["a"]], ["today", ["b"]], ["week", ["c"]], ["later", ["d"]], ["none", ["e"]], ["earlier", ["f"]]]);
    expect(groups.filter((g) => g.accepts).map((g) => g.id)).toEqual(["today", "none"]);
    expect(groupItems([], "due", { ...ctx, showEmpty: true }).map((g) => g.label)).toEqual(["Overdue", "Today", "This week", "Later", "No date"]);
  });
});
