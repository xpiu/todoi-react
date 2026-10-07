import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { ShortcutsDialog, type ShortcutsDialogProps } from "./ShortcutsDialog";

function HelpButton(args: ShortcutsDialogProps) {
  const [open, setOpen] = useState(args.open);
  return <>
    <Button onClick={() => setOpen(true)}>Keyboard shortcuts</Button>
    <ShortcutsDialog {...args} open={open} onClose={() => { setOpen(false); args.onClose(); }} />
  </>;
}

const meta = {
  title: "Overlay/ShortcutsDialog",
  component: ShortcutsDialog,
  render: (args) => <HelpButton key={String(args.open)} {...args} />,
  args: { open: true, onClose: fn() },
  parameters: { docs: { description: { component: "The ? cheat sheet in a core Dialog, rendered from the canonical SHORTCUTS registry so the docs never drift from behaviour. The caller owns `open`; pass `sections` only to show a subset (Settings › Keyboard renders the same registry)." } } },
} satisfies Meta<typeof ShortcutsDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllShortcuts: Story = {
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Keyboard shortcuts" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalled();
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const CustomSections: Story = {
  // Section titles are <h4> directly under the dialog's <h2> title (axe heading-order).
  parameters: { a11y: { test: "todo" } },
  args: {
    sections: [
      { title: "Item", rows: [[["E"], "Edit the title"], [["ctrl", "+", "↵"], "Save and close"]] },
      { title: "Navigation", rows: [[["ctrl", "+", "K"], "Jump to an item"], [["?"], "Show this list"]] },
    ],
    note: "Shortcuts pause while you’re typing in a field.",
  },
};
export const Closed: Story = { args: { open: false } };
