import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DueDatePill } from "./DueDatePill";

const meta = {
  title: "Board/DueDatePill",
  component: DueDatePill,
  args: { date: "Sep 12, 2025" },
  parameters: { docs: { description: { component: "A read-only due date with a clock glyph for cards, rows, and quick-add previews. Pass the date (ISO or a Date) and it is formatted in the person's date format, or pass display text such as “Tomorrow” to show it as is; the caller picks the state: complete (green), overdue (red), or default. The Minimal theme drops the year inside the current one (as of `today`); the full date stays in the tooltip." } } },
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
export const RelativeText: Story = {
  args: { date: "Tomorrow" },
  async play({ canvasElement }) {
    await expect(canvasElement.querySelector(".td-due")).toHaveTextContent("Tomorrow");
  },
};
export const IsoDate: Story = {
  args: { date: "2026-09-12", today: "2026-10-07" },
  async play({ canvasElement, globals }) {
    const pill = canvasElement.querySelector(".td-due");
    await expect(pill).toHaveAttribute("title", "Sep 12, 2026");
    // Minimal drops the year inside the current one, judged against `today` rather than the clock.
    await expect(pill).toHaveTextContent(globals.theme === "minimal" ? /^Sep 12$/ : /^Sep 12, 2026$/);
  },
};
export const OtherYear: Story = {
  args: { date: "2025-12-30", today: "2026-10-07" },
  async play({ canvasElement }) {
    await expect(canvasElement.querySelector(".td-due")).toHaveTextContent(/^Dec 30, 2025$/);
  },
};
