import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { VerifyEmailPage } from "./VerifyEmailPage";

const meta = {
  title: "Auth/VerifyEmailPage",
  component: VerifyEmailPage,
  args: { stage: "confirmed", onContinue: fn(), onOpenAccount: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Where the link in the “Confirm your email” message lands, on AuthShell: confirmed (Continue to Todoi), expired after 24 hours, or a link that doesn't work. Both failures lead to Account, where Settings › Notifications sends a new link." } },
  },
} satisfies Meta<typeof VerifyEmailPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmed: Story = {
  args: { email: "info@todoi.org" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await expect(canvas.getByText("info@todoi.org")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Continue to Todoi" }));
    await expect(args.onContinue).toHaveBeenCalledOnce();
  },
};
export const ConfirmedSignedOut: Story = { args: { email: null } };
export const Expired: Story = {
  args: { stage: "expired" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByText(/Links work for 24 hours/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Open Account" }));
    await expect(args.onOpenAccount).toHaveBeenCalledOnce();
  },
};
export const NotWorking: Story = { args: { stage: "invalid" } };
