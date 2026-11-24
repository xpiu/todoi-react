import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
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
  // Without a due date: the open ones sit in the "No date" tray (a start-only item counts as undated), done ones nowhere.
  { id: "u1", itemId: "HE-131", title: "Order the spare rotor blades", listName: "Backlog" },
  { id: "u2", itemId: "HE-132", title: "Draft the winter flight schedule", listName: "To do", start: "2026-10-12" },
  { id: "u3", itemId: "HE-133", title: "Ask about the hangar heating", listName: "Backlog" },
  { id: "u4", itemId: "HE-090", title: "Close the summer season", listName: "Done", done: true },
];

const meta = {
  title: "Calendar/CalendarView",
  component: CalendarView,
  decorators: [(Story) => <div style={{ display: "flex", flexDirection: "column", height: 720 }}><Story /></div>],
  args: { items: ITEMS, today: "2026-10-07", date: "2026-10-07", weekStartsOn: 1, onOpenItem: fn(), onAddItem: fn(), onReschedule: fn(), onToggleDone: fn(), onToggleSubitem: fn(), onPeriodChange: fn(), onSchedule: fn(), onClearDate: fn(), onSubscribe: fn(), onTrayOpenChange: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The assembled calendar: CalendarHeader over a month / week CalendarGrid, the Day list, or the Year's twelve mini months. Month and Week carry the \"No date\" tray (CalendarTray: open items without a due date; drag a row onto a day — onSchedule — or a chip onto the tray — onClearDate; shift+D or Set due date opens the due-date picker), toggled by the header's \"No date\" button; onSubscribe adds the Subscribe button. The period is controlled through period or self-managed from defaultPeriod; the cursor is internal and starts at date. Pass today so the view is deterministic. ←/→ outside the grid and PageUp/PageDown move the period; item changes go to the caller by id." } },
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
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { name: "Wednesday, October 7, 2026" })).toBeVisible();
    // The day list shows items due that day and spans covering it.
    await expect(canvas.getByText("3 items")).toBeVisible();
    await expect(within(canvas.getByRole("list", { name: "Items on this day" })).getByText("Send the pilot roster")).toBeVisible();
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
  async play({ args, canvas, userEvent }) {
    canvas.getByRole("gridcell", { name: /^Wednesday, October 7, 2026/ }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onPeriodChange).toHaveBeenCalledWith("day");
    await expect(canvas.getByRole("heading", { name: "Wednesday, October 7, 2026" })).toBeVisible();
    await expect(canvas.getByRole("list", { name: "Items on this day" })).toBeVisible();
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

/** The "No date" tray: open undated items (done ones left out), the header toggle with its count */
export const NoDateTray: Story = {
  async play({ args, canvas, userEvent }) {
    const toggle = canvas.getByRole("button", { name: /^No date/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveTextContent("3");
    const tray = canvas.getByRole("complementary", { name: "Items without a due date" });
    await expect(within(tray).getAllByRole("listitem")).toHaveLength(3);
    await expect(within(tray).queryByText("Close the summer season")).not.toBeInTheDocument();
    // × hides it and gives focus back to the header button.
    await userEvent.click(within(tray).getByRole("button", { name: "Hide items without a date" }));
    await expect(args.onTrayOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(toggle).toHaveFocus());
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("complementary")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    await expect(canvas.getByRole("complementary", { name: "Items without a due date" })).toBeVisible();
  },
};
/** shift+D on a tray row (or its Set due date button) opens the due-date picker; a picked day schedules the item */
export const ScheduleFromTray: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    canvas.getByRole("button", { name: /^Order the spare rotor blades/ }).focus();
    await userEvent.keyboard("{Shift>}D{/Shift}");
    const panel = await page.findByRole("dialog", { name: "Due date" });
    await expect(within(panel).queryByRole("textbox", { name: "Start date" })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Tomorrow" }));
    await expect(args.onSchedule).toHaveBeenCalledWith("u1", "2026-10-08");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Due date" })).not.toBeInTheDocument());
    await expect(canvas.getByRole("status")).toHaveTextContent("Due date set to Oct 8");
    // The Set due date button opens the same picker; Esc closes it and focus returns to the row.
    await userEvent.click(canvas.getByRole("button", { name: "Set due date for Ask about the hangar heating" }));
    await page.findByRole("dialog", { name: "Due date" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.getByRole("button", { name: /^Ask about the hangar heating/ })).toHaveFocus());
  },
};
/** shift+D on a grid chip: Clear sends the item to the tray (onClearDate) and focus lands on its day */
export const ClearFromChip: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    canvas.getByRole("button", { name: /^Renew the airworthiness certificate/ }).focus();
    await userEvent.keyboard("{Shift>}D{/Shift}");
    const panel = await page.findByRole("dialog", { name: "Due date" });
    await userEvent.click(within(panel).getByRole("button", { name: "Clear" }));
    await expect(args.onClearDate).toHaveBeenCalledWith("c4");
    await expect(canvas.getByRole("status")).toHaveTextContent("Due date cleared. Moved to No date.");
    await waitFor(() => expect(canvas.getByRole("gridcell", { name: /^Wednesday, October 14, 2026/ })).toHaveFocus());
  },
};
/** The tray remembered closed (the host keeps the choice per device) */
export const TrayClosed: Story = {
  args: { trayOpen: false },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: /^No date/ })).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("complementary")).not.toBeInTheDocument();
  },
};
/** Viewers: the tray lists items to open; nothing drags, no Set due date and no shift+D */
export const ReadOnly: Story = {
  args: { readOnly: true },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.queryByRole("button", { name: /Set due date/ })).not.toBeInTheDocument();
    canvas.getByRole("button", { name: /^Order the spare rotor blades/ }).focus();
    await userEvent.keyboard("{Shift>}D{/Shift}");
    await expect(args.onSchedule).not.toHaveBeenCalled();
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
/** The Subscribe button (rss) asks the host to open CalendarSubscribeDialog */
export const Subscribe: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Subscribe to calendar" }));
    await expect(args.onSubscribe).toHaveBeenCalled();
  },
};
/** A host that moves items between the grid and the tray (drag a row onto a day, a chip onto the tray) */
export const Interactive: Story = {
  args: { defaultPeriod: "week" },
  render: function Render(args) {
    const [items, setItems] = useState(args.items);
    const setDue = (id: string, due: string | null) => setItems((all) => all.map((it) => (it.id === id ? { ...it, due } : it)));
    return <CalendarView {...args} items={items} onSchedule={setDue} onClearDate={(id) => setDue(id, null)} />;
  },
};
/** Phone: the tray starts closed and, opened, sits above the grid */
export const Phone: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  async play({ canvas }) {
    await waitFor(() => expect(canvas.getByRole("button", { name: /^No date/ })).toHaveAttribute("aria-expanded", "false"));
  },
};
