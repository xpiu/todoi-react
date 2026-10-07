import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import type { CalendarItem } from "./calendar";
import { CalendarGrid } from "./CalendarGrid";

// Fixed dates: October 2026, today Wednesday the 7th, weeks start on Monday.
const ITEMS: CalendarItem[] = [
  { id: "m1", itemId: "HE-110", title: "Annual maintenance window", start: "2026-10-05", due: "2026-10-09", labels: [{ color: "blue" }] },
  { id: "t1", itemId: "HE-124", title: "Pilot training course", start: "2026-10-15", due: "2026-10-20", labels: [{ color: "green" }] },
  { id: "c1", itemId: "HE-115", title: "Prepare the helicopter quote", due: "2026-10-02", labels: [{ color: "orange" }] },
  { id: "c2", itemId: "HE-101", title: "Hire a second mechanic", due: "2026-10-07", done: true },
  { id: "c3", itemId: "HE-118", title: "Send the pilot roster", due: "2026-10-07", labels: [{ color: "teal" }] },
  { id: "c4", itemId: "HE-120", title: "Renew the airworthiness certificate", due: "2026-10-14", labels: [{ color: "red" }] },
  ...["Fuel invoice", "Hangar rent", "Insurance renewal", "Radio licence", "Crew badges"].map((title, i): CalendarItem => ({ id: `b${i}`, itemId: `HE-13${i}`, title, due: "2026-10-26", labels: [{ color: "yellow" }] })),
];

const meta = {
  title: "Calendar/CalendarGrid",
  component: CalendarGrid,
  // The grid fills its container; the cell height decides how many chips fit before "+N more".
  decorators: [(Story) => <div style={{ display: "flex", flexDirection: "column", height: 640 }}><Story /></div>],
  args: { date: new Date(2026, 9, 1), today: new Date(2026, 9, 7), weekStartsOn: 1, period: "month", items: ITEMS, style: { flex: 1 }, onOpenItem: fn(), onAddItem: fn(), onShowMore: fn(), onReschedule: fn(), onNavigateDate: fn() },
  parameters: { docs: { description: { component: "The month or week grid inside CalendarView: day cells with chips (ranked overdue, open, done) and multi-day span bars in lanes, with \"+N more\" when a cell is full. One Tab stop: arrows move the focused day and ask onNavigateDate to change period at the edge; Enter calls onShowMore. Pass today for deterministic rendering; dragging a chip or bar calls onReschedule with the item id and the from / to days." } } },
} satisfies Meta<typeof CalendarGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {
  async play({ args, canvas, userEvent }) {
    const today = canvas.getByRole("gridcell", { name: "Wednesday, October 7, 2026, 3 items" });
    await expect(today).toHaveAttribute("aria-current", "date");
    await expect(today).toHaveAttribute("tabindex", "0");
    await userEvent.click(canvas.getByRole("button", { name: /Prepare the helicopter quote/ }));
    await expect(args.onOpenItem).toHaveBeenCalledWith("c1");
    await userEvent.click(canvas.getByRole("button", { name: "Annual maintenance window" }));
    await expect(args.onOpenItem).toHaveBeenCalledWith("m1");
    await expect(args.onAddItem).not.toHaveBeenCalled();
  },
};
export const KeyboardNavigation: Story = {
  async play({ args, canvas, userEvent }) {
    canvas.getByRole("gridcell", { name: /^Wednesday, October 7, 2026/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("gridcell", { name: /^Thursday, October 8, 2026/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    const fifteenth = canvas.getByRole("gridcell", { name: /^Thursday, October 15, 2026/ });
    await expect(fifteenth).toHaveFocus();
    await expect(fifteenth).toHaveAttribute("tabindex", "0");
    await userEvent.keyboard("{Enter}");
    await expect(args.onShowMore).toHaveBeenCalledWith("2026-10-15");
    // Past the last shown week (October 2026 ends on Sunday Nov 1), the grid asks the view to navigate.
    for (let i = 0; i < 3; i++) await userEvent.keyboard("{ArrowDown}");
    await expect(args.onNavigateDate).toHaveBeenCalledWith("2026-11-05");
  },
};
export const AddAndShowMore: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("gridcell", { name: /^Monday, October 12, 2026/ }));
    await expect(args.onAddItem).toHaveBeenCalledWith("2026-10-12");
    await userEvent.click(canvas.getByRole("button", { name: /^\+\d+ more$/ }));
    await expect(args.onShowMore).toHaveBeenCalledWith("2026-10-26");
  },
};
export const Week: Story = {
  args: { period: "week", date: new Date(2026, 9, 7) },
  async play({ canvas }) {
    await expect(canvas.getAllByRole("gridcell", { name: /, 2026/ })).toHaveLength(7);
    await expect(canvas.getByRole("columnheader", { name: /Wed/ })).toHaveTextContent("7");
  },
};
export const SundayStart: Story = { args: { weekStartsOn: 0 } };
export const Empty: Story = { args: { items: [] } };
export const HiddenKeysAndLabels: Story = { args: { showItemIds: false, showLabels: false } };
