import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { ProgressBar } from "./ProgressBar";

const meta = {
  title: "Core/ProgressBar",
  component: ProgressBar,
  args: { value: 33, "aria-label": "Checklist 2 of 6", style: { width: 160 } },
  parameters: { docs: { description: { component: "A slim determinate progress bar (role=\"progressbar\", 0–100, clamped and rounded for assistive tech). Always pass an aria-label that states what is progressing, e.g. \"Checklist 2 of 6\". Width comes from the container or style; color and height tune the fill." } } },
} satisfies Meta<typeof ProgressBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Checklist: Story = {
  async play({ canvas }) {
    await expect(canvas.getByRole("progressbar", { name: "Checklist 2 of 6" })).toHaveAttribute("aria-valuenow", "33");
  },
};
export const Empty: Story = { args: { value: 0, "aria-label": "Checklist 0 of 6" } };
export const Complete: Story = { args: { value: 100, "aria-label": "Checklist 6 of 6", color: "var(--success-icon)" } };
export const ThinUpload: Story = { args: { value: 80, height: 4, color: "var(--blue-500)", "aria-label": "Upload" } };
export const Clamped: Story = {
  args: { value: 140, "aria-label": "Over budget" },
  async play({ canvas }) {
    await expect(canvas.getByRole("progressbar", { name: "Over budget" })).toHaveAttribute("aria-valuenow", "100");
  },
};
