import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";

const meta = {
  title: "Core/Tooltip",
  component: Tooltip,
  decorators: [(Story) => <div style={{ padding: "var(--sp-10) var(--sp-10)" }}><Story /></div>],
  args: { text: "Copy link", children: <Button variant="outline" icon="link">Copy</Button> },
  parameters: { docs: { description: { component: "The CSS-only hover/focus hint (data-tip + pseudo-elements, no portal) for icon-only controls: 2–4 words, sentence case, never the only label and never on disabled controls. Tooltip merges the attributes onto exactly one child that accepts className; IconButton and MenuButton take a tooltip prop and tipProps() spreads the same attributes onto custom controls. Set off while a menu or drag is active." } } },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Bottom: Story = {
  async play({ canvas, userEvent }) {
    const button = canvas.getByRole("button", { name: "Copy" });
    await expect(button).toHaveAttribute("data-tip", "Copy link");
    await expect(button).toHaveClass("td-btn", "td-tip");
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(getComputedStyle(button, "::after").content).toBe("\"Copy link\"");
  },
};
export const Top: Story = {
  args: { side: "top" },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Copy" })).toHaveAttribute("data-tip-side", "top");
  },
};
export const Left: Story = { args: { side: "left" } };
export const BottomEnd: Story = { args: { side: "bottom-end", text: "Hide sidebar", children: <IconButton name="panel-right" label="Hide sidebar" /> } };
export const Suppressed: Story = {
  args: { off: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Copy" })).toHaveAttribute("data-tip-off", "true");
  },
};
export const NoText: Story = {
  args: { text: "" },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Copy" })).not.toHaveAttribute("data-tip");
  },
};
