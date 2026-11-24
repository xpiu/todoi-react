import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { CalendarTray, type CalendarTrayItem } from "./CalendarTray";

const ITEMS: CalendarTrayItem[] = [
  { id: "u1", itemId: "HE-131", title: "Order the spare rotor blades", listName: "Backlog" },
  { id: "u2", itemId: "HE-132", title: "Draft the winter flight schedule for the charter customers and the school", listName: "To do" },
  { id: "u3", itemId: "HE-133", title: "Ask about the hangar heating", listName: "Backlog" },
];

const meta = {
  title: "Calendar/CalendarTray",
  component: CalendarTray,
  decorators: [(Story) => <div style={{ display: "flex", height: 420 }}><Story /></div>],
  args: { items: ITEMS, onOpenItem: fn(), onSetDate: fn(), onDropItem: fn(), onClose: fn() },
  parameters: { docs: { description: { component: "The \"No date\" tray CalendarView mounts beside the Month and Week grids: open items without a due date. A row is two sibling buttons — the item (opens it; drags onto a day to set its due date) and \"Set due date\" (the keyboard and touch twin, opens the due-date picker at the row). A grid chip dropped on the tray clears its due date (onDropItem). Loading, error, empty and read-only states." } } },
} satisfies Meta<typeof CalendarTray>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("complementary", { name: "Items without a due date" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "No date" })).toBeVisible();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: /^Order the spare rotor blades/ }));
    await expect(args.onOpenItem).toHaveBeenCalledWith("u1");
    await userEvent.click(canvas.getByRole("button", { name: "Set due date for Ask about the hangar heating" }));
    await expect(args.onSetDate).toHaveBeenCalledWith("u3", expect.any(HTMLElement));
    await userEvent.click(canvas.getByRole("button", { name: "Hide items without a date" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};
/** "5 of 12" while filters hide some undated items */
export const FilteredCount: Story = { args: { count: "3 of 7" } };
/** A chip held over the tray (the touch layer forces the cue; a native drag sets it itself) */
export const DropActive: Story = {
  args: { dropActive: true },
  async play({ canvas }) {
    await expect(canvas.getByText("Drop to clear the due date")).toBeVisible();
    await expect(canvas.getByRole("complementary")).toHaveAttribute("data-drop", "true");
  },
};
export const Empty: Story = {
  args: { items: [] },
  async play({ canvas }) {
    await expect(canvas.getByText("No items without a date")).toBeVisible();
    await expect(canvas.getByText("Drag an item here to clear its due date.")).toBeVisible();
  },
};
export const Loading: Story = {
  args: { state: "loading", count: "–" },
  async play({ canvas }) {
    await expect(canvas.getByText("Loading items without a date")).toBeInTheDocument();
  },
};
export const Failed: Story = {
  args: { state: { error: "The server didn't answer.", onRetry: fn() } },
  async play({ canvas, userEvent }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn't load items without a date");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
  },
};
/** Viewers: rows open the item, nothing drags, no Set due date, no drop */
export const ReadOnly: Story = {
  args: { readOnly: true },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button", { name: /Set due date/ })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /^Order the spare rotor blades/ })).not.toHaveAttribute("draggable");
  },
};
