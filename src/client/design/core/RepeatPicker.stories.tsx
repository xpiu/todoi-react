import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { RepeatPicker, type RepeatPickerProps } from "./RepeatPicker";

const TODAY = "2026-08-25";
// Friday: presets and wording count from the item's due date.
const DUE = "2026-08-28";

function ControlledRepeatPicker(args: RepeatPickerProps) {
  const [value, setValue] = useState(args.value ?? null);
  return <RepeatPicker {...args} value={value} onChange={(rule) => { setValue(rule); args.onChange?.(rule); }} />;
}

const meta = {
  title: "Core/RepeatPicker",
  component: RepeatPicker,
  render: (args) => <ControlledRepeatPicker key={JSON.stringify(args.value)} {...args} />,
  args: { value: null, anchor: DUE, today: TODAY, onChange: fn() },
  parameters: { docs: { description: { component: "The recurrence field: a Button showing the rule as a sentence over a dialog Popover of radio rows (Doesn't repeat, presets worded from the `anchor` due date, Custom… with interval, weekdays and an end). The caller owns the plain RepeatRule (or null) and receives it from onChange; the picker never changes dates." } } },
} satisfies Meta<typeof RepeatPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PickPreset: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Repeat" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Repeat" });
    await expect(within(panel).getByRole("radio", { name: "Doesn't repeat" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(panel).getByRole("radio", { name: "Weekly on Fri" }));
    await expect(args.onChange).toHaveBeenCalledWith({ freq: "weekly", interval: 1, byWeekday: [5] });
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveTextContent("Weekly on Fri");
  },
};
export const KeyboardRows: Story = {
  args: { value: { freq: "daily", interval: 1 } },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Repeat" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Repeat" });
    const off = within(panel).getByRole("radio", { name: "Doesn't repeat" });
    off.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(within(panel).getByRole("radio", { name: "Daily" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith(null);
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const CustomRule: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Repeat" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Repeat" });
    await userEvent.click(within(panel).getByRole("radio", { name: "Custom…" }));
    const interval = await within(panel).findByRole("spinbutton", { name: "Interval" });
    // The field may be empty while typing: Backspace then "2" gives 2, not 12.
    await userEvent.click(interval);
    await userEvent.keyboard("{End}{Backspace}");
    await expect(interval).toHaveValue(null);
    await userEvent.keyboard("2");
    await expect(interval).toHaveValue(2);
    await userEvent.click(within(panel).getByRole("button", { name: "Mon" }));
    await userEvent.click(within(panel).getByRole("radio", { name: /After/ }));
    // Leaving an emptied field restores the last valid count.
    const times = within(panel).getByRole("spinbutton", { name: "Number of times" });
    await userEvent.clear(times);
    await userEvent.tab();
    await expect(times).toHaveValue(5);
    await expect(panel).toHaveTextContent("Every 2 weeks on Mon, Fri · 5 times");
    await userEvent.click(within(panel).getByRole("button", { name: "Done" }));
    await expect(args.onChange).toHaveBeenCalledWith({ freq: "weekly", interval: 2, byWeekday: [5, 1], ends: { type: "after", count: 5 } });
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const UntilNeedsADate: Story = {
  args: { value: { freq: "monthly", interval: 1 } },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Repeat" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Repeat" });
    await userEvent.click(within(panel).getByRole("radio", { name: "Custom…" }));
    await userEvent.click(await within(panel).findByRole("radio", { name: /Until/ }));
    await expect(within(panel).getByRole("button", { name: "Done" })).toBeDisabled();
    await userEvent.type(within(panel).getByRole("textbox", { name: "Until date" }), "31 dec");
    await expect(within(panel).getByRole("button", { name: "Done" })).toBeEnabled();
    await userEvent.click(within(panel).getByRole("button", { name: "Back" }));
    await expect(await within(panel).findByRole("radio", { name: "Monthly on the 28th" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const Weekdays: Story = { args: { value: { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] } } };
export const CustomWithEnd: Story = { args: { value: { freq: "weekly", interval: 2, byWeekday: [1, 3], ends: { type: "after", count: 10 } } } };
export const NoDueDate: Story = { args: { anchor: undefined } };
export const Disabled: Story = { args: { value: { freq: "daily", interval: 1 }, disabled: true } };
