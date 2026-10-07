import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { ItemPicker, type PickableItem } from "./ItemPicker";

const ITEMS: PickableItem[] = [
  { id: "i1", itemId: "HE-112", title: "Prepare the helicopter quote", listName: "Doing", status: "DOING" },
  { id: "i2", itemId: "HE-113", title: "Confirm the hangar slot", listName: "To-do", status: "TODO" },
  { id: "i3", itemId: "HE-114", title: "Send the training schedule", listName: "Done", status: "DONE", done: true },
  { id: "i4", itemId: "HE-115", title: "Draft the maintenance contract covering inspections, spare parts and on-site support", listName: "Backlog", status: "BACKLOG" },
  { id: "i5", itemId: "HE-116", title: "Book the delivery flight", listName: "New" },
];

const meta = {
  title: "Core/ItemPicker",
  component: ItemPicker,
  // Panel body only; the app mounts it inside a Popover or a Dialog.
  decorators: [(Story) => <div className="td-pop" style={{ width: 340, position: "static" }}><Story /></div>],
  args: { items: ITEMS, exclude: ["i5"], onPick: fn(), placeholder: "Search by key or title…" },
  parameters: { docs: { description: { component: "Search-and-pick one item by key, title or list name. Panel body only: mount it in a Popover or a Dialog (relations, subitems). The caller passes the candidate items and ids to exclude, and handles onPick(item); Enter picks the highlighted match and ↑↓ move the highlight from the field." } } },
} satisfies Meta<typeof ItemPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SearchAndPick: Story = {
  async play({ args, canvas, userEvent }) {
    const search = canvas.getByRole("combobox", { name: "Search by key or title…" });
    await expect(search).toHaveFocus();
    await expect(canvas.queryByRole("option", { name: /Book the delivery flight/ })).not.toBeInTheDocument();
    await userEvent.type(search, "hangar");
    await expect(canvas.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    await expect(args.onPick).toHaveBeenCalledWith(ITEMS[1]);
  },
};
export const KeyboardHighlight: Story = {
  async play({ args, canvas, userEvent }) {
    const search = canvas.getByRole("combobox", { name: "Search by key or title…" });
    await expect(canvas.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    const third = canvas.getByRole("option", { name: /HE-114/ });
    await expect(third).toHaveAttribute("aria-selected", "true");
    await expect(search).toHaveAttribute("aria-activedescendant", third.id);
    await userEvent.keyboard("{ArrowUp}{Enter}");
    await expect(args.onPick).toHaveBeenCalledWith(ITEMS[1]);
  },
};
export const ClickARow: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("option", { name: /HE-115/ }));
    await expect(args.onPick).toHaveBeenCalledWith(ITEMS[3]);
  },
};
export const NoMatches: Story = {
  // The empty listbox holds only the note, no option children (aria-required-children).
  parameters: { a11y: { test: "todo" } },
  args: { emptyText: "No items match — try a key like HE-112" },
  async play({ args, canvas, userEvent }) {
    await userEvent.type(canvas.getByRole("combobox"), "zeppelin{Enter}");
    await expect(canvas.getByText("No items match — try a key like HE-112")).toBeVisible();
    await expect(args.onPick).not.toHaveBeenCalled();
  },
};
export const Limited: Story = { args: { limit: 2, exclude: [] } };
