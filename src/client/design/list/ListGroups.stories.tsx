import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { ListGroups, type ItemGroup, type ListGroupsProps } from "./ListGroups";
import { ListRow, type ListRowProps } from "./ListRow";

type Row = ListRowProps & { id: string };
const r1: Row = { id: "r1", itemId: "HE-120", title: "Renew the airworthiness certificate", labels: [{ color: "red", text: "Compliance" }], due: "Oct 14, 2026", priority: "Urgent" };
const r2: Row = { id: "r2", itemId: "HE-115", title: "Prepare the helicopter quote", labels: [{ color: "orange", text: "Sales" }], due: "Oct 2, 2026", dueState: "overdue", priority: "High", assignees: ["Todoi"] };
const r3: Row = { id: "r3", itemId: "HE-118", title: "Send the pilot roster", attachments: 2, priority: "High" };
const r4: Row = { id: "r4", itemId: "HE-121", title: "Order spare rotor blades", assignees: ["Ana Peeters"] };

const PRIORITY: Array<ItemGroup<Row>> = [
  { id: "URGENT", label: "Urgent", icon: "flag", iconColor: "var(--label-red)", accepts: true, items: [r1] },
  { id: "HIGH", label: "High", icon: "flag", iconColor: "var(--label-orange)", accepts: true, items: [r2, r3] },
  { id: "MEDIUM", label: "Medium", icon: "flag", iconColor: "var(--label-yellow)", accepts: true, items: [] },
  { id: "__none", label: "No priority", icon: "flag-off", accepts: true, items: [r4] },
];
const ASSIGNEE: Array<ItemGroup<Row>> = [
  { id: "u1", label: "Todoi", avatar: { name: "Todoi" }, accepts: true, items: [r2] },
  { id: "u2", label: "Ana Peeters", avatar: { name: "Ana Peeters" }, accepts: true, items: [r4] },
  { id: "__none", label: "Unassigned", icon: "user-x", accepts: true, items: [r1, r3] },
];
const LABEL: Array<ItemGroup<Row>> = [
  { id: "l1", label: "Compliance", color: "var(--label-red)", accepts: true, items: [r1] },
  { id: "l2", label: "Sales", color: "var(--label-orange)", accepts: true, items: [r2] },
  { id: "__none", label: "No label", icon: "tag", accepts: true, items: [r3, r4] },
];
const DUE: Array<ItemGroup<Row>> = [
  { id: "overdue", label: "Overdue", icon: "clock", iconColor: "var(--danger)", accepts: false, refuse: "Overdue is not a date. Open the item to change its date.", items: [r2] },
  { id: "today", label: "Today", icon: "calendar-check", accepts: true, items: [] },
  { id: "week", label: "This week", icon: "calendar-range", accepts: false, refuse: "This week covers several days. Open the item to pick a date.", items: [r1] },
  { id: "none", label: "No date", icon: "calendar-off", accepts: true, items: [r3, r4] },
];

const renderRow = (it: Row, g: ItemGroup<Row>) => <ListRow key={`${g.id}:${it.id}`} dragId={it.id} {...it} />;

// The host keeps the collapsed ids (per device in the app); the story keeps them in state.
function ControlledGroups(args: ListGroupsProps<Row>) {
  const [collapsed, setCollapsed] = useState(args.collapsed ?? []);
  return (
    <ListGroups
      {...args}
      collapsed={collapsed}
      onCollapsedChange={(ids) => {
        setCollapsed(ids);
        args.onCollapsedChange?.(ids);
      }}
    />
  );
}

