import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { GuestBar } from "./GuestBar";

const meta = {
  title: "Auth/GuestBar",
  component: GuestBar,
  args: { reason: "public", onLogin: fn(), onCreateAccount: fn(), onRequestAccess: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The persistent read-only notice under the top bar for a public project opened as a guest, or for a Viewer. It never dismisses. Pass only the callbacks the person can use: Log in and Create an account show while signed out; Ask for access shows whenever onRequestAccess is given, and `requested` disables it. AppShell marks the content wrapper data-readonly so the stylesheet hides edit affordances." } },
  },
} satisfies Meta<typeof GuestBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PublicSignedOut: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("Public project · read only");
    await userEvent.click(canvas.getByRole("button", { name: "Log in" }));
    await expect(args.onLogin).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Ask for access" }));
    await expect(args.onRequestAccess).toHaveBeenCalledOnce();
  },
};
export const PublicSignedIn: Story = {
  args: { signedIn: true },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();
  },
};
export const AccessRequested: Story = {
  args: { signedIn: true, requested: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Access requested" })).toBeDisabled();
  },
};
export const Viewer: Story = {
  args: { reason: "viewer", projectName: "Helicopters Europe", signedIn: true, onLogin: undefined, onCreateAccount: undefined, onRequestAccess: undefined },
  async play({ canvas }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("You're a viewer in “Helicopters Europe”");
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};
