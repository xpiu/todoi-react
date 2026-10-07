import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Toast, type ToastProps } from "./Toast";
import { ToastPortalProvider } from "./ToastPortal";

// The app renders its single toast through ToastPortalProvider; modal shells register as hosts so the
// toast stays inside the open dialog's focus and accessibility boundary.
function ToastInsideDialog(args: ToastProps) {
  const [open, setOpen] = useState(false);
  return (
    <ToastPortalProvider toast={<Toast {...args} />}>
      <Button onClick={() => setOpen(true)}>Edit project</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Project settings">
        <p>Archived lists can be restored from the Trash.</p>
      </Dialog>
    </ToastPortalProvider>
  );
}

// The caller wires onDismiss after mount and re-renders with a fresh callback every 50ms: the timer must arm
// once dismissal turns on and keep counting down across those renders.
function LateDismiss(args: ToastProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(id);
  }, []);
  return <Toast {...args} onDismiss={tick > 0 ? () => args.onDismiss?.() : undefined} />;
}

const meta = {
  title: "Core/Toast",
  component: Toast,
  args: { message: "Moved “Prepare the helicopter quote” to Done", icon: "arrow-right", actionLabel: "Undo", shortcutHint: "⌘ Z", onAction: fn(), onDismiss: fn(), duration: 0 },
  parameters: { docs: { description: { component: "The one bottom-left toast for confirmed, undoable outcomes (and the fallback explanation of a failed request with no form to show it in); persistent conditions use SyncNotice. It is a polite status region, auto-dismisses through onDismiss after duration (hover pauses; 0 disables) and is replaced in place by the next outcome. The app owns the single toast and renders it through ToastPortalProvider so open dialogs host it." } } },
} satisfies Meta<typeof Toast>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Undo: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("Moved “Prepare the helicopter quote” to Done");
    await userEvent.click(canvas.getByRole("button", { name: /Undo/ }));
    await expect(args.onAction).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};
export const WithMeta: Story = { args: { message: "Archived 5 items", icon: "archive", meta: "4 more" } };
export const MessageOnly: Story = { args: { message: "Link copied", icon: undefined, actionLabel: undefined, shortcutHint: undefined, onDismiss: undefined } };
export const LongMessage: Story = { args: { message: "Couldn't save “Prepare a detailed helicopter quote covering delivery dates and optional equipment” — the server didn't respond", icon: "cloud-off", actionLabel: undefined, shortcutHint: undefined } };
export const AutoDismiss: Story = {
  args: { duration: 300 },
  async play({ args }) {
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledOnce(), { timeout: 2000 });
  },
};
export const AutoDismissWiredLate: Story = {
  args: { duration: 300 },
  render: (args) => <LateDismiss {...args} />,
  async play({ args }) {
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalled(), { timeout: 2000 });
  },
};
export const InsideDialog: Story = {
  render: (args) => <ToastInsideDialog {...args} />,
  async play({ canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole("status")).toBeVisible());
    await userEvent.click(canvas.getByRole("button", { name: "Edit project" }));
    const dialog = await page.findByRole("dialog", { name: "Project settings" });
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Moved “Prepare the helicopter quote” to Done"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(page.getByRole("status")).toBeVisible());
  },
};
