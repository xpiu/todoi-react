import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { AccountDeletedPage, DeleteAccountDialog, type DeleteAccountDialogProps } from "./DeleteAccountDialog";

const EMAIL = "flo@helicopterseurope.com";
const PROJECTS = [
  { name: "Website", meta: "38 items" },
  { name: "Dealers & stock", meta: "112 items" },
  { name: "A project with a much longer name than the dialog has room for", meta: "4 items" },
];
const GROUPS = [{ name: "Helicopters Europe", meta: "3 projects" }];

/** Opened from the Danger zone row's button, so focus can return to it. */
function FromRow(args: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button icon="trash-2" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <DeleteAccountDialog
        {...args}
        open={open}
        onClose={(reason) => {
          setOpen(false);
          args.onClose(reason);
        }}
      />
    </>
  );
}

const meta = {
  title: "Settings/DeleteAccountDialog",
  component: DeleteAccountDialog,
  render: (args) => <FromRow key={String(args.open)} {...args} />,
  args: { open: true, email: EMAIL, projects: PROJECTS, groups: GROUPS, attachments: { count: 214, size: "1.2 GB" }, memberOf: 2, onClose: fn(), onDelete: fn(), onExport: fn(), onLogInAgain: fn() },
  parameters: {
    docs: { description: { component: "Delete the account in two steps on the shared Dialog. Review: what goes (the projects only you work in, your project groups, the files), what you leave, Export first, and the server's blockers, which disable Continue. Confirm: type the account email (case ignored), then the red Delete account. Deletion is immediate; `AccountDeletedPage` is the signed-out end state. A stale log-in turns the confirm step into Log in again." } },
  },
} satisfies Meta<typeof DeleteAccountDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialogOf = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Delete account" });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const Review: Story = {
  args: { open: false },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    let d = await dialogOf(canvasElement);
    await waitFor(() => expect(d.getByRole("button", { name: "Keep my account" })).toHaveFocus());
    await expect(d.getByText("3 projects you own")).toBeVisible();
    await expect(d.getByText("214 attachments · 1.2 GB")).toBeVisible();
    await userEvent.click(d.getByRole("button", { name: "Continue" }));
    d = await dialogOf(canvasElement);
    const field = d.getByLabelText("Account email");
    await waitFor(() => expect(field).toHaveFocus());
    const remove = d.getByRole("button", { name: "Delete account" });
    await expect(remove).toBeDisabled();
    await userEvent.type(field, EMAIL.toUpperCase());
    await expect(remove).toBeEnabled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onDelete).toHaveBeenCalledOnce();
    await userEvent.click(d.getByRole("button", { name: "Back" }));
    d = await dialogOf(canvasElement);
    await waitFor(() => expect(d.getByRole("button", { name: "Continue" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledWith("escape");
    await expect(args.onDelete).toHaveBeenCalledOnce();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Delete" })).toHaveFocus());
  },
};
export const Blocked: Story = {
  args: { blockers: ["Transfer or delete “Website” first", "Ask Sam Verhoeven to move “Dealers & stock” out of your group “Helicopters Europe” first"] },
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByRole("alert")).toHaveTextContent("You can't delete your account yet");
    await expect(d.getByRole("button", { name: "Continue" })).toBeDisabled();
  },
};
export const OwnsNothing: Story = { args: { projects: [], groups: [], attachments: { count: 0 }, memberOf: 0 } };
export const Loading: Story = { args: { projects: [], groups: [], attachments: undefined, memberOf: 0, loading: true } };
export const ReviewFailed: Story = { args: { projects: [], groups: [], attachments: undefined, reviewError: "Couldn't reach Todoi. Check your connection" } };
export const Exporting: Story = { args: { exportState: "busy" } };
export const Exported: Story = { args: { exportState: "done" } };
export const ExportFailed: Story = { args: { exportError: "the server didn't answer" } };
export const Confirm: Story = { args: { defaultStep: "confirm" } };
export const Deleting: Story = { args: { defaultStep: "confirm", busy: true } };
export const DeleteFailed: Story = { args: { defaultStep: "confirm", error: "the server didn't answer" } };
export const ConfirmOffline: Story = { args: { defaultStep: "confirm", offline: true } };
export const LogInAgain: Story = {
  args: { defaultStep: "confirm", needsLogin: true },
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await expect(d.queryByRole("button", { name: "Delete account" })).toBeNull();
    await userEvent.click(d.getByRole("button", { name: "Log in again" }));
    await expect(args.onLogInAgain).toHaveBeenCalledOnce();
  },
};

/** The signed-out end state, on AuthShell. */
export const Deleted: StoryObj<typeof AccountDeletedPage> = {
  parameters: { layout: "fullscreen" },
  render: () => <AccountDeletedPage email={EMAIL} onCreateAccount={fn()} />,
  async play({ canvas }) {
    await expect(canvas.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Create a new account" })).toBeVisible();
  },
};