const meta = {
  title: "List/ListGroups",
  component: ListGroups<Row>,
  render: (args) => <ControlledGroups {...args} />,
  decorators: [(Story) => <div style={{ height: 640, display: "flex", background: "var(--chrome-canvas)" }}><Story /></div>],
  parameters: { layout: "fullscreen", docs: { description: { component: "The List view grouped by one field (Group by): one collapsible ListSection per group with the group's glyph, avatar or label swatch, its name and count, inside a ListView. Groups replace the list sections; rows keep the item sort. The host builds the groups (app/groups.ts), keeps which are collapsed (per device), and owns the drag, passing its cue back as `drop`. Empty groups appear only with “Show empty groups” and read “No items”." } } },
  args: { groups: PRIORITY, renderRow, onCollapsedChange: fn() },
} satisfies Meta<typeof ListGroups<Row>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ByPriority: Story = {
  async play({ canvas, canvasElement }) {
    await expect([...canvasElement.querySelectorAll("section")].map((s) => s.getAttribute("data-group-id"))).toEqual(["URGENT", "HIGH", "MEDIUM", "__none"]);
    await expect(canvas.getByRole("list", { name: "High items" }).querySelectorAll(".td-list-row").length).toBe(2);
    await expect(canvas.getByText("No items")).toBeVisible();
    // The view is one Tab stop; no "Add list" or add rows in a grouped view
    await expect(canvas.queryByRole("button", { name: "Add list" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add an item" })).not.toBeInTheDocument();
  },
};
export const ByAssignee: Story = { args: { groups: ASSIGNEE } };
export const ByLabel: Story = { args: { groups: LABEL } };
export const ByDue: Story = { args: { groups: DUE } };
/** Each chevron is a Tab stop; Enter or Space toggles its group, and the host keeps the collapsed ids. */
export const CollapseGroups: Story = {
  args: { collapsed: ["URGENT"] },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("button", { name: "Expand Urgent" })).toHaveAttribute("aria-expanded", "false");
    canvas.getByRole("button", { name: "Collapse High" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onCollapsedChange).toHaveBeenLastCalledWith(["URGENT", "HIGH"]);
    await expect(canvas.getByRole("button", { name: "Expand High" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(canvas.getByRole("button", { name: "Expand Urgent" }));
    await expect(args.onCollapsedChange).toHaveBeenLastCalledWith(["HIGH"]);
  },
};
/** While a row is dragged, the host's cue rings the group that takes it, or shows why one refuses. */
export const DropCues: Story = {
  args: { groups: DUE, drop: { groupId: "week", state: "refuse", note: "This week covers several days. Open the item to pick a date." } },
  async play({ canvas, canvasElement }) {
    await expect(canvasElement.querySelector('[data-group-id="week"]')).toHaveAttribute("data-drop", "refuse");
    await expect(canvas.getByText("This week covers several days. Open the item to pick a date.")).toBeVisible();
  },
};
export const DropAccepted: Story = { args: { groups: DUE, drop: { groupId: "today", state: "accept" } } };

const rowIn = (root: HTMLElement, group: string, id: string) => root.querySelector<HTMLElement>(`[data-group-id="${group}"] .td-list-row[data-drag-id="${id}"]`)!;
const accepts = (_id: string, _from: string | null, to: string) => {
  const g = DUE.find((x) => x.id === to)!;
  return { ok: g.accepts, reason: g.refuse };
};
/** Ctrl/Cmd+Shift+↑↓ moves the focused item to the previous / next group that takes it, skipping refusing ones; the result is announced. */
export const KeyboardGroupMove: Story = {
  args: { groups: DUE, canDrop: accepts, onGroupDrop: fn(), onAnnounce: fn() },
  async play({ args, canvasElement, userEvent }) {
    // From No date up: This week refuses (skipped), Today takes it
    rowIn(canvasElement, "none", "r3").focus();
    await userEvent.keyboard("{Control>}{Shift>}{ArrowUp}{/Shift}{/Control}");
    await expect(args.onGroupDrop).toHaveBeenCalledWith("r3", "none", "today");
    await expect(args.onAnnounce).toHaveBeenLastCalledWith("Moved to Today");
    // From Overdue up: nothing above
    rowIn(canvasElement, "overdue", "r2").focus();
    await userEvent.keyboard("{Control>}{Shift>}{ArrowUp}{/Shift}{/Control}");
    await expect(args.onAnnounce).toHaveBeenLastCalledWith("No group to move to");
    await expect(args.onGroupDrop).toHaveBeenCalledTimes(1);
  },
};
/** When every group in that direction refuses, the first refusal is announced and nothing moves. */
export const KeyboardGroupRefused: Story = {
  args: { groups: DUE, canDrop: (_id, _from, to) => ({ ok: false, reason: DUE.find((x) => x.id === to)?.refuse ?? null }), onGroupDrop: fn(), onAnnounce: fn() },
  async play({ args, canvasElement, userEvent }) {
    rowIn(canvasElement, "overdue", "r2").focus();
    await userEvent.keyboard("{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}");
    await expect(args.onGroupDrop).not.toHaveBeenCalled();
    await expect(args.onAnnounce).toHaveBeenLastCalledWith("This week covers several days. Open the item to pick a date.");
  },
};
/** A collapsed target group opens when an item moves into it. */
export const KeyboardMoveOpensCollapsed: Story = {
  args: { groups: PRIORITY, collapsed: ["MEDIUM"], onGroupDrop: fn(), onAnnounce: fn() },
  async play({ args, canvas, canvasElement, userEvent }) {
    rowIn(canvasElement, "HIGH", "r3").focus();
    await userEvent.keyboard("{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}");
    await expect(args.onGroupDrop).toHaveBeenCalledWith("r3", "HIGH", "MEDIUM");
    await expect(args.onCollapsedChange).toHaveBeenLastCalledWith([]);
    await expect(canvas.getByRole("button", { name: "Collapse Medium" })).toHaveAttribute("aria-expanded", "true");
  },
};
