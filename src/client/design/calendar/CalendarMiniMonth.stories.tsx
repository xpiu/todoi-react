import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { CalendarMiniMonth } from "./CalendarMiniMonth";

const meta = {
  title: "Calendar/CalendarMiniMonth",
  component: CalendarMiniMonth,
  decorators: [(Story) => <div style={{ width: 240 }}><Story /></div>],
  // Fixed dates (October 2026, today the 7th) so the story does not change day to day.
  args: { year: 2026, month: 9, today: "2026-10-07", weekStartsOn: 1, dates: new Set(["2026-10-02", "2026-10-07", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-21"]), onOpen: fn() },
  parameters: { docs: { description: { component: "One month tile of the calendar's year view. The caller passes the ISO days that carry items (dotted) and today (blue); the whole tile is one button that opens that month through onOpen." } } },
} satisfies Meta<typeof CalendarMiniMonth>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithItems: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await expect(canvasElement.querySelectorAll(".td-calmini-dot")).toHaveLength(6);
    await expect(canvasElement.querySelector(".is-today")).toHaveTextContent("7");
    await userEvent.click(canvas.getByRole("button", { name: "October 2026" }));
    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
};
export const Empty: Story = { args: { month: 1, dates: new Set() } };
export const SundayStart: Story = {
  args: { weekStartsOn: 0 },
  async play({ canvasElement }) {
    await expect(canvasElement.querySelector(".td-calmini-wd")).toHaveTextContent("S");
  },
};
