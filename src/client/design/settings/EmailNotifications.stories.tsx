import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { emailNotificationsGroup, type EmailKind, type EmailNotificationsOptions } from "./EmailNotifications";
import { SettingsCard } from "./SettingsShell";

const DEFAULTS: Record<EmailKind, boolean> = { emailMentions: true, emailAssignments: true, emailComments: false, emailInvites: true };
const ALL_OFF: Record<EmailKind, boolean> = { emailMentions: false, emailAssignments: false, emailComments: false, emailInvites: false };

/** The group as Settings › Notifications renders it, holding the switches' state like the prefs store does. */
function Group(props: Omit<EmailNotificationsOptions, "values" | "onChange"> & { initial?: Record<EmailKind, boolean>; onChange: EmailNotificationsOptions["onChange"] }) {
  const [values, setValues] = useState(props.initial ?? DEFAULTS);
  return (
    <div style={{ maxWidth: 640 }}>
      <SettingsCard
        group={emailNotificationsGroup({
          ...props,
          values,
          onChange: (key, on) => {
            setValues((v) => ({ ...v, [key]: on }));
            props.onChange(key, on);
          },
        })}
      />
    </div>
  );
}

const meta = {
  title: "Settings/EmailNotifications",
  component: Group,
  args: { email: "flo@helicopterseurope.com", confirmed: true, onChange: fn(), onOpenAccount: fn(), onSendConfirmation: fn() },
  parameters: { docs: { description: { component: "Settings › Notifications › Email notifications (`emailNotificationsGroup`): one switch per kind, stored on the account (emailMentions, emailAssignments, emailComments, emailInvites), where the emails go, and the account emails that are always sent. The Inbox gets these notifications either way; a switch only adds email. Until the address is confirmed the switches are disabled and the group offers the confirmation link." } } },
} satisfies Meta<typeof Group>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  async play({ args, canvas, userEvent }) {
    const comments = canvas.getByRole("switch", { name: "Email me about comments" });
    await expect(comments).not.toBeChecked();
    await expect(canvas.getByRole("switch", { name: "Email me about mentions" })).toBeChecked();
    await userEvent.click(comments);
    await expect(args.onChange).toHaveBeenCalledWith("emailComments", true);
    await expect(comments).toBeChecked();
    await expect(canvas.getByText("Account emails")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Account" }));
    await expect(args.onOpenAccount).toHaveBeenCalledOnce();
  },
};
export const AllOff: Story = { args: { initial: ALL_OFF } };
export const AddressNotConfirmed: Story = {
  args: { confirmed: false },
  async play({ args, canvas, userEvent }) {
    for (const s of canvas.getAllByRole("switch")) await expect(s).toBeDisabled();
    await expect(canvas.getByText("Confirm this address to get emails")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Send confirmation" }));
    await expect(args.onSendConfirmation).toHaveBeenCalledOnce();
  },
};
export const ConfirmationSent: Story = { args: { confirmed: false, confirmation: "sent" } };
export const ConfirmationFailed: Story = { args: { confirmed: false, confirmation: { error: "the mail service refused it" } } };
export const SaveFailed: Story = {
  args: { failed: { key: "emailComments", message: "the server didn't answer" } },
  async play({ canvas }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn't save: the server didn't answer. The switch is back where it was.");
  },
};
export const EmailChangePending: Story = { args: { pendingEmail: "flo@todoi.com" } };
