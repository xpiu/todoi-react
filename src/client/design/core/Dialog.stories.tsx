import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "./Button";
import { ConfirmDialog, Dialog, type DialogProps } from "./Dialog";
import { Select } from "./Select";
import { TextField } from "./TextField";

function ProjectDialog(args: DialogProps) {
  const [open, setOpen] = useState(args.open);
  const [group, setGroup] = useState<string | null>("marketing");
  return <>
    <Button onClick={() => setOpen(true)}>New project</Button>
    <Dialog {...args} open={open} onClose={(reason) => { setOpen(false); args.onClose(reason); }}>
      <TextField aria-label="Project name" placeholder="Project name" />
      <Select aria-label="Project group" value={group} onChange={setGroup} options={[{ value: "marketing", label: "Marketing" }, { value: "sales", label: "Sales" }]} />
    </Dialog>
  </>;
}

const meta = {
  title: "Core/Dialog",
  component: Dialog,
  render: (args) => <ProjectDialog key={String(args.open)} {...args} />,
  args: { open: false, title: "Create a project", onClose: fn() },
  parameters: { docs: { description: { component: "Base UI manages focus, Escape, and the modal portal. The caller owns open state. Nested pickers portal into the dialog so their focus and Escape handling stay inside the modal." } } },
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { args: { open: true } };
export const NestedPicker: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "New project" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Create a project" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Project group" }));
    await waitFor(() => expect(within(dialog).getByRole("option", { name: "Sales" })).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeVisible();
    await waitFor(() => expect(page.queryByRole("option", { name: "Sales" })).not.toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledWith("escape");
    await waitFor(() => expect(trigger).toHaveFocus());
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

export const ConfirmFocus: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return <>
      <Button onClick={() => setOpen(true)}>Delete project</Button>
      <ConfirmDialog open={open} danger title="Delete “Dealers & stock”?" body="Its items move to the Trash for 90 days." confirmLabel="Delete project" onConfirm={() => setOpen(false)} onClose={() => setOpen(false)} />
    </>;
  },
  // A destructive confirmation starts on Cancel, and Escape returns focus to what opened it.
  async play({ canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Delete project" });
    await userEvent.click(trigger);
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", { name: "Delete “Dealers & stock”?" });
    await waitFor(() => expect(within(dialog).getAllByRole("button", { name: "Cancel" }).at(-1)).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
