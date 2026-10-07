import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { SortMenu, type SortMenuOption, type SortMenuProps, type SortMenuSpec } from "./SortMenu";

const OPTIONS: Record<string, SortMenuOption[]> = {
  lists: [
    { key: "none", label: "None", icon: "circle-slash-2", hint: "Manual order" },
    { key: "name", label: "Name", icon: "arrow-down-a-z", dirs: { asc: "A–Z", desc: "Z–A" } },
    { key: "count", label: "Item count", icon: "hash", dirs: { desc: "Most first", asc: "Fewest first" } },
  ],
  items: [
    { key: "none", label: "None", icon: "circle-slash-2", hint: "Board order" },
    { key: "priority", label: "Priority", icon: "flag", dirs: { asc: "Urgent first", desc: "Low first" } },
    { key: "due", label: "Due date", icon: "clock", dirs: { asc: "Soonest first", desc: "Latest first" } },
  ],
};

// Story state models the host's nextSort: the active key reverses, "none" clears, a new key starts ascending.
function ControlledSortMenu(args: SortMenuProps) {
  const [sort, setSort] = useState(args.sort);
  return (
    <div style={{ width: 296, background: "var(--surface-card)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-overlay)" }}>
      <SortMenu
        {...args}
        sort={sort}
        onSelect={(dim, key) => {
          setSort((s) => {
            const cur = s[dim];
            const next: SortMenuSpec | null = key === "none" ? null : cur?.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
            return { ...s, [dim]: next };
          });
          args.onSelect(dim, key);
        }}
        onReset={args.onReset && (() => {
          setSort({ lists: null, items: null });
          args.onReset?.();
        })}
      />
    </div>
  );
}

const meta = {
  title: "Navigation/SortMenu",
  component: SortMenu,
  render: (args) => <ControlledSortMenu {...args} />,
  args: { sections: [["Sort lists", "lists"], ["Sort items", "items"]], options: OPTIONS, sort: { lists: null, items: null }, onSelect: fn(), onReset: fn() },
  parameters: { docs: { description: { component: "The Sort action's panel, rendered as the body of the SubNavbar's toolbar-tier Popover: one radio group per dimension. The host owns the sort; picking the active key again should reverse it, and the active row shows the direction label from the option's `dirs`. Reset appears once something is sorted." } } },
} satisfies Meta<typeof SortMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Unsorted: Story = {};
export const PickAndReverse: Story = {
  async play({ args, canvas, userEvent }) {
    const due = canvas.getByRole("radio", { name: /Due date/ });
    await userEvent.click(due);
    await expect(args.onSelect).toHaveBeenCalledWith("items", "due");
    await expect(due).toHaveAttribute("aria-checked", "true");
    await expect(due).toHaveTextContent("Soonest first");
    await userEvent.click(due);
    await expect(due).toHaveTextContent("Latest first");
  },
};
export const Sorted: Story = {
  args: { sort: { lists: { key: "name", dir: "desc" }, items: { key: "priority", dir: "asc" } } },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("radio", { name: /Name/ })).toHaveTextContent("Z–A");
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(args.onReset).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("radiogroup", { name: "Sort items" })).toContainElement(canvas.getAllByRole("radio", { name: /None/, checked: true })[1]!);
  },
};
