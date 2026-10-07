import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "./Button";
import { Popover, PopoverClose, type PopoverProps } from "./Popover";
import { TextField } from "./TextField";

// Story state models the caller: Popover is controlled through open / onOpenChange.
function SharePanel(args: PopoverProps) {
  const [open, setOpen] = useState(args.open);
  return (
    <Popover
      {...args}
      open={open}
      onOpenChange={(next, reason) => { setOpen(next); args.onOpenChange(next, reason); }}
      trigger={<Button variant="outline" icon="share-2">Share</Button>}
    >
      <div style={{ display: "grid", gap: "var(--sp-2)", padding: "var(--sp-3)" }}>
        <strong>Share project</strong>
        <TextField value="https://todoi.com/p/helicopters" readOnly aria-label="Project URL" />
        <PopoverClose render={<Button variant="primary">Copy project URL</Button>} />
      </div>
    </Popover>
  );
}

// anchorRef positions the panel against another element; the caller opens it from its own control.
function AnchoredPanel(args: PopoverProps) {
  const [open, setOpen] = useState(args.open);
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div style={{ display: "grid", gap: "var(--sp-2)", justifyItems: "start" }}>
      <div ref={anchor} style={{ padding: "var(--sp-2) var(--sp-3)", background: "var(--surface-card)", borderRadius: "var(--radius-md)" }}>Prepare the helicopter quote</div>
      <Button variant="outline" onClick={() => setOpen(true)}>Set due date</Button>
      <Popover {...args} open={open} anchorRef={anchor} onOpenChange={(next, reason) => { setOpen(next); args.onOpenChange(next, reason); }}>
        <div style={{ padding: "var(--sp-3)" }}>Due date panel anchored to the row</div>
      </Popover>
    </div>
  );
}

const meta = {
  title: "Core/Popover",
  component: Popover,
  render: (args) => <SharePanel key={String(args.open)} {...args} />,
  args: { open: false, onOpenChange: fn(), role: "dialog", "aria-label": "Share project", placement: "bottom-end", width: 280 },
  parameters: { docs: { description: { component: "The anchored floating surface for custom panels and pickers; use MenuButton for menus. The caller owns open state and receives a close reason (outside, escape, select, swipe…). Base UI handles outside press, nested Escape, collision flip, focus return and the portal; on phones it becomes a bottom sheet. Use role=\"dialog\" with an aria-label when the panel has its own fields, and PopoverClose for a control that should close it." } } },
} satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { args: { open: true } };
export const EscapeReturnsFocus: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Share" });
    await userEvent.click(trigger);
    await expect(args.onOpenChange).toHaveBeenCalledWith(true, undefined);
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Share project" });
    await waitFor(() => expect(panel).toContainElement(canvasElement.ownerDocument.activeElement as HTMLElement));
    await userEvent.keyboard("{Escape}");
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, "escape");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const CloseFromInside: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Share" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Share project" });
    await userEvent.click(within(panel).getByRole("button", { name: "Copy project URL" }));
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, "select");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const OutsidePress: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Share" }));
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole("dialog", { name: "Share project" });
    await userEvent.click(canvasElement.ownerDocument.body);
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, "outside");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const AnchoredElsewhere: Story = {
  args: { "aria-label": "Due date", placement: "bottom-start", width: 240 },
  render: (args) => <AnchoredPanel key={String(args.open)} {...args} />,
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Set due date" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Due date" });
    await waitFor(() => expect(panel).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, "escape");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
