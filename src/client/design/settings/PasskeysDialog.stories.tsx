import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { PasskeysDialog, passkeysRow, type Passkey, type PasskeysDialogProps } from "./PasskeysDialog";
import { SettingsCard } from "./SettingsShell";

const KEYS: Passkey[] = [
  { id: "pk1", name: "Chrome on macOS", added: "Nov 2, 2026", lastUsed: "2 hours ago", thisDevice: true },
  { id: "pk2", name: "iPhone", added: "Oct 14, 2026" },
];

/** Opened from the Passkeys row's Manage, as in Settings › Account, so focus can return to it. The list
 *  follows the callbacks, as the host's does. */
function FromRow(args: PasskeysDialogProps) {
  const [open, setOpen] = useState(args.open);
  const [keys, setKeys] = useState(args.passkeys ?? []);
  return (
    <>
      <Button icon="fingerprint" onClick={() => setOpen(true)}>
        Manage
      </Button>
      <PasskeysDialog
        {...args}
        open={open}
        passkeys={keys}
        onClose={(reason) => {
          setOpen(false);
          args.onClose(reason);
        }}
        onRename={(id, name) => {
          setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, name } : k)));
          args.onRename?.(id, name);
        }}
        onRemove={(id) => {
          setKeys((ks) => ks.filter((k) => k.id !== id));
          args.onRemove?.(id);
        }}
      />
    </>
  );
}

const meta = {
  title: "Settings/PasskeysDialog",
  component: PasskeysDialog,
  render: (args) => <FromRow key={String(args.open)} {...args} />,
  args: { open: true, passkeys: KEYS, onClose: fn(), onAdd: fn(), onRename: fn(), onRemove: fn() },
  parameters: {
    docs: { description: { component: "The account's passkeys on the shared Dialog: rename in place (↵ or Save; Esc cancels and keeps the dialog open), remove with a confirm on the row (the host raises a toast; there is no Undo), and Add, which hands over to the browser's own prompt (“Waiting for your device…”, then the reason and “Try again”). `passkeysRow` is the Settings › Account › Sign-in methods row that opens it." } },
  },
} satisfies Meta<typeof PasskeysDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialogOf = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Passkeys" });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const YourPasskeys: Story = {
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("This device")).toBeVisible();
    await expect(d.getByText("Added Nov 2, 2026 · Last used 2 hours ago")).toBeVisible();
    await expect(d.getByText("Added Oct 14, 2026 · Never used")).toBeVisible();
    await waitFor(() => expect(d.getByRole("button", { name: "Done" })).toHaveFocus());
  },
};

export const RenameInPlace: Story = {
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await userEvent.click(d.getByRole("button", { name: "Rename iPhone" }));
    const field = d.getByLabelText("Passkey name");
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.clear(field);
    await userEvent.type(field, "Work phone{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("pk2", "Work phone");
    await waitFor(() => expect(d.getByRole("button", { name: "Rename Work phone" })).toHaveFocus());
    // Esc in the field cancels the rename only.
    await userEvent.click(d.getByRole("button", { name: "Rename Work phone" }));
    await userEvent.type(d.getByLabelText("Passkey name"), " 2");
    await userEvent.keyboard("{Escape}");
    await expect(d.getByText("Work phone")).toBeVisible();
    await expect(args.onClose).not.toHaveBeenCalled();
    await expect(args.onRename).toHaveBeenCalledOnce();
  },
};

export const RemoveConfirmedOnTheRow: Story = {
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await userEvent.click(d.getByRole("button", { name: "Remove iPhone" }));
    await expect(d.getByText("Remove “iPhone”?")).toBeVisible();
    await waitFor(() => expect(d.getByRole("button", { name: /^Remove$/ })).toHaveFocus());
    // Esc closes the confirm first and returns to the row's trash button.
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(d.getByRole("button", { name: "Remove iPhone" })).toHaveFocus());
    await userEvent.click(d.getByRole("button", { name: "Remove iPhone" }));
    await userEvent.click(d.getByRole("button", { name: /^Remove$/ }));
    await expect(args.onRemove).toHaveBeenCalledWith("pk2");
    await waitFor(() => expect(d.getByRole("button", { name: "Rename Chrome on macOS" })).toHaveFocus());
    await expect(d.queryByText("iPhone")).toBeNull();
  },
};
export const RemoveConfirm: Story = { args: { defaultRemoving: "pk1" } };
export const RenameField: Story = { args: { defaultEditing: "pk1" } };

export const NoPasskeysYet: Story = {
  args: { passkeys: [] },
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("No passkeys yet")).toBeVisible();
    const add = d.getByRole("button", { name: "Add a passkey" });
    await waitFor(() => expect(add).toHaveFocus());
    await userEvent.click(add);
    await expect(args.onAdd).toHaveBeenCalledOnce();
  },
};
export const WaitingForTheDevice: Story = {
  args: { passkeys: [], addState: "waiting" },
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByRole("button", { name: "Waiting for your device…" })).toBeDisabled();
    await expect(d.getByText("Follow the steps your device shows.")).toBeVisible();
  },
};
export const DeviceDidNotFinish: Story = { args: { addError: "Your device didn't finish. Nothing was added." } };
export const Loading: Story = { args: { passkeys: [], loading: true } };
export const ListFailed: Story = { args: { passkeys: [], listError: "the server didn't answer" } };
export const RemoveFailed: Story = { args: { error: "Couldn't remove the passkey: the server didn't answer" } };
export const UnsupportedBrowser: Story = {
  args: { passkeys: [], supported: false },
  async play({ canvasElement }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("This browser can't create passkeys. Try a newer browser, or your phone.")).toBeVisible();
    await expect(d.getByRole("button", { name: "Add a passkey" })).toBeDisabled();
  },
};
export const Offline: Story = { args: { offline: true } };
export const RemoveBlocked: Story = { args: { removeBlocked: "This passkey is your only way to log in. Add a password or another passkey first." } };
export const ManyAndLongNames: Story = {
  args: {
    passkeys: [
      { id: "l1", name: "Florentine's MacBook Pro 16-inch (work, the one with the cracked corner)", added: "Nov 2, 2026", lastUsed: "today", thisDevice: true },
      ...Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, name: `YubiKey ${i + 1}`, added: "Sep 30, 2026", lastUsed: i % 2 ? "Oct 30" : undefined })),
    ],
  },
};

/** Settings › Account › Sign-in methods › Passkeys, with and without passkeys. */
export const PasskeysRows: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <SettingsCard group={{ id: "none", title: "No passkeys", rows: [passkeysRow({ count: 0, onOpen: () => undefined })] }} />
      <SettingsCard group={{ id: "two", title: "Two passkeys", rows: [passkeysRow({ count: 2, onOpen: () => undefined })] }} />
    </div>
  ),
  async play({ canvas }) {
    await expect(canvas.getByText("None yet · Log in with your fingerprint, face or screen lock")).toBeVisible();
    await expect(canvas.getByText("2 passkeys · Log in with your fingerprint, face or screen lock")).toBeVisible();
  },
};
