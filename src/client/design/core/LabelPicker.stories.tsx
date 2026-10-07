import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { LabelPicker, type LabelPickerProps, type PickableLabel } from "./LabelPicker";

const LABELS: PickableLabel[] = [
  { id: "l1", name: "Sales", color: "blue" },
  { id: "l2", name: "Urgent", color: "red" },
  { id: "l3", name: "Customer", color: "green" },
  { id: "l4", name: "Paperwork", color: "yellow" },
];

// Story state models the caller: it owns both the project's labels and the item's selection.
function ControlledLabelPicker(args: LabelPickerProps) {
  const [labels, setLabels] = useState(args.labels);
  const [value, setValue] = useState(args.value);
  return (
    <LabelPicker
      {...args}
      labels={labels}
      value={value}
      onChange={(ids) => { setValue(ids); args.onChange(ids); }}
      onCreateLabel={args.onCreateLabel && (async (draft) => {
        await args.onCreateLabel?.(draft);
        const made = { id: `new-${draft.name}`, ...draft };
        setLabels((ls) => [...ls, made]);
        return made;
      })}
      onEditLabel={args.onEditLabel && ((label, draft) => {
        args.onEditLabel?.(label, draft);
        setLabels((ls) => ls.map((l) => (l.id === label.id ? { ...l, ...draft } : l)));
      })}
      onDeleteLabel={args.onDeleteLabel && ((label) => {
        args.onDeleteLabel?.(label);
        setLabels((ls) => ls.filter((l) => l.id !== label.id));
      })}
    />
  );
}

const meta = {
  title: "Core/LabelPicker",
  component: LabelPicker,
  render: (args) => <ControlledLabelPicker key={args.value.join()} {...args} />,
  args: { labels: LABELS, value: ["l1"], onChange: fn(), onCreateLabel: fn(), onEditLabel: fn(), onDeleteLabel: fn() },
  parameters: { docs: { description: { component: "Multi-select label picker with in-place create, edit and delete, in a dialog Popover (detached tier inside the item overlay). The caller owns the project's labels and the selected ids: onChange gets the next id list, onCreateLabel resolves with the new label so it is selected, and onEditLabel/onDeleteLabel persist changes. Omit a handler to hide that affordance." } } },
} satisfies Meta<typeof LabelPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Toggle: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Labels" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Labels" });
    await waitFor(() => expect(within(panel).getByRole("textbox", { name: "Search labels" })).toHaveFocus());
    await expect(within(panel).getByRole("checkbox", { name: "Sales" })).toBeChecked();
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Urgent" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["l1", "l2"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveTextContent("SalesUrgent");
  },
};
export const SearchKeyboard: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Labels" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Labels" });
    const search = within(panel).getByRole("textbox", { name: "Search labels" });
    await userEvent.type(search, "pap{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith(["l1", "l4"]);
    await userEvent.clear(search);
    await userEvent.keyboard("{ArrowDown}");
    await expect(within(panel).getByRole("checkbox", { name: "Sales" })).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(args.onChange).toHaveBeenLastCalledWith(["l4"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const CreateLabel: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Labels" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Labels" });
    await userEvent.type(within(panel).getByRole("textbox", { name: "Search labels" }), "Spare parts");
    await userEvent.click(within(panel).getByRole("button", { name: "Create “Spare parts”" }));
    const name = await within(panel).findByRole("textbox", { name: "Label name" });
    await expect(name).toHaveValue("Spare parts");
    // The first palette colour no label uses.
    await expect(within(panel).getByRole("radio", { name: "orange" })).toBeChecked();
    await userEvent.click(within(panel).getByRole("radio", { name: "teal" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));
    await expect(args.onCreateLabel).toHaveBeenCalledWith({ name: "Spare parts", color: "teal" });
    await expect(args.onChange).toHaveBeenLastCalledWith(["l1", "new-Spare parts"]);
    await expect(await within(panel).findByRole("checkbox", { name: "Spare parts" })).toBeChecked();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const EditAndDelete: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Labels" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Labels" });
    await userEvent.click(within(panel).getByRole("button", { name: "Edit Urgent" }));
    const name = await within(panel).findByRole("textbox", { name: "Label name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Sales");
    await expect(panel).toHaveTextContent("A label with this name exists");
    await expect(within(panel).getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, "Rush{Enter}");
    await expect(args.onEditLabel).toHaveBeenCalledWith(LABELS[1], { name: "Rush", color: "red" });
    await userEvent.click(await within(panel).findByRole("button", { name: "Edit Sales" }));
    await userEvent.click(await within(panel).findByRole("button", { name: "Delete" }));
    await expect(panel).toHaveTextContent("Remove from all items?");
    await userEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    await expect(args.onDeleteLabel).toHaveBeenCalledWith(LABELS[0]);
    await expect(args.onChange).toHaveBeenLastCalledWith([]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const ReadOnlyLabels: Story = { args: { onCreateLabel: undefined, onEditLabel: undefined, onDeleteLabel: undefined } };
export const NoLabelsYet: Story = { args: { labels: [], value: [] } };
export const ManySelected: Story = {
  decorators: [(Story) => <div style={{ maxWidth: 240 }}><Story /></div>],
  args: { value: ["l1", "l2", "l3", "l4"], block: true },
};
export const Disabled: Story = { args: { disabled: true } };
