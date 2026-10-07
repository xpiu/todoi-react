import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { SyncNotice } from "./SyncNotice";

const meta = {
  title: "Core/SyncNotice",
  component: SyncNotice,
  args: {
    placement: "inline",
    message: "Sync failed — GitHub didn't respond",
    detail: "Your changes are saved on this device and sync when the connection returns. Last synced 12 minutes ago.",
    action: { label: "Retry", icon: "refresh-cw", busyLabel: "Retrying…", onClick: fn() },
    secondary: { label: "Details", onClick: fn() },
    onDismiss: fn(),
  },
  parameters: { docs: { description: { component: "A persistent notice for a condition that holds right now (sync failed, offline, remote changes waiting); undoable outcomes belong in Toast, and errors never do. Show one at a time, most severe first. Danger is an alert, warn/info a status; the caller owns the retry state (action.busy) and hides it from onDismiss until the condition changes. placement=\"bottom\" pins it to the viewport." } } },
} satisfies Meta<typeof SyncNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SyncFailed: Story = {
  async play({ args, canvas, userEvent }) {
    const notice = canvas.getByRole("alert");
    await expect(notice).toHaveTextContent("Sync failed — GitHub didn't respond");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.action?.onClick).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Details" }));
    await expect(args.secondary?.onClick).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};
export const Retrying: Story = {
  args: { action: { label: "Retry", icon: "refresh-cw", busyLabel: "Retrying…", busy: true, onClick: fn() } },
  async play({ canvas }) {
    const retry = canvas.getByRole("button", { name: "Retrying…" });
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveAttribute("aria-busy", "true");
  },
};
export const Offline: Story = {
  args: { tone: "warn", message: "You're offline", detail: "3 changes are waiting and will sync when you reconnect.", action: undefined, secondary: undefined, onDismiss: undefined },
  async play({ canvas }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("You're offline");
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};
export const RemoteChanges: Story = {
  args: { tone: "info", icon: "refresh-cw", message: "New changes from GitHub", detail: "4 items changed on the remote since you opened this project.", action: { label: "Reload", onClick: fn() }, secondary: undefined },
};
export const MessageOnly: Story = { args: { detail: undefined, action: undefined, secondary: undefined, onDismiss: undefined } };
export const PinnedToBottom: Story = { args: { placement: "bottom" } };
