import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DueDatePill } from "./DueDatePill";

const meta = {
  title: "Board/DueDatePill",
  component: DueDatePill,
  args: { date: "Sep 12, 2025" },
  parameters: { docs: { description: { component: "A read-only due date with a clock glyph for cards, rows, and quick-add previews. The caller formats the date text and picks the state: complete (green), overdue (red), or default. The Minimal theme drops the current year; the full date stays in the tooltip." } } },
} satisfies Meta<typeof DueDatePill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ canvasElement }) {
    const pill = canvasElement.querySelector(".td-due");
    await expect(pill).toHaveAttribute("data-state", "default");
    await expect(pill).toHaveAttribute("title", "Sep 12, 2025");
  },
};
export const Overdue: Story = { args: { state: "overdue" } };
export const Complete: Story = { args: { state: "complete" } };
export const RelativeText: Story = { args: { date: "Tomorrow" } };
