import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { ResetPasswordPage } from "./ResetPasswordPage";

const meta = {
  title: "Auth/ResetPasswordPage",
  component: ResetPasswordPage,
  args: { stage: "request", onSend: fn(), onSave: fn(), onBackToLogin: fn(), onContinue: fn(), onRequestAgain: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Both ends of the password reset flow in one card. The screen owns `stage`: request → sent after onSend, and the emailed link lands on new → done after onSave, or expired. Pass `busy` while a request runs and `error` when it fails; the page only keeps the typed email, password and the Log out other devices choice." } },
  },
} satisfies Meta<typeof ResetPasswordPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Request: Story = {
  async play({ args, canvas, userEvent }) {
    const submit = canvas.getByRole("button", { name: "Send reset link" });
    await expect(submit).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("Email"), "flo@todoi.com");
    await userEvent.click(submit);
    await expect(args.onSend).toHaveBeenCalledWith("flo@todoi.com");
    await userEvent.click(canvas.getByRole("button", { name: "Back to log in" }));
    await expect(args.onBackToLogin).toHaveBeenCalledOnce();
  },
};
export const RequestFailed: Story = { args: { email: "flo@todoi.com", error: "Couldn't send the link. Try again in a moment." } };
export const Sent: Story = {
  args: { stage: "sent", email: "flo@todoi.com" },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Send it again" }));
    await expect(args.onSend).toHaveBeenCalledWith("flo@todoi.com");
    await userEvent.click(canvas.getByRole("button", { name: "Use a different email" }));
    await expect(args.onRequestAgain).toHaveBeenCalledOnce();
  },
};
export const NewPassword: Story = {
  args: { stage: "new", email: "flo@todoi.com" },
  async play({ args, canvas, userEvent }) {
    const save = canvas.getByRole("button", { name: "Save password and log in" });
    await expect(save).toBeDisabled();
    await userEvent.type(canvas.getByLabelText(/^New password/), "a much longer phrase");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Log out other devices" }));
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledWith({ password: "a much longer phrase", signOutOthers: false });
  },
};
export const NewPasswordRejected: Story = { args: { stage: "new", email: "flo@todoi.com", error: "That password is too common." } };
export const Saving: Story = { args: { stage: "new", email: "flo@todoi.com", busy: true } };
export const Done: Story = {
  args: { stage: "done" },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Continue to Todoi" }));
    await expect(args.onContinue).toHaveBeenCalledOnce();
  },
};
export const Expired: Story = {
  args: { stage: "expired" },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Send a new link" }));
    await expect(args.onRequestAgain).toHaveBeenCalledOnce();
  },
};
