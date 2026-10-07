import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { DatePicker, type DatePickerProps } from "./DatePicker";

const TODAY = "2026-08-25";

function ControlledDatePicker(args: DatePickerProps) {
  const [value, setValue] = useState(args.value);
  return <DatePicker {...args} value={value} onChange={(iso, date) => { setValue(iso); args.onChange?.(iso, date); }} />;
}

const meta = {
  title: "Core/DatePicker",
  component: DatePicker,
  render: (args) => <ControlledDatePicker key={String(args.value)} {...args} />,
  args: { value: "2026-09-12", today: TODAY, weekStartsOn: 1, "aria-label": "Until", onChange: fn(), onOpenChange: fn() },
  parameters: { docs: { description: { component: "A single-date field: a Button trigger over a dialog Popover with a typed-date input (the quick-add grammar), quick picks, the DateCalendar grid and Clear. The caller owns the ISO `value` and receives onChange(iso | null, date | null) only when it changes. Use DatesPicker for an item's start + due + time; pass `today` for deterministic previews." } } },
} satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TypeADate: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Until" });
    await expect(trigger).toHaveTextContent("Sep 12, 2026");
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Until" });
    const input = within(panel).getByRole("textbox", { name: "Type a date" });
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, "fri");
    await expect(panel).toHaveTextContent("Fri, Aug 28");
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("2026-08-28", expect.any(Date));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveTextContent("Aug 28, 2026");
  },
};
export const QuickPick: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Until" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Until" });
    await userEvent.click(within(panel).getByRole("button", { name: "Tomorrow" }));
    await expect(args.onChange).toHaveBeenCalledWith("2026-08-26", expect.any(Date));
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const ClearAndEscape: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Until" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.click(within(await page.findByRole("dialog", { name: "Until" })).getByRole("button", { name: "Clear" }));
    await expect(args.onChange).toHaveBeenCalledWith(null, null);
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveTextContent("Dates");
  },
};
// The panel's month grid has role="grid" with no row/gridcell owners (aria-required-children).
export const Open: Story = {
  parameters: { a11y: { test: "todo" } },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Until" }));
    await within(canvasElement.ownerDocument.body).findByRole("grid", { name: "September 2026" });
  },
};
export const Empty: Story = { args: { value: null, placeholder: "No end date" } };
export const Overdue: Story = { args: { value: "2026-08-18", state: "overdue", "aria-label": "Due date" } };
export const Disabled: Story = {
  args: { disabled: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Until" })).toBeDisabled();
  },
};
