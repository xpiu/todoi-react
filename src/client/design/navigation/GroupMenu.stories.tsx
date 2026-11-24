import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { GroupMenu, type GroupMenuProps } from "./GroupMenu";

// Story state models the host: the group lives in the URL / saved view, "Show empty groups" and collapsed groups per device.
function ControlledGroupMenu(args: GroupMenuProps) {
  const [group, setGroup] = useState(args.group ?? null);
  const [showEmpty, setShowEmpty] = useState(!!args.showEmpty);
  const [allCollapsed, setAllCollapsed] = useState(!!args.allCollapsed);
  return (
    <div style={{ width: 264, background: "var(--surface-card)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-overlay)" }}>
      <GroupMenu
        {...args}
        group={group}
        onSelect={(k) => {
          setGroup(k === "none" ? null : k);
          args.onSelect?.(k);
        }}
        onReset={() => {
          setGroup(null);
          args.onReset?.();
        }}
        showEmpty={showEmpty}
        onShowEmptyChange={(v) => {
          setShowEmpty(v);
          args.onShowEmptyChange?.(v);
        }}
        allCollapsed={allCollapsed}
        onCollapseAll={(v) => {
          setAllCollapsed(v);
          args.onCollapseAll?.(v);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Navigation/GroupMenu",
  component: GroupMenu,
  render: (args) => <ControlledGroupMenu {...args} />,
  args: { group: null, onSelect: fn(), onReset: fn(), onShowEmptyChange: fn(), onCollapseAll: fn() },
  parameters: { docs: { description: { component: "The Group action's panel (List view), the body of the SubNavbar's toolbar-tier Popover: one radio group — None · Status · Priority · Assignee · Label · Due (GROUP_OPTIONS) — and, while a group is picked, “Show empty groups” (the row is the checkbox) and “Collapse all groups”. Rows are the Sort menu's. In Board and Calendar every row is disabled with the note “Groups show in List view.” and “Open List view”." } } },
} satisfies Meta<typeof GroupMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoGroup: Story = {
  async play({ canvas }) {
    const radios = canvas.getAllByRole("radio");
    await expect(radios.map((r) => r.textContent)).toEqual(["NoneLists", "Status", "Priority", "Assignee", "Label", "Due"]);
    await expect(canvas.getByRole("radio", { name: /None/ })).toHaveAttribute("aria-checked", "true");
    await expect(canvas.queryByRole("checkbox", { name: "Show empty groups" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  },
};
export const PickAGroup: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("radio", { name: "Priority" }));
    await expect(args.onSelect).toHaveBeenCalledWith("priority");
    await expect(canvas.getByRole("radio", { name: "Priority" })).toHaveAttribute("aria-checked", "true");
    const showEmpty = canvas.getByRole("checkbox", { name: "Show empty groups" });
    await expect(showEmpty).toHaveAttribute("aria-checked", "false");
    await userEvent.click(showEmpty);
    await expect(args.onShowEmptyChange).toHaveBeenCalledWith(true);
    await expect(showEmpty).toHaveAttribute("aria-checked", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Collapse all groups" }));
    await expect(args.onCollapseAll).toHaveBeenCalledWith(true);
    await expect(canvas.getByRole("button", { name: "Expand all groups" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(args.onReset).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("radio", { name: /None/ })).toHaveAttribute("aria-checked", "true");
  },
};
export const Grouped: Story = {
  args: { group: "due", showEmpty: true },
};
/** Board and Calendar: every row is disabled; the note says why and "Open List view" switches. The pick is kept. */
export const OutsideListView: Story = {
  args: { group: "status", disabled: true, note: "Groups show in List view.", onOpenList: fn() },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("note")).toHaveTextContent("Groups show in List view.");
    for (const r of canvas.getAllByRole("radio")) await expect(r).toBeDisabled();
    await expect(canvas.getByRole("radio", { name: "Status" })).toHaveAttribute("aria-checked", "true");
    await expect(canvas.queryByRole("checkbox", { name: "Show empty groups" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open List view" }));
    await expect(args.onOpenList).toHaveBeenCalledOnce();
  },
};
/** `unavailable` disables one row and shows the reason as its hint. */
export const Unavailable: Story = {
  args: { unavailable: { label: "No labels yet" } },
  async play({ canvas }) {
    const row = canvas.getByRole("radio", { name: /Label/ });
    await expect(row).toBeDisabled();
    await expect(row).toHaveTextContent("No labels yet");
  },
};
