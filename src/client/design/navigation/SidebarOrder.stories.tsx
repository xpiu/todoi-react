import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, waitFor } from "storybook/test";

import type { SidebarGroup } from "./Sidebar";
import { moveProject } from "./sidebarArrangement";
import { SidebarOrder } from "./SidebarOrder";

const GROUPS: SidebarGroup[] = [
  { id: "g1", name: "Helicopters Europe", projects: [{ id: "p1", name: "Helicopter sales", icon: "rocket", color: "var(--label-orange)" }, { id: "p2", name: "Maintenance plans", icon: "wrench", color: "var(--label-teal)" }] },
  { id: "g2", name: "Internal", projects: [{ id: "p3", name: "Marketing site", icon: "globe", color: "var(--label-blue)" }] },
];

/** The host keeps the order and the groups (the app: per account), exactly as for the Sidebar. */
function Host(props: ComponentProps<typeof SidebarOrder>) {
  const [groups, setGroups] = useState(GROUPS);
  const [order, setOrder] = useState<string[]>([]);
  return (
    <div style={{ maxWidth: 480 }}>
      <SidebarOrder
        {...props}
        groups={groups}
        order={order}
        onReorder={(next) => {
          props.onReorder?.(next);
          setOrder(next);
        }}
        onProjectMove={(id, gid, index) => {
          props.onProjectMove?.(id, gid, index);
          setGroups((g) => moveProject(g, id, gid, index));
        }}
      />
    </div>
  );
}

const meta = {
  title: "Navigation/SidebarOrder",
  component: SidebarOrder,
  render: (args) => <Host {...args} />,
  args: { groups: GROUPS, onReorder: fn(), onProjectMove: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "The sidebar's arrangement as a list (Settings › Appearance › Sidebar order): a drag handle at the start of each row (pointer events: finger, pen, mouse) and Move up / Move down at its end — the touch twin of the Sidebar's drag and drop, on the same `order` / `onReorder` / `onProjectMove` / `canMoveProject` contract. A group takes its projects along; a project moves inside its group and, at its edge, into the neighbouring group where `canMoveProject` allows. The moved row washes once, focus stays on its button, a polite status line announces the new place. The handle is aria-hidden: the arrows are the keyboard path.",
      },
    },
  },
} satisfies Meta<typeof SidebarOrder>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Arrows: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("button", { name: "Move Helicopters Europe up" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Move Helicopters Europe down" }));
    await expect(args.onReorder).toHaveBeenCalledWith(["g2", "g1", "projects", "groups", "inbox"]);
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Helicopters Europe moved down. 2 of 5."));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Move Helicopters Europe down" })).toHaveFocus());
    // Marketing site (now in the first group) steps down into Helicopters Europe at its edge
    await userEvent.click(canvas.getByRole("button", { name: "Move Marketing site down" }));
    await expect(args.onProjectMove).toHaveBeenCalledWith("p3", "g1", 0);
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Marketing site moved to Helicopters Europe."));
  },
};

export const OwnGroupOnly: Story = {
  args: { canMoveProject: () => false },
  parameters: { docs: { description: { story: "Where the viewer may not move a project to another group (the app: owner of the project and of that group), its arrows stop at the group's edge." } } },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Move Maintenance plans down" })).toHaveAttribute("aria-disabled", "true");
    await expect(canvas.getByRole("button", { name: "Move Marketing site up" })).toHaveAttribute("aria-disabled", "true");
    await expect(canvas.getByRole("button", { name: "Move Helicopter sales down" })).not.toHaveAttribute("aria-disabled");
  },
};
