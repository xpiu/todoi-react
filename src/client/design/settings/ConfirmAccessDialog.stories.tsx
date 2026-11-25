import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { ConfirmAccessDialog, type ConfirmAccessDialogProps } from "./ConfirmAccessDialog";

/** Opened from a button, so focus can return to it. */
function FromButton(args: ConfirmAccessDialogProps) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <ConfirmAccessDialog
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
  title: "Settings/ConfirmAccessDialog",
  component: ConfirmAccessDialog,
  render: (args) => <FromButton key={String(args.open)} {...args} />,
  args: { open: true, action: "delete your account", email: "flo@helicopterseurope.com", onClose: fn(), onPassword: fn() },
  parameters: {
    docs: { description: { component: "Sudo mode's confirm step: before deleting the account, changing the sign-in email or adding or removing a passkey, a session outside its 2-hour window asks for the password — or a passkey, when the account has one. The host stacks it over the flow's dialog (`stacked`), so Esc closes this one only; once confirmed, the action goes on and the session isn't asked again for 2 hours." } },
  },
} satisfies Meta<typeof ConfirmAccessDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialogOf = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Confirm it's you" });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const WithThePassword: Story = {
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("To delete your account, enter your password. You won't be asked again on this device for 2 hours.")).toBeVisible();
    const field = d.getByLabelText(/^Password/);
    await waitFor(() => expect(field).toHaveFocus());
    await expect(d.getByRole("button", { name: "Confirm" })).toBeDisabled();
    await expect(d.queryByRole("button", { name: "Use a passkey" })).toBeNull();
    await userEvent.type(field, "correct horse{Enter}");
    await expect(args.onPassword).toHaveBeenCalledWith("correct horse");
  },
};
export const OrAPasskey: Story = {
  args: { onPasskey: fn() },
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await userEvent.click(d.getByRole("button", { name: "Use a passkey" }));
    await expect(args.onPasskey).toHaveBeenCalledOnce();
    await expect(args.onPassword).not.toHaveBeenCalled();
  },
};
export const Checking: Story = {
  args: { busy: "password" },
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByRole("button", { name: "Checking…" })).toBeDisabled();
  },
};
export const WrongPassword: Story = { args: { passwordError: "That password isn't right.", onPasskey: fn() } };
export const WaitingForTheDevice: Story = {
  args: { onPasskey: fn(), busy: "passkey" },
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByRole("button", { name: "Waiting for your device…" })).toBeDisabled();
    await expect(d.getByText("Follow the steps your device shows.")).toBeVisible();
  },
};
export const PasskeyDidNotFinish: Story = { args: { onPasskey: fn(), passkeyError: "Your device didn't finish. Try again, or use your password." } };
export const Failed: Story = { args: { error: "the server didn't answer" } };
export const Offline: Story = {
  args: { offline: true, onPasskey: fn() },
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("You're offline. Connect to confirm it's you.")).toBeVisible();
    await expect(d.getByRole("button", { name: "Use a passkey" })).toBeDisabled();
  },
};
export const Cancel: Story = {
  args: { open: false },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Delete account" }));
    const d = await dialogOf(canvasElement);
    await userEvent.click(d.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalledWith("cancel");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Delete account" })).toHaveFocus());
  },
};
