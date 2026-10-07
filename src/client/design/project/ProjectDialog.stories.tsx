import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { ProjectDialog, type ProjectDialogProps } from "./ProjectDialog";

const GROUPS = [{ id: "g1", name: "Helicopters Europe" }, { id: "g2", name: "Internal" }];
const PROJECTS = [{ id: "p1", name: "Helicopter sales", icon: "rocket" as const, color: "orange" as const }, { id: "p2", name: "Marketing site", icon: "globe" as const, color: "blue" as const }];

// Story state models the caller, which owns open state; the trigger shows where focus returns.
function DialogHost(args: ProjectDialogProps) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button icon="plus" onClick={() => setOpen(true)}>{args.kind === "group" ? "New project group" : "New project"}</Button>
      <ProjectDialog
        {...args}
        open={open}
        onClose={() => {
          setOpen(false);
          args.onClose();
        }}
      />
    </>
  );
}

const meta = {
  title: "Project/ProjectDialog",
  component: ProjectDialog,
  render: (args) => <DialogHost key={String(args.open)} {...args} />,
  args: { open: true, kind: "project", groups: GROUPS, defaultGroupId: "g1", projects: PROJECTS, onCreateProject: fn(), onCreateGroup: fn(), onClose: fn() },
  parameters: { docs: { description: { component: "\"New project\" or \"New project group\" on the shared Dialog. The caller owns open state and creates the project or group; the form keeps its own draft and resets each time it opens. A returned promise keeps the dialog busy, and a rejection keeps every value and shows the reason. Enter creates, Escape cancels; the caller closes it after a successful create." } } },
} satisfies Meta<typeof ProjectDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialogOf = async (canvasElement: HTMLElement, name: string) => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const NewProject: Story = {
  async play({ args, canvasElement, userEvent }) {
    const dialog = await dialogOf(canvasElement, "New project");
    const create = dialog.getByRole("button", { name: "Create project" });
    await expect(create).toBeDisabled();
    const name = dialog.getByRole("textbox", { name: "Project name" });
    await expect(name).toHaveFocus();
    await userEvent.type(name, "Spare parts");
    await userEvent.click(dialog.getByRole("radio", { name: /To-do, Doing, Done/ }));
    await userEvent.click(create);
    await expect(args.onCreateProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Spare parts", groupId: "g1", templateId: "simple", copyFrom: null, visibility: "private", icon: "kanban", color: "blue" }));
  },
};
export const CopyExisting: Story = {
  async play({ args, canvasElement, userEvent }) {
    const dialog = await dialogOf(canvasElement, "New project");
    await userEvent.type(dialog.getByRole("textbox", { name: "Project name" }), "Sales 2027");
    await userEvent.click(dialog.getByRole("radio", { name: /Copy an existing project/ }));
    await expect(dialog.getByRole("combobox", { name: "Project to copy" })).toHaveTextContent("Helicopter sales");
    await userEvent.click(dialog.getByRole("textbox", { name: "Project name" }));
    await userEvent.keyboard("{Enter}");
    await expect(args.onCreateProject).toHaveBeenCalledWith(expect.objectContaining({ templateId: "copy", copyFrom: "p1", lists: null }));
  },
};
export const CreateFails: Story = {
  args: { onCreateProject: fn(() => Promise.reject(new Error("the name is already taken"))) },
  async play({ canvasElement, userEvent }) {
    const dialog = await dialogOf(canvasElement, "New project");
    await userEvent.type(dialog.getByRole("textbox", { name: "Project name" }), "Helicopter sales{Enter}");
    await expect(await dialog.findByText(/Couldn't create the project: the name is already taken/)).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Project name" })).toHaveValue("Helicopter sales");
  },
};
export const NewGroup: Story = {
  args: { kind: "group" },
  async play({ args, canvasElement, userEvent }) {
    const dialog = await dialogOf(canvasElement, "New project group");
    await userEvent.type(dialog.getByRole("textbox", { name: "Group name" }), "Helicopters Europe");
    await expect(dialog.getByRole("textbox", { name: "Item ID prefix" })).toHaveValue("HE");
    await userEvent.click(dialog.getByRole("button", { name: "Create group" }));
    await expect(args.onCreateGroup).toHaveBeenCalledWith({ name: "Helicopters Europe", keyPrefix: "HE" });
  },
};
export const EscapeCancels: Story = {
  args: { open: false },
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "New project" });
    await userEvent.click(trigger);
    const dialog = await dialogOf(canvasElement, "New project");
    await waitFor(() => expect(dialog.getByRole("textbox", { name: "Project name" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
