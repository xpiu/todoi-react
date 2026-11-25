import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { ChangeEmailDialog, primaryEmailRow, type ChangeEmailDialogProps } from "./ChangeEmailDialog";
import { SettingsCard } from "./SettingsShell";

const OLD = "flo@helicopterseurope.com";
const NEW = "flo@todoi.com";

/** Opened from a row's button, as in Settings › Account, so focus can return to it. */
function FromRow(args: ChangeEmailDialogProps) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button icon="mail" onClick={() => setOpen(true)}>
        Change email
      </Button>
      <ChangeEmailDialog
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
  title: "Settings/ChangeEmailDialog",
  component: ChangeEmailDialog,
  render: (args) => <FromRow key={String(args.open)} {...args} />,
  args: { open: true, currentEmail: OLD, onClose: fn(), onSend: fn(), onResend: fn(), onCancelChange: fn() },
  parameters: {
    docs: { description: { component: "Change the sign-in email in three stages on the shared Dialog: the new address (the host asks to confirm it's you first, outside sudo mode) → “Check your inbox” (the old address keeps working until the link is opened) → “Email changed”. The host owns the stage through `pendingEmail` / `stage`; errors stay under their field and nothing typed is cleared. `primaryEmailRow` is the Settings › Account row that opens it." } },
  },
} satisfies Meta<typeof ChangeEmailDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialogOf = async (canvasElement: HTMLElement, name = "Change email") => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const EnterTheNewAddress: Story = {
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    const field = d.getByLabelText("New email");
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.click(d.getByRole("button", { name: "Send confirmation link" }));
    await expect(d.getByText("Enter the new email address.")).toBeVisible();
    await userEvent.type(field, OLD.toUpperCase());
    await expect(d.getByText("That's already your email.")).toBeVisible();
    await userEvent.clear(field);
    await userEvent.type(field, "flo@todoi");
    await expect(d.getByText("Enter a full email address, like name@company.com.")).toBeVisible();
    await userEvent.type(field, ".com{Enter}");
    await expect(args.onSend).toHaveBeenCalledWith({ email: NEW });
  },
};
export const ServerRefused: Story = { args: { error: "the mail service refused it" } };
export const Sending: Story = { args: { busy: true } };
export const Offline: Story = {
  args: { offline: true },
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("You're offline. Connect to change your email.")).toBeVisible();
    await expect(d.getByRole("button", { name: "Send confirmation link" })).toBeDisabled();
  },
};
export const CheckYourInbox: Story = {
  args: { pendingEmail: NEW, open: false },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Change email" }));
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("Check your inbox")).toBeVisible();
    await expect(d.getByText(/Open it within 24 hours to confirm/)).toBeVisible();
    await waitFor(() => expect(d.getByRole("button", { name: "Done" })).toHaveFocus());
    await userEvent.click(d.getByRole("button", { name: "Send it again" }));
    await expect(args.onResend).toHaveBeenCalledOnce();
    await userEvent.click(d.getByRole("button", { name: "Cancel the change" }));
    await expect(args.onCancelChange).toHaveBeenCalledOnce();
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledWith("escape");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Change email" })).toHaveFocus());
  },
};
export const SentAgain: Story = { args: { pendingEmail: NEW, resent: true } };
export const LongAddressResendFailed: Story = { args: { pendingEmail: "florentine.zuallaert-vandenberghe@helicopters-europe-holding.example.com", error: "the mail service didn't answer" } };
export const SentOffline: Story = { args: { pendingEmail: NEW, offline: true } };
export const Confirmed: Story = { args: { currentEmail: NEW, stage: "confirmed" } };

/** Settings › Account › Primary email, before and while a change waits for its link. */
export const PrimaryEmailRows: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <SettingsCard group={{ id: "primary", title: "Primary email", rows: [primaryEmailRow({ email: OLD, verified: true, onOpen: () => undefined })] }} />
      <SettingsCard group={{ id: "pending", title: "Primary email, change waiting", rows: [primaryEmailRow({ email: OLD, pendingEmail: NEW, verified: true, onOpen: () => undefined })] }} />
      <SettingsCard group={{ id: "unconfirmed", title: "Primary email, not confirmed", rows: [primaryEmailRow({ email: OLD, verified: false, onOpen: () => undefined })] }} />
    </div>
  ),
  async play({ canvas }) {
    await expect(canvas.getByText(`${OLD} · Waiting for you to confirm ${NEW}`)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Review" })).toBeVisible();
    await expect(canvas.getAllByRole("button", { name: "Change email" })).toHaveLength(2);
  },
};
