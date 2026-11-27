import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";

import { getAppearance, useAppearanceStore } from "../core/appearance";
import { FilterMenu, type FilterMenuOption, type FilterMenuProps } from "./FilterMenu";

const SECTIONS: ReadonlyArray<[string, string]> = [["Labels", "label"], ["Assignee", "assignee"], ["Due date", "due"], ["Priority", "priority"]];
const AVAILABLE: FilterMenuOption[] = [
  { type: "label", value: "Sales", color: "var(--label-blue)" },
  { type: "label", value: "Urgent", color: "var(--label-red)" },
  { type: "assignee", value: "todoi", icon: "user" },
  { type: "assignee", value: "Unassigned", icon: "user-x" },
  { type: "due", value: "Overdue", icon: "clock" },
  { type: "due", value: "Today", icon: "calendar-check" },
  { type: "due", value: "This week", icon: "calendar-range" },
  { type: "due", value: "No date", icon: "calendar-off" },
  { type: "priority", value: "High", icon: "flag", iconColor: "var(--label-orange)" },
];
const COUNTS = { "label:Sales": 12, "label:Urgent": 3, "assignee:todoi": 8, "assignee:Unassigned": 5, "due:Overdue": 2, "due:Today": 1, "due:This week": 6, "due:No date": 9, "priority:High": 4 };

// Story state models the host; in the app this body sits in the SubNavbar's Filter Popover.
function ControlledFilterMenu(args: FilterMenuProps) {
  const [filters, setFilters] = useState(args.filters);
  const same = (a: { type: string; value: string }, b: { type: string; value: string }) => a.type === b.type && a.value === b.value;
  return (
    <div style={{ width: 296, background: "var(--surface-card)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-overlay)" }}>
      <FilterMenu
        {...args}
        filters={filters}
        onToggle={(f) => {
          setFilters((cur) => (cur.some((a) => same(a, f)) ? cur.filter((a) => !same(a, f)) : [...cur, { type: f.type, value: f.value }]));
          args.onToggle(f);
        }}
        onClear={args.onClear && (() => {
          setFilters([]);
          args.onClear?.();
        })}
      />
    </div>
  );
}

const meta = {
  title: "Navigation/FilterMenu",
  component: FilterMenu,
  render: (args) => <ControlledFilterMenu {...args} />,
  args: { sections: SECTIONS, available: AVAILABLE, filters: [], counts: COUNTS, onToggle: fn(), onClear: fn() },
  parameters: { docs: { description: { component: "The Filter action's panel, rendered as the body of the SubNavbar's toolbar-tier Popover. The host owns the active filters; each row is a checkbox that calls onToggle with its option. The search field filters rows by value or section, and Escape clears the query before it reaches the Popover." } } },
} satisfies Meta<typeof FilterMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("textbox", { name: "Search filter options" })).toHaveFocus();
    const sales = canvas.getByRole("checkbox", { name: "Sales" });
    await userEvent.click(sales);
    await expect(args.onToggle).toHaveBeenCalledWith(expect.objectContaining({ type: "label", value: "Sales" }));
    await expect(sales).toHaveAttribute("aria-checked", "true");
    canvas.getByRole("checkbox", { name: "Overdue" }).focus();
    await userEvent.keyboard(" ");
    await expect(args.onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ type: "due", value: "Overdue" }));
  },
};
export const WithActiveFilters: Story = {
  args: { filters: [{ type: "label", value: "Urgent" }, { type: "priority", value: "High" }] },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Clear all" }));
    await expect(args.onClear).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  },
};
/** Suggest shortcuts adds an F · X · esc footer (X only while filters are set); with it off there is none. */
export const ShortcutFooter: Story = {
  args: { filters: [{ type: "label", value: "Urgent" }] },
  async play({ canvasElement }) {
    const { set } = useAppearanceStore.getState();
    const before = getAppearance().suggestShortcuts;
    const footer = () => canvasElement.querySelector(".td-filter-menu-foot");
    try {
      set({ suggestShortcuts: true });
      await waitFor(() => expect(footer()).toHaveTextContent(/F opens this menu.*X clears filters.*esc close/));
      await expect(footer()).toHaveAttribute("aria-hidden", "true");
      set({ suggestShortcuts: false });
      await waitFor(() => expect(footer()).toBeNull());
    } finally {
      set({ suggestShortcuts: before });
    }
  },
};
export const Search: Story = {
  async play({ canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "Search filter options" });
    await userEvent.type(field, "assign");
    await expect(canvas.getByRole("checkbox", { name: "Unassigned" })).toBeVisible();
    await expect(canvas.queryByRole("checkbox", { name: "Sales" })).not.toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "zeppelin");
    await expect(canvas.getByText("No filters match “zeppelin”")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(field).toHaveValue("");
  },
};
/** Due date has four values (Design: ViewControls DUE_FILTERS): Overdue · Today · This week · No date. They OR together. */
export const DueValues: Story = {
  args: { filters: [{ type: "due", value: "Today" }] },
  async play({ args, canvas, userEvent }) {
    const due = canvas.getByRole("group", { name: "Due date" });
    const rows = [...due.querySelectorAll(".td-filter-menu-row")].map((r) => r.getAttribute("aria-label"));
    await expect(rows).toEqual(["Overdue", "Today", "This week", "No date"]);
    await expect(canvas.getByRole("checkbox", { name: "Today" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(canvas.getByRole("checkbox", { name: "This week" }));
    await expect(args.onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ type: "due", value: "This week" }));
    await expect(canvas.getByRole("checkbox", { name: "This week" })).toHaveAttribute("aria-checked", "true");
  },
};
