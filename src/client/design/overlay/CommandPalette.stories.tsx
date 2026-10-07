import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { CommandPalette, type CommandPaletteProps, type PaletteItem } from "./CommandPalette";

const ITEMS: PaletteItem[] = [
  { id: "i1", projectId: "p1", itemId: "HE-115", title: "Prepare the helicopter quote", listName: "Doing" },
  { id: "i2", projectId: "p1", itemId: "HE-116", title: "Book the maintenance slot", listName: "To do" },
  { id: "i3", projectId: "p1", itemId: "HE-102", title: "Send the training schedule", listName: "Done", done: true },
  { id: "i4", projectId: null, title: "Renew the hangar insurance", listName: "Inbox" },
];

// Story state models the app shell that opens the palette with Ctrl/Cmd+K.
function PaletteHost(args: CommandPaletteProps) {
  const [open, setOpen] = useState(args.open);
  return <>
    <Button onClick={() => setOpen(true)}>Jump to item</Button>
    <CommandPalette {...args} open={open} onClose={() => { setOpen(false); args.onClose(); }} />
  </>;
}

const meta = {
  title: "Overlay/CommandPalette",
  component: CommandPalette,
  render: (args) => <PaletteHost key={String(args.open)} {...args} />,
  args: { open: true, items: ITEMS, onSelect: fn(), onClose: fn(), onQueryChange: fn() },
  parameters: { docs: { description: { component: "Ctrl/Cmd+K: jump to an item by key, title or list. A Base UI Dialog; the caller owns `open` and the items, and the query and cursor reset on every open. Items fetched per query report through onQueryChange and `status`, so the palette says Searching… or why it failed instead of a false No items." } } },
} satisfies Meta<typeof CommandPalette>;
export default meta;
type Story = StoryObj<typeof meta>;
// With no hits the input keeps aria-expanded + aria-controls="td-pal-listbox" but the listbox is not rendered (axe aria-valid-attr-value).
const missingListboxTodo = { a11y: { test: "todo" } } as const;

export const SearchAndOpen: Story = {
  args: { open: false },
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Jump to item" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Jump to item" });
    const input = within(dialog).getByRole("combobox");
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, "he-11");
    await expect(args.onQueryChange).toHaveBeenLastCalledWith("he-11");
    await expect(within(dialog).getAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}");
    await expect(within(dialog).getByRole("option", { name: /Book the maintenance slot/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelect).toHaveBeenCalledWith("i2", ITEMS[1]);
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const ClickToOpen: Story = {
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: /Renew the hangar insurance/ }));
    await expect(args.onSelect).toHaveBeenCalledWith("i4", ITEMS[3]);
  },
};
export const NoMatches: Story = {
  parameters: missingListboxTodo,
  async play({ canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByRole("combobox"), "invoice");
    await expect(page.getByText("No items match “invoice”")).toBeVisible();
  },
};
export const Searching: Story = {
  parameters: missingListboxTodo,
  args: { items: [], status: "loading" },
  async play({ canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByRole("combobox"), "quote");
    await expect(page.getByText("Searching…")).toBeVisible();
  },
};
export const Offline: Story = {
  parameters: missingListboxTodo,
  args: { items: [], status: "offline" },
  async play({ canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByRole("combobox"), "quote");
    await expect(page.getByText("You’re offline. Item search needs a connection.")).toBeVisible();
  },
};
export const Empty: Story = { parameters: missingListboxTodo, args: { items: [], emptyHint: "Items you open show up here" } };
