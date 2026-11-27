import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { ConfirmEmailChangePage } from "./ConfirmEmailChangePage";

const meta = {
  title: "Auth/ConfirmEmailChangePage",
  component: ConfirmEmailChangePage,
  args: { email: "flo@todoi.com", onContinue: fn(), onOpenAccount: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Where the link in “Confirm your new email” lands, on AuthShell: the change is made (Continue to todoi), the link expired (also when the change was cancelled or replaced since), or it was already used. The failures lead to Account." } },
  },
} satisfies Meta<typeof ConfirmEmailChangePage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmed: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { name: "Email changed" })).toBeVisible();
    await expect(canvas.getByText("flo@todoi.com")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Continue to todoi" }));
    await expect(args.onContinue).toHaveBeenCalledOnce();
  },
};
export const Expired: Story = {
  args: { stage: "expired" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByText(/Your email was not changed/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Open Account" }));
    await expect(args.onOpenAccount).toHaveBeenCalledOnce();
  },
};
export const AlreadyUsed: Story = { args: { stage: "used" } };
