import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { DateCalendar, type DateCalendarProps } from "./DateCalendar";

const TODAY = "2026-08-25";

function ControlledCalendar(args: DateCalendarProps) {
  const [value, setValue] = useState(args.value);
  return <DateCalendar {...args} value={value} onChange={(iso, date) => { setValue(iso); args.onChange?.(iso, date); }} />;
}

const meta = {
  title: "Core/DateCalendar",
  component: DateCalendar,
  render: (args) => <ControlledCalendar key={String(args.value)} {...args} />,
  args: { value: "2026-08-28", today: TODAY, weekStartsOn: 1, onChange: fn() },
  parameters: { docs: { description: { component: "The month grid alone, for embedding in a picker panel (DatePicker, DatesPicker). The caller owns `value` and receives onChange(iso, date); the grid owns only the visible month. Arrow keys move the focused day, Home/End go to the week's edges, PageUp/PageDown change month. Pass `today` for deterministic previews and wire weekStartsOn to the “Week starts on” setting." } } },
} satisfies Meta<typeof DateCalendar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PickADay: Story = {
  async play({ args, canvas, userEvent }) {
    const grid = canvas.getByRole("grid", { name: "August 2026" });
    await expect(grid).toBeVisible();
    // The date-picker grid: a weekday header row, then a row of seven day cells per week.
    await expect(within(grid).getAllByRole("columnheader").map((h) => h.getAttribute("aria-label"))).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    await expect(within(grid).getAllByRole("row")).toHaveLength(7);
    await expect(within(grid).getAllByRole("gridcell")).toHaveLength(42);
    await expect(canvas.getByRole("button", { name: "Tue, Aug 25, 2026" })).toHaveAttribute("aria-current", "date");
    await expect(canvas.getByRole("button", { name: "Fri, Aug 28, 2026" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Mon, Aug 31, 2026" }));
    await expect(args.onChange).toHaveBeenCalledWith("2026-08-31", expect.any(Date));
    await expect(canvas.getByRole("button", { name: "Mon, Aug 31, 2026" })).toHaveAttribute("aria-pressed", "true");
  },
};
export const KeyboardNavigation: Story = {
  async play({ args, canvas, userEvent }) {
    canvas.getByRole("button", { name: "Fri, Aug 28, 2026" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Sat, Aug 29, 2026" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Sat, Sep 5, 2026" })).toHaveFocus());
    await userEvent.keyboard("{Home}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Mon, Aug 31, 2026" })).toHaveFocus());
    await userEvent.keyboard("{End}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Sun, Sep 6, 2026" })).toHaveFocus());
    await userEvent.keyboard("{PageUp}");
    await expect(canvas.getByRole("grid", { name: "August 2026" })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Thu, Aug 6, 2026" })).toHaveFocus());
    await userEvent.keyboard("{PageDown}");
    await expect(canvas.getByRole("grid", { name: "September 2026" })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Sun, Sep 6, 2026" })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("2026-09-06", expect.any(Date));
  },
};
// PageUp/PageDown keep the day of the month, clamped to the shorter month: Aug 31 → Sep 30, not Oct 1.
export const MonthEndPaging: Story = {
  args: { value: "2026-08-31" },
  async play({ canvas, userEvent }) {
    canvas.getByRole("button", { name: "Mon, Aug 31, 2026" }).focus();
    await userEvent.keyboard("{PageDown}");
    await expect(canvas.getByRole("grid", { name: "September 2026" })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Wed, Sep 30, 2026" })).toHaveFocus());
    await userEvent.keyboard("{PageUp}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Sun, Aug 30, 2026" })).toHaveFocus());
  },
};
export const MonthButtons: Story = {
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Next month" }));
    await expect(canvas.getByRole("grid", { name: "September 2026" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Previous month" }));
    await userEvent.click(canvas.getByRole("button", { name: "Previous month" }));
    await expect(canvas.getByRole("grid", { name: "July 2026" })).toBeVisible();
  },
};
export const NoSelection: Story = { args: { value: null } };
export const SundayFirst: Story = { args: { weekStartsOn: 0 } };
export const Range: Story = {
  render: (args) => <DateCalendar {...args} />,
  args: { value: "2026-09-04", range: { start: "2026-08-27", end: "2026-09-04" } },
};
export const MinMax: Story = {
  args: { value: null, min: "2026-08-20", max: "2026-09-10" },
  async play({ args, canvas, userEvent }) {
    // Days outside min/max are disabled for AT and ignore clicks and Enter.
    const before = canvas.getByRole("button", { name: "Tue, Aug 18, 2026" });
    await expect(before).toHaveAttribute("aria-disabled", "true");
    await expect(canvas.getByRole("button", { name: "Thu, Aug 20, 2026" })).not.toHaveAttribute("aria-disabled");
    await userEvent.click(before);
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).not.toHaveBeenCalled();
    // Arrow keys and paging stop at min and max instead of focusing a disabled day.
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Thu, Aug 20, 2026" })).toHaveFocus());
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Thu, Aug 20, 2026" })).toHaveFocus());
    await userEvent.keyboard("{PageDown}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Thu, Sep 10, 2026" })).toHaveFocus());
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Thu, Sep 10, 2026" })).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "Previous month" }));
    await userEvent.click(canvas.getByRole("button", { name: "Thu, Aug 20, 2026" }));
    await expect(args.onChange).toHaveBeenCalledWith("2026-08-20", expect.any(Date));
  },
};
// With today before min, the grid's one Tab stop moves to the first day allowed.
export const TodayBeforeMin: Story = {
  args: { value: null, min: "2026-08-27" },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Tue, Aug 25, 2026" })).toHaveAttribute("tabindex", "-1");
    await expect(canvas.getByRole("button", { name: "Thu, Aug 27, 2026" })).toHaveAttribute("tabindex", "0");
  },
};
