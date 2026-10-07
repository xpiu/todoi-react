import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { Segmented, type SegmentedProps } from "./Segmented";

// Story state models the caller; Segmented is controlled through value / onChange.
function ControlledSegmented(args: SegmentedProps) {
  const [value, setValue] = useState(args.value);
  return <Segmented {...args} value={value} onChange={(id) => { setValue(id); args.onChange?.(id); }} />;
}

const VIEWS = [{ id: "list", label: "List", icon: "list" }, { id: "board", label: "Board", icon: "kanban" }, { id: "calendar", label: "Cal.", icon: "calendar" }] as const;

const meta = {
  title: "Core/Segmented",
  component: Segmented,
  render: (args) => <ControlledSegmented key={String(args.value)} {...args} />,
  args: { "aria-label": "View", value: "list", options: VIEWS, onChange: fn() },
  parameters: { docs: { description: { component: "A one-of-N toggle group for 2–4 short, equally likely options (view, theme, time format). Each segment is a button with aria-pressed inside a labelled group; the caller owns value and updates it from onChange, which fires only for a different option. Icon-only options need a title, which becomes their accessible name." } } },
} satisfies Meta<typeof Segmented>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Views: Story = {
  async play({ args, canvas, userEvent }) {
    const list = canvas.getByRole("button", { name: "List" });
    const board = canvas.getByRole("button", { name: "Board" });
    await expect(list).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(list);
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.click(board);
    await expect(args.onChange).toHaveBeenCalledWith("board");
    await expect(board).toHaveAttribute("aria-pressed", "true");
    await expect(list).toHaveAttribute("aria-pressed", "false");
  },
};
export const Small: Story = { args: { size: "sm", "aria-label": "Time format", value: "24", options: [{ id: "24", label: "24-hour" }, { id: "12", label: "12-hour" }] } };
export const Stretch: Story = {
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
  args: { stretch: true, "aria-label": "Mode", value: "light", options: [{ id: "dark", label: "Dark", icon: "moon" }, { id: "light", label: "Light", icon: "sun" }] },
};
export const IconOnly: Story = {
  args: { "aria-label": "Layout", value: "board", options: VIEWS.map(({ id, icon, label }) => ({ id, icon, title: label === "Cal." ? "Calendar" : label })) },
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Calendar" }));
    await expect(canvas.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "true");
  },
};
export const DisabledOption: Story = { args: { options: [VIEWS[0], VIEWS[1], { ...VIEWS[2], disabled: true, title: "Calendar needs due dates" }] } };
export const Disabled: Story = { args: { disabled: true } };
