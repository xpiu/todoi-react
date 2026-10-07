import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";

import { InvitePage } from "./InvitePage";

const meta = {
  title: "Auth/InvitePage",
  component: InvitePage,
  args: {
    invite: {
      project: { name: "Helicopters Europe", icon: "kanban", color: "var(--label-blue)", description: "Quotes, deliveries and maintenance for the European fleet." },
      groupName: "Sales",
      itemCount: 42,
      memberCount: 6,
      inviter: "Flo Zuallaert",
      role: "editor",
      email: "sam@helicopters.eu",
      expiresAt: "2026-10-21T12:00:00.000Z",
    },
    state: "open",
    signedIn: true,
    user: { name: "Sam Verhoeven", email: "sam@helicopters.eu", color: "var(--label-teal)" },
    onAccept: fn(),
    onDecline: fn(),
    onLogin: fn(),
    onCreateAccount: fn(),
    onSwitchAccount: fn(),
    onOpenProject: fn(),
  },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "What an invite link opens: the project, who invited you and as which role, then exactly the next step for `state` (open, expired, revoked, member, accepted) and sign-in status. The screen owns the request: onAccept may return a promise, the button waits on it and shows the reason when it rejects." } },
  },
} satisfies Meta<typeof InvitePage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Flo Zuallaert invited you to join");
    await userEvent.click(canvas.getByRole("button", { name: "Accept invite" }));
    await expect(args.onAccept).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Not you?" }));
    await expect(args.onSwitchAccount).toHaveBeenCalledOnce();
  },
};
export const AcceptFails: Story = {
  args: { onAccept: fn(() => Promise.reject(new Error("the invite was already used"))) },
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Couldn't accept the invite: the invite was already used"));
    await expect(canvas.getByRole("button", { name: "Accept invite" })).toBeEnabled();
  },
};
export const SignedOut: Story = {
  args: { signedIn: false, user: undefined },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Log in to accept" }));
    await expect(args.onLogin).toHaveBeenCalledOnce();
    await expect(canvas.getByText("The invite was sent to sam@helicopters.eu")).toBeVisible();
  },
};
export const Expired: Story = { args: { state: "expired" } };
export const Revoked: Story = { args: { state: "revoked", invite: { project: { name: "Helicopters Europe", icon: "kanban" }, role: "editor", inviter: null } } };
export const AlreadyMember: Story = {
  args: { state: "member" },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Open project" }));
    await expect(args.onOpenProject).toHaveBeenCalledOnce();
  },
};
export const Accepted: Story = { args: { state: "accepted", invite: { project: { name: "Helicopters Europe" }, role: "viewer", inviter: "Flo Zuallaert" } } };
