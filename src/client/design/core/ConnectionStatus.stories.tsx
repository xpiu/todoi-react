import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { ConnectionStatus } from "./ConnectionStatus";

const meta = {
  title: "Core/ConnectionStatus",
  component: ConnectionStatus,
  // `online` is forced in every story so the preview never depends on the machine's network.
  args: { online: false, pending: 3, onSyncNow: fn(), onOpenSettings: fn() },
  parameters: { docs: { description: { component: "The app frame's offline and queued-edits pill (connectivity is never a Toast). The caller passes the sync queue state; `online` overrides navigator.onLine for previews and tests. It hides while idle unless showWhenIdle, briefly shows “Synced” after the queue empties, and becomes a menu (review, Sync now, settings) when any handler is given. Copy comes from connectionCopy, shared with SyncNotice." } } },
} satisfies Meta<typeof ConnectionStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OfflineWithQueue: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    const pill = canvas.getByRole("button", { name: "You're offline — 3 edits saved on this device" });
    await expect(pill).toHaveTextContent("Offline· 3");
    // The live region sits beside the menu button, not on it.
    await expect(pill).not.toHaveAttribute("aria-live");
    await expect(canvas.getByRole("status")).toHaveTextContent("You're offline — 3 edits saved on this device");
    // Explicit aria-live: Base UI modal dialogs leave live regions exposed, so it still announces behind the item overlay.
    await expect(canvas.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await userEvent.click(pill);
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu", { name: "Connection" });
    // Sync now waits for the connection.
    await expect(within(menu).getByRole("menuitem", { name: "Sync now" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(pill).toHaveFocus());
  },
};
export const QueuedOnline: Story = {
  args: { online: true, pending: 2 },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "2 edits saved on this device" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Sync now" }));
    await expect(args.onSyncNow).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const Syncing: Story = {
  args: { online: true, syncing: true, pending: 3, onSyncNow: undefined, onOpenSettings: undefined },
  async play({ canvas }) {
    // Nothing to open: no dead button, and the condition is announced by a status region.
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveTextContent("Syncing 3 edits");
    await waitFor(() => expect(canvas.getByText("Syncing 3…")).toBeVisible());
  },
};
export const NeedsReview: Story = {
  args: { online: true, pending: 0, failed: 2, onClearFailed: fn() },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "2 edits couldn't sync" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Review changes" }));
    await expect(args.onClearFailed).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const DeviceSaveFailed: Story = { args: { online: true, pending: 0, storageError: "QuotaExceededError", onSyncNow: undefined } };
export const SyncedCard: Story = {
  args: { online: true, pending: 0, showWhenIdle: true, variant: "card", onSyncNow: undefined, onOpenSettings: undefined },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveTextContent("Everything is up to date");
    await waitFor(() => expect(canvas.getByText("Synced")).toBeVisible());
  },
};
export const HiddenWhenIdle: Story = {
  args: { online: true, pending: 0 },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};
