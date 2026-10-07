import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { SwatchGroup, type SwatchGroupProps } from "./SwatchGroup";
import { MINIMAL_DARK_BACKGROUNDS, ROUNDED_DARK_FOREGROUNDS, ROUNDED_LIGHT_BACKGROUNDS } from "./themes";

// Story state models the caller; SwatchGroup is controlled through value / onChange.
function ControlledSwatches(args: SwatchGroupProps) {
  const [value, setValue] = useState(args.value);
  return <SwatchGroup {...args} value={value} onChange={(v) => { setValue(v); args.onChange?.(v); }} />;
}

const meta = {
  title: "Core/SwatchGroup",
  component: SwatchGroup,
  render: (args) => <ControlledSwatches key={String(args.value)} {...args} />,
  args: { "aria-label": "Background colour", options: ROUNDED_LIGHT_BACKGROUNDS, value: ROUNDED_LIGHT_BACKGROUNDS[0]!.value, onChange: fn() },
  parameters: { docs: { description: { component: "A pick-one colour row (backgrounds, foreground presets) of toggle buttons with aria-pressed, a label per swatch and the shared CSS tooltip. The caller owns value; onChange fires only for a different swatch. Use labeled chips when shades are too close to tell apart, and square shape for Minimal-theme sheets." } } },
} satisfies Meta<typeof SwatchGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Backgrounds: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("button", { name: "Butter" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Mint" }));
    await expect(args.onChange).toHaveBeenCalledWith(ROUNDED_LIGHT_BACKGROUNDS[3]!.value);
    await expect(canvas.getByRole("button", { name: "Mint" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Mint" }));
    await expect(args.onChange).toHaveBeenCalledOnce();
  },
};
export const SettingsSize: Story = { args: { size: 22 } };
export const Square: Story = { args: { "aria-label": "Paper", options: MINIMAL_DARK_BACKGROUNDS, value: MINIMAL_DARK_BACKGROUNDS[0]!.value, shape: "square" } };
export const Labeled: Story = {
  args: {
    "aria-label": "Foreground",
    labeled: true,
    options: ROUNDED_DARK_FOREGROUNDS.map((f) => ({ value: f.id, label: f.label, title: f.title, swatch: `linear-gradient(90deg, ${f.list} 50%, ${f.card} 50%)` })),
    value: "carbon",
  },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Pitch" }));
    await expect(args.onChange).toHaveBeenCalledWith("pitch");
  },
};
export const NoneSelected: Story = { args: { value: null } };
export const Disabled: Story = { args: { disabled: true } };
