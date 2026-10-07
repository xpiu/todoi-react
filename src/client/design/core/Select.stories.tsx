import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Select, type SelectProps, type SelectValue } from "./Select";

// Story state models the caller; the component keeps its actual Base UI behavior.
function ControlledSelect(args: SelectProps) {
  const [value, setValue] = useState<SelectValue>(args.value ?? null);
  return <Select {...args} value={value} onChange={(next, option) => { setValue(next); args.onChange?.(next, option); }} />;
}

const meta = {
  title: "Core/Select",
  component: Select,
  render: (args) => <ControlledSelect key={String(args.value)} {...args} />,
  args: {
    "aria-label": "Status",
    value: "todo",
    onChange: fn(),
    options: [{ value: "todo", label: "To do" }, { value: "doing", label: "Doing" }, { value: "done", label: "Done" }],
  },
  parameters: { docs: { description: { component: "A controlled value picker backed by Base UI Combobox. The caller updates value from onChange. Options filter automatically above eight entries; popups portal into a containing dialog when present." } } },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ChooseStatus: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("combobox", { name: "Status" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: "Doing" }));
    await expect(args.onChange).toHaveBeenCalledWith("doing", expect.objectContaining({ value: "doing" }));
    await expect(trigger).toHaveTextContent("Doing");
    await waitFor(() => expect(page.queryByRole("option", { name: "Doing" })).not.toBeInTheDocument());
  },
};
export const Searchable: Story = {
  args: { "aria-label": "Time zone", value: null, options: Array.from({ length: 12 }, (_, i) => ({ value: `zone-${i}`, label: `Europe/City ${i + 1}` })) },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("combobox", { name: "Time zone" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByRole("combobox", { name: "Search…" }), "City 12");
    await expect(await page.findByRole("option", { name: "Europe/City 12" })).toBeVisible();
    await expect(page.queryByRole("option", { name: "Europe/City 2" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("option", { name: "Europe/City 12" })).not.toBeInTheDocument());
  },
};
export const Empty: Story = { args: { value: null, options: [], placeholder: "No lists yet" } };
export const Disabled: Story = { args: { disabled: true } };
export const OpenList: Story = {
  // Ends with the popup open so the accessibility scan covers the portalled listbox.
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }));
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole("listbox", { name: "Status" });
    await waitFor(() => expect(list).toBeVisible());
  },
};
