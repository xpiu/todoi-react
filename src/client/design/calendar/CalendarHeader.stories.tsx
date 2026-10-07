import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { CalendarHeader } from "./CalendarHeader";

const meta = {
  title: "Calendar/CalendarHeader",
  component: CalendarHeader,
  // The header sits on the chrome canvas of the calendar view.
  decorators: [(Story) => <div style={{ padding: 12, background: "var(--chrome-canvas)" }}><Story /></div>],
  args: { title: "October 2026", period: "month", onPeriodChange: fn(), onPrev: fn(), onNext: fn(), onToday: fn() },
  parameters: { docs: { description: { component: "The calendar toolbar: period title, Today, previous / next, and the period Select. CalendarView owns the cursor and period and passes the title; each control renders only when its callback is given." } } },
} satisfies Meta<typeof CalendarHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { name: "October 2026" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Previous month" }));
    await expect(args.onPrev).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Next month" }));
    await expect(args.onNext).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Today" }));
    await expect(args.onToday).toHaveBeenCalledOnce();
  },
};
export const ChangePeriod: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const select = canvas.getByRole("combobox", { name: "Calendar period" });
    await userEvent.click(select);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: "Week" }));
    await expect(args.onPeriodChange).toHaveBeenCalledWith("week");
    await waitFor(() => expect(page.queryByRole("option", { name: "Week" })).not.toBeInTheDocument());
  },
};
export const Week: Story = { args: { title: "Oct 5 – 11, 2026", period: "week" } };
export const Day: Story = { args: { title: "Wednesday, October 7, 2026", period: "day" } };
export const TitleOnly: Story = { args: { onPeriodChange: undefined, onPrev: undefined, onNext: undefined, onToday: undefined } };
export const WithExtra: Story = { args: { extra: <Button variant="chrome" icon="filter">Filter</Button> } };
