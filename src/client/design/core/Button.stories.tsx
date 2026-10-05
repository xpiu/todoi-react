import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { Button } from "./Button";

const meta = {
  title: "Core/Button",
  component: Button,
  args: { children: "Add an item", onClick: fn() },
  parameters: { docs: { description: { component: "Use primary for the main action, outline/subtle for secondary actions, and danger for destructive confirmation. Chrome variants belong on the app frame. Native props and refs pass through for Base UI composition." } } },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary", icon: "plus" },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Add an item" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Large: Story = { args: { variant: "primary", size: "lg" } };
export const Disabled: Story = {
  args: { disabled: true },
  async play({ args, canvas }) {
    const button = canvas.getByRole("button", { name: "Add an item" });
    await expect(button).toBeDisabled();
    // Native activation respects disabled; pointer interaction is blocked by the component's CSS.
    button.click();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
