import { describe, expect, it } from "vitest";

import type { Item, Label } from "../data/api";
import { dueBucket, GROUP_NONE, groupDrop, groupItems, groupPreset, withPreset } from "./groups";

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

describe("groupDrop", () => {
  const it0 = item({ assigneeIds: ["u1", "u2"], labelIds: ["l1"] });
  it("does nothing within one group", () => {
    expect(groupDrop("priority", it0, "HIGH", "HIGH", ctx)).toEqual({ ok: false, reason: null });
  });
  it("sets a Status, refuses No status", () => {
    expect(groupDrop("status", it0, "TODO", "DOING", ctx)).toEqual({ ok: true, patch: { status: "DOING" }, message: "Status set to Doing" });
    expect(groupDrop("status", it0, "TODO", GROUP_NONE, ctx)).toEqual({ ok: false, reason: "Every item needs a status. Drop it on a status instead." });
  });
  it("sets or clears the priority", () => {
    expect(groupDrop("priority", it0, GROUP_NONE, "URGENT", ctx)).toEqual({ ok: true, patch: { priority: "URGENT" }, message: "Priority set to Urgent" });
    expect(groupDrop("priority", it0, "URGENT", GROUP_NONE, ctx)).toEqual({ ok: true, patch: { priority: null }, message: "Priority cleared" });
  });
  it("swaps the source assignee or label for the target's and keeps the others; the none group removes the source", () => {
    expect(groupDrop("assignee", it0, "u1", "u3", ctx)).toMatchObject({ ok: true, patch: { assigneeIds: ["u2", "u3"] } });
    expect(groupDrop("assignee", it0, "u1", "u2", ctx)).toEqual({ ok: true, patch: { assigneeIds: ["u2"] }, message: "Assigned to Sam" });
    expect(groupDrop("assignee", it0, "u1", GROUP_NONE, ctx)).toEqual({ ok: true, patch: { assigneeIds: ["u2"] }, message: "Removed Flo" });
    expect(groupDrop("assignee", item({ assigneeIds: ["u1"] }), "u1", GROUP_NONE, ctx)).toEqual({ ok: true, patch: { assigneeIds: [] }, message: "Unassigned" });
    expect(groupDrop("assignee", item({}), GROUP_NONE, "u1", ctx)).toEqual({ ok: true, patch: { assigneeIds: ["u1"] }, message: "Assigned to Flo" });
    expect(groupDrop("label", it0, "l1", "l2", ctx)).toEqual({ ok: true, patch: { labelIds: ["l2"] }, message: "Label set to shop" });
    expect(groupDrop("label", it0, "l1", GROUP_NONE, ctx)).toEqual({ ok: true, patch: { labelIds: [] }, message: "Labels removed" });
    expect(groupDrop("label", item({ labelIds: ["l1", "l2"] }), "l1", GROUP_NONE, ctx)).toEqual({ ok: true, patch: { labelIds: ["l2"] }, message: "Removed label design" });
  });
  it("Due: Today sets today, No date clears; the range groups refuse with their reason", () => {
    expect(groupDrop("due", it0, "none", "today", ctx)).toEqual({ ok: true, patch: { dueDate: "2026-10-01" }, message: "Due date set to today" });
    expect(groupDrop("due", it0, "overdue", "none", ctx)).toEqual({ ok: true, patch: { dueDate: null }, message: "Due date cleared" });
    for (const [to, reason] of [
      ["overdue", "Overdue is not a date. Open the item to change its date."],
      ["week", "This week covers several days. Open the item to pick a date."],
      ["later", "Later covers many days. Open the item to pick a date."],
      ["earlier", "Earlier holds done items. Open the item to change its date."],
    ]) expect(groupDrop("due", it0, "today", to!, ctx)).toEqual({ ok: false, reason });
  });
});

describe("groupPreset", () => {
  it("gives a group's one value: Status, priority, member, label, today's date", () => {
    expect(groupPreset("status", "DOING", ctx)).toEqual({ status: "DOING" });
    expect(groupPreset("priority", "HIGH", ctx)).toEqual({ priority: "HIGH" });
    expect(groupPreset("assignee", "u2", ctx)).toEqual({ assigneeIds: ["u2"] });
    expect(groupPreset("label", "l1", ctx)).toEqual({ labelIds: ["l1"] });
    expect(groupPreset("due", "today", ctx)).toEqual({ dueDate: "2026-10-01" });
  });
  it("adds plain in the No-value groups; No priority keeps the priority empty", () => {
    expect(groupPreset("assignee", GROUP_NONE, ctx)).toEqual({ assigneeIds: [] });
    expect(groupPreset("label", GROUP_NONE, ctx)).toEqual({ labelIds: [] });
    expect(groupPreset("due", "none", ctx)).toEqual({ dueDate: null });
    expect(groupPreset("priority", GROUP_NONE, ctx)).toEqual({ priority: null });
  });
  it("is null for a group that can't take a value: the range Due groups, No status, a former member, an unknown label", () => {
    for (const id of ["overdue", "week", "later", "earlier"]) expect(groupPreset("due", id, ctx)).toBeNull();
    expect(groupPreset("status", GROUP_NONE, ctx)).toBeNull();
    expect(groupPreset("assignee", "gone", ctx)).toBeNull();
    expect(groupPreset("label", "l9", ctx)).toBeNull();
    expect(groupPreset("priority", "SOON", ctx)).toBeNull();
  });
});

describe("withPreset", () => {
  const typed = { priority: "MEDIUM" as const, dueDate: undefined, labelIds: ["l2"], assigneeIds: [] };
  it("puts the group's priority over the default one, but not over a typed !priority", () => {
    expect(withPreset(typed, { priority: "HIGH" }, false).priority).toBe("HIGH");
    expect(withPreset(typed, { priority: null }, false).priority).toBeNull();
    expect(withPreset(typed, { priority: "HIGH" }, true).priority).toBe("MEDIUM");
  });
  it("keeps a typed due date; else the group's", () => {
    expect(withPreset(typed, { dueDate: "2026-10-01" }, false).dueDate).toBe("2026-10-01");
    expect(withPreset({ ...typed, dueDate: "2026-10-09" }, { dueDate: "2026-10-01" }, false).dueDate).toBe("2026-10-09");
    expect(withPreset(typed, { dueDate: null }, false).dueDate).toBeUndefined();
  });
  it("adds the group's label or member to the typed ones, once", () => {
    expect(withPreset(typed, { labelIds: ["l1"] }, false).labelIds).toEqual(["l1", "l2"]);
    expect(withPreset(typed, { labelIds: ["l2"] }, false).labelIds).toEqual(["l2"]);
    expect(withPreset({ ...typed, assigneeIds: ["u1"] }, { assigneeIds: ["u2"] }, false).assigneeIds).toEqual(["u2", "u1"]);
    expect(withPreset(typed, null, false)).toBe(typed);
  });
});
