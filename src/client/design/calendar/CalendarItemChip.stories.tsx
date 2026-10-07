import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { CalendarItemChip } from "./CalendarItemChip";

const meta = {
  title: "Calendar/CalendarItemChip",
  component: CalendarItemChip,
  // A chip fills its day cell; model a cell's width.
  decorators: [(Story) => <div style={{ width: 160, padding: 4, background: "var(--surface-list)" }}><Story /></div>],
  args: { title: "Prepare the helicopter quote", itemId: "HE-115", labels: [{ color: "orange" }], onClick: fn() },
  parameters: { docs: { description: { component: "One item on a calendar day cell, rendered by CalendarGrid: up to three label bars, the title and the mono key. done shows a green check and overdue a red clock; the grid computes both. Set dragId (and dragFrom, the cell's ISO day) to make it draggable for rescheduling; onClick opens the item." } } },
} satisfies Meta<typeof CalendarItemChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: /Prepare the helicopter quote/ }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const ManyLabels: Story = { args: { labels: [{ color: "orange" }, { color: "blue" }, { color: "teal" }, { color: "red" }] } };
export const Done: Story = { args: { done: true } };
export const Overdue: Story = { args: { overdue: true } };
export const WithoutKey: Story = { args: { showId: false, labels: [] } };
export const LongTitle: Story = { args: { title: "Prepare a detailed helicopter quote covering delivery, training and payment terms" } };
export const Draggable: Story = {
  args: { dragId: "c1", dragFrom: "2026-10-02" },
  async play({ canvas }) {
    const chip = canvas.getByRole("button", { name: /Prepare the helicopter quote/ });
    await expect(chip).toHaveAttribute("draggable", "true");
    await expect(chip).toHaveAttribute("data-drag-from", "2026-10-02");
  },
};
