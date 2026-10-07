import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import type { CalendarItem } from "./calendar";
import { CalendarDayList } from "./CalendarDayList";

const ITEMS: CalendarItem[] = [
  { id: "c3", itemId: "HE-101", title: "Hire a second mechanic", done: true, due: "2026-10-07", labels: [{ color: "green", text: "Hiring" }] },
  {
    id: "c4",
    itemId: "HE-118",
    title: "Send the pilot roster",
    due: "2026-10-07",
    priority: "High",
    assignees: [{ name: "Sam Verhoeven" }],
    attachments: 2,
    subitems: [
      { id: "s1", itemId: "HE-122", title: "Check licence expiry dates", done: true },
      { id: "s2", itemId: "HE-123", title: "Share it with the ops desk", done: false },
    ],
  },
  { id: "s1", itemId: "HE-110", title: "Annual maintenance window", start: "2026-10-05", due: "2026-10-09", labels: [{ color: "blue", text: "Ops" }] },
];

const meta = {
  title: "Calendar/CalendarDayList",
  component: CalendarDayList,
  decorators: [(Story) => <div style={{ maxWidth: 820 }}><Story /></div>],
  // A fixed day so the story does not change day to day.
  args: { date: new Date(2026, 9, 7), items: ITEMS, onOpenItem: fn(), onToggleDone: fn(), onToggleSubitem: fn(), onAddItem: fn() },
  parameters: { docs: { description: { component: "The calendar's Day period: the day's items as ListRows in one card, done rows last, with an \"Add an item\" row. CalendarView filters the items that cover the day; toggles, opens and adds go to the caller by item id or ISO day." } } },
} satisfies Meta<typeof CalendarDayList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithItems: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await expect(canvas.getByText("3 items")).toBeVisible();
    // The rows (each a listitem) sit in a list of their own; the empty note and the add row stay outside.
    const rows = canvas.getByRole("list", { name: "Items on this day" });
    await expect(within(rows).getAllByRole("listitem").filter((li) => li.parentElement?.closest('[role="list"]') === rows)).toHaveLength(3);
    await expect(rows).not.toContainElement(canvas.getByRole("button", { name: "Add an item" }));
    // Done rows sort last.
    const titles = [...canvasElement.querySelectorAll(".td-lgroup > .td-lrow .td-lrow-title")].map((n) => n.textContent);
    await expect(titles.at(-1)).toBe("Hire a second mechanic");
    const roster = canvas.getByText("Send the pilot roster").closest<HTMLElement>(".td-lrow")!;
    await userEvent.click(roster.querySelector<HTMLElement>('[role="checkbox"]')!);
    await expect(args.onToggleDone).toHaveBeenCalledWith("c4", true);
    const sub = canvas.getByText("Share it with the ops desk").closest<HTMLElement>(".td-lrow")!;
    await userEvent.click(sub.querySelector<HTMLElement>('[role="checkbox"]')!);
    await expect(args.onToggleSubitem).toHaveBeenCalledWith("c4", "s2", true);
    await userEvent.click(canvas.getByText("Annual maintenance window"));
    await expect(args.onOpenItem).toHaveBeenCalledWith("s1");
    await userEvent.click(canvas.getByRole("button", { name: "Add an item" }));
    await expect(args.onAddItem).toHaveBeenCalledWith("2026-10-07");
  },
};
export const Empty: Story = {
  args: { items: [] },
  async play({ canvas }) {
    await expect(canvas.getByText("No items")).toBeVisible();
    await expect(canvas.queryByRole("list")).not.toBeInTheDocument();
    await expect(canvas.getByText("Nothing lands on this day.")).toBeVisible();
  },
};
export const WithoutKeysOrLabels: Story = {
  args: { showItemIds: false, showLabels: false },
  async play({ canvas }) {
    await expect(canvas.getByRole("list", { name: "Items on this day" })).toBeVisible();
    await expect(canvas.queryByText("HE-118")).not.toBeInTheDocument();
  },
};
export const ReadOnly: Story = {
  args: { onAddItem: undefined, onToggleDone: undefined, onToggleSubitem: undefined },
  async play({ canvas }) {
    await expect(canvas.getByRole("list", { name: "Items on this day" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Add an item" })).not.toBeInTheDocument();
  },
};
