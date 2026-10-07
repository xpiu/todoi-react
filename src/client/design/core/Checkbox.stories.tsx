import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";

import { Checkbox, type CheckboxProps } from "./Checkbox";

// Story state models the caller: the component reports the next value and never stores it.
function ControlledCheckbox(args: CheckboxProps) {
  const [checked, setChecked] = useState(!!args.checked);
  return <Checkbox {...args} checked={checked} onChange={(next) => { setChecked(next); args.onChange?.(next); }} />;
}

const meta = {
  title: "Core/Checkbox",
  component: Checkbox,
  render: (args) => <ControlledCheckbox key={String(args.checked)} {...args} />,
  args: { label: "Book the hangar slot", checked: false, onChange: fn() },
  parameters: { docs: { description: { component: "A controlled button with role=\"checkbox\": the caller owns `checked` and updates it from onChange. Square for checklist rows, circle for the item-complete toggle. Never nest it inside another button (make the row a div[role=button]); without a visible label, pass aria-label. `recurring` holds the check for 650ms while the caller reopens the item on its next due." } } },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ChecklistRow: Story = {
  async play({ args, canvas, userEvent }) {
    const box = canvas.getByRole("checkbox", { name: "Book the hangar slot" });
    await userEvent.click(box);
    await expect(args.onChange).toHaveBeenLastCalledWith(true);
    await expect(box).toBeChecked();
    box.focus();
    await userEvent.keyboard(" ");
    await expect(args.onChange).toHaveBeenLastCalledWith(false);
    await expect(box).not.toBeChecked();
  },
};
export const Checked: Story = { args: { checked: true } };
export const CompleteToggle: Story = { args: { shape: "circle", label: undefined, "aria-label": "Complete item" } };
export const CompleteToggleChecked: Story = { args: { shape: "circle", label: undefined, "aria-label": "Complete item", checked: true } };
export const Recurring: Story = {
  // The caller keeps a recurring item unchecked (it reopens on the next due); the check is held briefly.
  render: (args) => <Checkbox {...args} />,
  args: { shape: "circle", recurring: true, label: undefined, "aria-label": "Complete recurring item" },
  async play({ args, canvas, userEvent }) {
    const box = canvas.getByRole("checkbox", { name: "Complete recurring item" });
    await userEvent.click(box);
    await expect(args.onChange).toHaveBeenCalledWith(true);
    const tick = box.querySelector(".td-check-box")!;
    await expect(tick).toHaveClass("td-check-box-on");
    await waitFor(() => expect(tick).not.toHaveClass("td-check-box-on"), { timeout: 2000 });
  },
};
export const LongLabel: Story = {
  decorators: [(Story) => <div style={{ maxWidth: 280 }}><Story /></div>],
  args: { label: "Confirm the delivery date, optional equipment, maintenance plan and training schedule with the customer" },
};
export const Disabled: Story = {
  args: { disabled: true, checked: true },
  async play({ args, canvas }) {
    const box = canvas.getByRole("checkbox", { name: "Book the hangar slot" });
    await expect(box).toBeDisabled();
    box.click();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};
