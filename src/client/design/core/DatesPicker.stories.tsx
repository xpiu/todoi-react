import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { DatesPicker, type DatesPickerProps, type DatesValue } from "./DatesPicker";

const TODAY = "2026-08-25";

function ControlledDatesPicker(args: DatesPickerProps) {
  const [v, setV] = useState<DatesValue>({ start: args.start ?? null, due: args.due ?? null, time: args.time ?? null });
  return <DatesPicker {...args} {...v} onChange={(next) => { setV(next); args.onChange?.(next); }} />;
}

const meta = {
  title: "Core/DatesPicker",
  component: DatesPicker,
  render: (args) => <ControlledDatesPicker key={[args.start, args.due, args.time].join()} {...args} />,
  args: { start: null, due: null, time: null, today: TODAY, weekStartsOn: 1, onChange: fn() },
  parameters: { docs: { description: { component: "The item overlay's Dates field: start + due (+ a time on the due) in one dialog Popover with typed fields, quick picks and one DateCalendar writing into the active field. The caller owns start/due/time and receives the complete next value from onChange on every edit; a start after the due drags the due along and clearing the due drops the time. Use DatePicker for single-date rows." } } },
} satisfies Meta<typeof DatesPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SetDueAndTime: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Dates" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Dates" });
    const due = within(panel).getByRole("textbox", { name: "Due date" });
    await waitFor(() => expect(due).toHaveFocus());
    await userEvent.type(due, "12 sep{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({ start: null, due: "2026-09-12", time: null });
    await userEvent.type(within(panel).getByRole("textbox", { name: "Due time" }), "2pm{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({ start: null, due: "2026-09-12", time: "14:00" });
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveTextContent("Sep 12");
  },
};
export const AddStartDate: Story = {
  args: { due: "2026-09-12" },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Dates" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Dates" });
    await userEvent.click(within(panel).getByRole("button", { name: "Add start date" }));
    await userEvent.type(within(panel).getByRole("textbox", { name: "Start date" }), "10 sep{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({ start: "2026-09-10", due: "2026-09-12", time: null });
    // A start after the due drags the due along.
    await userEvent.click(within(panel).getByRole("textbox", { name: "Start date" }));
    await userEvent.type(within(panel).getByRole("textbox", { name: "Start date" }), "20 sep{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({ start: "2026-09-20", due: "2026-09-20", time: null });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const InvalidTyping: Story = {
  args: { due: "2026-09-12", time: "14:00" },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Dates" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Dates" });
    const due = within(panel).getByRole("textbox", { name: "Due date" });
    await userEvent.type(due, "someday");
    await expect(due).toHaveAttribute("aria-invalid", "true");
    await expect(panel).toHaveTextContent("Not a date");
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.click(within(panel).getByRole("button", { name: "Clear" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ start: null, due: null, time: null });
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const Range: Story = { args: { start: "2026-09-10", due: "2026-09-12", time: "14:00" } };
export const Overdue: Story = { args: { due: "2026-08-18", state: "overdue" } };
export const Complete: Story = { args: { due: "2026-08-18", state: "complete" } };
export const OpenRange: Story = {
  args: { start: "2026-09-10", due: "2026-09-12", defaultOpen: true },
  async play({ canvasElement }) {
    const grid = await within(canvasElement.ownerDocument.body).findByRole("grid", { name: "September 2026" });
    await expect(within(grid).getAllByRole("gridcell")).toHaveLength(42);
    // While the due is active, days before the start are disabled.
    await expect(within(grid).getByRole("button", { name: "Wed, Sep 9, 2026" })).toHaveAttribute("aria-disabled", "true");
    await expect(within(grid).getByRole("button", { name: "Sat, Sep 12, 2026" })).toHaveAttribute("aria-pressed", "true");
  },
};
export const Disabled: Story = { args: { due: "2026-09-12", disabled: true } };
