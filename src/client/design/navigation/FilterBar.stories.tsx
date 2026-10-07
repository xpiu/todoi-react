import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { FilterBar, type FilterBarOption, type FilterBarProps } from "./FilterBar";

const AVAILABLE: FilterBarOption[] = [
  { type: "label", value: "Sales", color: "var(--label-blue)" },
  { type: "label", value: "Urgent", color: "var(--label-red)" },
  { type: "assignee", value: "Flo Zuallaert", icon: "user" },
  { type: "due", value: "Overdue", icon: "clock" },
  { type: "priority", value: "High", icon: "flag" },
];

// Story state models the host (AppShell): it owns the active filters and the Filter menu's open state.
function ControlledFilterBar(args: FilterBarProps) {
  const [filters, setFilters] = useState(args.filters);
  return (
    <FilterBar
      {...args}
      filters={filters}
      onToggle={(f) => {
        setFilters((cur) => (cur.some((a) => a.type === f.type && a.value === f.value) ? cur.filter((a) => !(a.type === f.type && a.value === f.value)) : [...cur, { type: f.type, value: f.value }]));
        args.onToggle(f);
      }}
      onClear={() => {
        setFilters([]);
        args.onClear();
      }}
    />
  );
}

const meta = {
  title: "Navigation/FilterBar",
  component: FilterBar,
  render: (args) => <ControlledFilterBar {...args} />,
  decorators: [(Story) => <div style={{ background: "var(--chrome-canvas)", paddingBottom: 10, minHeight: 48 }}><Story /></div>],
  args: { open: false, available: AVAILABLE, filters: [{ type: "label", value: "Sales" }, { type: "due", value: "Overdue" }], onToggle: fn(), onClear: fn() },
  parameters: { docs: { description: { component: "The \"Filter by\" chip row under the SubNavbar. The host owns the filters and whether the Filter menu is open: while open every quick option shows (active ones selected), once closed only the active ones remain, and with nothing active the row renders nothing. Built on ChipBar with FilterChip chips." } } },
} satisfies Meta<typeof FilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveFilters: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.queryByRole("button", { name: /Urgent/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Overdue/ }));
    await expect(args.onToggle).toHaveBeenCalledWith(expect.objectContaining({ type: "due", value: "Overdue" }));
    await expect(canvas.queryByRole("button", { name: /Overdue/ })).not.toBeInTheDocument();
  },
};
export const MenuOpen: Story = {
  args: { open: true },
  async play({ args, canvas, userEvent }) {
    const urgent = canvas.getByRole("button", { name: /Urgent/ });
    await expect(urgent).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(urgent);
    await expect(args.onToggle).toHaveBeenCalledWith(expect.objectContaining({ type: "label", value: "Urgent" }));
    await expect(urgent).toHaveAttribute("aria-pressed", "true");
  },
};
export const Reset: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Reset filters" }));
    await expect(args.onClear).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole("toolbar", { name: "Filters" })).not.toBeInTheDocument();
  },
};
/** Menu closed and nothing filtered: the row is absent. */
export const Hidden: Story = {
  args: { filters: [] },
  async play({ canvas }) {
    await expect(canvas.queryByRole("toolbar", { name: "Filters" })).not.toBeInTheDocument();
  },
};
