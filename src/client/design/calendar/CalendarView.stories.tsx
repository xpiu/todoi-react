import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import type { CalendarItem } from "./calendar";
import { CalendarView } from "./CalendarView";

// Fixed dates: today is Wednesday 7 October 2026, weeks start on Monday.
const ITEMS: CalendarItem[] = [
  { id: "m1", itemId: "HE-110", title: "Annual maintenance window", start: "2026-10-05", due: "2026-10-09", labels: [{ color: "blue", text: "Ops" }] },
  { id: "t1", itemId: "HE-124", title: "Pilot training course", start: "2026-10-15", due: "2026-10-20", labels: [{ color: "green", text: "Training" }] },
  { id: "c1", itemId: "HE-115", title: "Prepare the helicopter quote", due: "2026-10-02", dueState: "overdue", labels: [{ color: "orange", text: "Sales" }], priority: "High" },
  { id: "c2", itemId: "HE-101", title: "Hire a second mechanic", due: "2026-10-07", done: true },
  {
    id: "c3",
    itemId: "HE-118",
    title: "Send the pilot roster",
    due: "2026-10-07",
    assignees: [{ name: "Sam Verhoeven" }],
    subitems: [{ id: "s1", itemId: "HE-122", title: "Check licence expiry dates", done: false }],
  },
  { id: "c4", itemId: "HE-120", title: "Renew the airworthiness certificate", due: "2026-10-14", labels: [{ color: "red", text: "Compliance" }] },
  { id: "c5", itemId: "HE-125", title: "Book the Christmas hangar party", due: "2026-12-11" },
  { id: "c6", itemId: "HE-099", title: "File the Q3 flight log", due: "2026-09-30", done: true },
];

const meta = {
  title: "Calendar/CalendarView",
  component: CalendarView,
  decorators: [(Story) => <div style={{ display: "flex", flexDirection: "column", height: 720 }}><Story /></div>],
  args: { items: ITEMS, today: "2026-10-07", date: "2026-10-07", weekStartsOn: 1, onOpenItem: fn(), onAddItem: fn(), onReschedule: fn(), onToggleDone: fn(), onToggleSubitem: fn(), onPeriodChange: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The assembled calendar: CalendarHeader over a month / week CalendarGrid, the Day list, or the Year's twelve mini months. The period is controlled through period or self-managed from defaultPeriod; the cursor is internal and starts at date. Pass today so the view is deterministic. ←/→ outside the grid and PageUp/PageDown move the period; item changes go to the caller by id." } },
  },
} satisfies Meta<typeof CalendarView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {
  async play({ canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { name: "October 2026" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next month" }));
    await expect(canvas.getByRole("heading", { name: "November 2026" })).toBeVisible();
    await userEvent.keyboard("{PageDown}");
    await expect(canvas.getByRole("heading", { name: "December 2026" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /Book the Christmas hangar party/ })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Today" }));
    await expect(canvas.getByRole("heading", { name: "October 2026" })).toBeVisible();
    // Today makes today's cell the grid's Tab stop.
    await expect(canvas.getByRole("gridcell", { name: /^Wednesday, October 7, 2026/ })).toHaveAttribute("tabindex", "0");
  },
};
export const Week: Story = {
  args: { defaultPeriod: "week" },
  async play({ canvas }) {
    await expect(canvas.getByRole("heading", { name: "Oct 5 – 11, 2026" })).toBeVisible();
  },
};
export const Day: Story = {
  args: { defaultPeriod: "day" },
  // a11y todo: CalendarDayList renders role="listitem" rows without a role="list" parent (aria-required-parent).
  parameters: { a11y: { test: "todo" } },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { name: "Wednesday, October 7, 2026" })).toBeVisible();
    // The day list shows items due that day and spans covering it.
    await expect(canvas.getByText("3 items")).toBeVisible();
    await userEvent.click(canvas.getByText("Send the pilot roster"));
    await expect(args.onOpenItem).toHaveBeenCalledWith("c3");
    await userEvent.click(canvas.getByRole("button", { name: "Previous day" }));
    await expect(canvas.getByRole("heading", { name: "Tuesday, October 6, 2026" })).toBeVisible();
  },
};
export const Year: Story = {
  args: { defaultPeriod: "year" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { name: "2026" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "December 2026" }));
    await expect(args.onPeriodChange).toHaveBeenCalledWith("month");
    await expect(canvas.getByRole("heading", { name: "December 2026" })).toBeVisible();
  },
};
export const ChangePeriod: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("combobox", { name: "Calendar period" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: "Year" }));
    await expect(args.onPeriodChange).toHaveBeenCalledWith("year");
    await waitFor(() => expect(page.queryByRole("option", { name: "Year" })).not.toBeInTheDocument());
    await expect(canvas.getByRole("heading", { name: "2026" })).toBeVisible();
  },
};
export const OpenDayFromGrid: Story = {
  // a11y todo: CalendarDayList renders role="listitem" rows without a role="list" parent (aria-required-parent).
  parameters: { a11y: { test: "todo" } },
  async play({ args, canvas, userEvent }) {
    canvas.getByRole("gridcell", { name: /^Wednesday, October 7, 2026/ }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onPeriodChange).toHaveBeenCalledWith("day");
    await expect(canvas.getByRole("heading", { name: "Wednesday, October 7, 2026" })).toBeVisible();
  },
};
export const ControlledPeriod: Story = {
  args: { period: "month" },
  async play({ args, canvas, canvasElement, userEvent }) {
    // A controlled view reports the change and waits for the caller to pass the new period.
    await userEvent.click(canvas.getByRole("combobox", { name: "Calendar period" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: "Week" }));
    await expect(args.onPeriodChange).toHaveBeenCalledWith("week");
    await waitFor(() => expect(page.queryByRole("option", { name: "Week" })).not.toBeInTheDocument());
    await expect(canvas.getByRole("heading", { name: "October 2026" })).toBeVisible();
  },
};
export const Empty: Story = { args: { items: [] } };
