import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRef, useState } from "react";
import { expect, fn, waitFor } from "storybook/test";

import { Switch, type SwitchProps } from "./Switch";
import { Popover, usePopover } from "./Popover";

// Story state models the caller; Switch is controlled through checked / onChange.
function ControlledSwitch(args: SwitchProps) {
  const [checked, setChecked] = useState(args.checked);
  return <Switch {...args} checked={checked} onChange={(next) => { setChecked(next); args.onChange?.(next); }} />;
}

const meta = {
  title: "Core/Switch",
  component: Switch,
  render: (args) => <ControlledSwitch key={String(args.checked)} {...args} />,
  args: { checked: false, label: "Email delivery", onChange: fn() },
  parameters: { docs: { description: { component: "An on/off control for preference rows (role=\"switch\"); list items use Checkbox instead. The caller owns checked and updates it from onChange(next). Give it a visible label or, inside a labelled settings row, an aria-label." } } },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  async play({ args, canvas, userEvent }) {
    const toggle = canvas.getByRole("switch", { name: "Email delivery" });
    await userEvent.click(toggle);
    await expect(args.onChange).toHaveBeenCalledWith(true);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard(" ");
    await expect(args.onChange).toHaveBeenLastCalledWith(false);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  },
};
export const On: Story = { args: { checked: true } };
export const LabelledByRow: Story = { args: { label: undefined, "aria-label": "Suggest shortcuts", checked: true } };
export const Disabled: Story = {
  args: { checked: true, disabled: true, label: "Managed by your workspace" },
  async play({ args, canvas }) {
    const toggle = canvas.getByRole("switch", { name: "Managed by your workspace" });
    await expect(toggle).toBeDisabled();
    toggle.click();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

const forwardedRef = createRef<HTMLButtonElement>();
function SwitchTrigger(args: SwitchProps) {
  const pop = usePopover();
  return (
    <>
      <p id="delivery-hint">Choose how items reach your Inbox.</p>
      <Popover open={pop.open} onOpenChange={pop.setOpen} role="dialog" aria-label="Delivery settings" trigger={<ControlledSwitch {...args} ref={forwardedRef} id="delivery-switch" aria-describedby="delivery-hint" data-testid="delivery-switch" />}>
        Delivery settings
      </Popover>
    </>
  );
}

export const ComposedTrigger: Story = {
  render: (args) => <SwitchTrigger {...args} />,
  args: { onFocus: fn(), onClick: fn() },
  async play({ args, canvas, userEvent }) {
    const toggle = canvas.getByRole("switch", { name: "Email delivery" });
    await expect(toggle).toHaveAttribute("id", "delivery-switch");
    await expect(toggle).toHaveAttribute("data-testid", "delivery-switch");
    await expect(forwardedRef.current).toBe(toggle);
    await expect(toggle).toHaveAccessibleDescription("Choose how items reach your Inbox.");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(args.onFocus).toHaveBeenCalled();
    const popup = toggle.ownerDocument.querySelector('[role="dialog"][aria-label="Delivery settings"]');
    await waitFor(() => expect(popup).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    await waitFor(() => expect(toggle).toHaveFocus());
  },
};

export const PreventedClick: Story = {
  args: { onClick: (event) => event.preventDefault() },
  async play({ args, canvas, userEvent }) {
    const toggle = canvas.getByRole("switch", { name: "Email delivery" });
    await userEvent.click(toggle);
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  },
};
