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
    await userEvent.click(pill);
    const page = within(canvasElement.ownerDocument.body);
    // Base UI names the menu after its trigger, so it reads the status message.
    const menu = await page.findByRole("menu", { name: "You're offline — 3 edits saved on this device" });
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
export const Syncing: Story = { args: { online: true, syncing: true, pending: 3, onSyncNow: undefined, onOpenSettings: undefined } };
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
    await expect(canvas.getByRole("button", { name: "Everything is up to date" })).toHaveTextContent("Synced");
  },
};
export const HiddenWhenIdle: Story = {
  args: { online: true, pending: 0 },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};
