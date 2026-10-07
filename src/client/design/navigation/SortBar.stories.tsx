import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { SortBar, type SortBarProps } from "./SortBar";
import type { SortMenuOption, SortMenuSpec } from "./SortMenu";

const OPTIONS: Record<string, SortMenuOption[]> = {
  lists: [
    { key: "none", label: "None", icon: "circle-slash-2", hint: "Manual order" },
    { key: "name", label: "Name", icon: "arrow-down-a-z", dirs: { asc: "A–Z", desc: "Z–A" } },
  ],
  items: [
    { key: "none", label: "None", icon: "circle-slash-2", hint: "Board order" },
    { key: "due", label: "Due date", icon: "clock", dirs: { asc: "Soonest first", desc: "Latest first" } },
    { key: "priority", label: "Priority", icon: "flag", dirs: { asc: "Urgent first", desc: "Low first" } },
  ],
};

// Story state models the host: picking the active key reverses it, "none" clears that dimension.
function ControlledSortBar(args: SortBarProps) {
  const [sort, setSort] = useState(args.sort);
  return (
    <SortBar
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
      onReset={() => {
        setSort({ lists: null, items: null });
        args.onReset();
      }}
    />
  );
}

const meta = {
  title: "Navigation/SortBar",
  component: SortBar,
  render: (args) => <ControlledSortBar {...args} />,
  decorators: [(Story) => <div style={{ background: "var(--chrome-canvas)", paddingBottom: 10, minHeight: 48 }}><Story /></div>],
  args: { open: false, dims: [["Lists", "lists"], ["Items", "items"]], options: OPTIONS, sort: { lists: null, items: { key: "due", dir: "asc" } }, onSelect: fn(), onReset: fn() },
  parameters: { docs: { description: { component: "The \"Sort by\" chip row under the FilterBar. The host owns the sort per dimension and the Sort menu's open state: while open every option shows, once closed only the active ones, and with nothing sorted the row renders nothing. The active chip's arrow shows the direction; removing it calls onSelect(dim, \"none\")." } } },
} satisfies Meta<typeof SortBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSort: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getAllByRole("button", { pressed: true })).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: /Due date/ }));
    await expect(args.onSelect).toHaveBeenCalledWith("items", "none");
    await expect(canvas.queryByRole("toolbar", { name: "Sorting" })).not.toBeInTheDocument();
  },
};
export const MenuOpen: Story = {
  args: { open: true },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: /Lists:\s*Name/ }));
    await expect(args.onSelect).toHaveBeenCalledWith("lists", "name");
    await expect(canvas.getByRole("button", { name: /Lists:\s*Name/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Reset sorting" }));
    await expect(args.onReset).toHaveBeenCalledOnce();
  },
};
export const Unsorted: Story = { args: { sort: { lists: null, items: null } } };
