import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Checklist, type ChecklistItem, type ChecklistProps } from "./Checklist";

const SUBITEMS: ChecklistItem[] = [
  { id: "s1", itemId: "HE-130", text: "Collect the optional equipment list", done: true },
  { id: "s2", itemId: "HE-131", text: "Book the maintenance slot", done: false },
  { id: "s3", itemId: "HE-132", text: "Agree the payment terms with finance", done: false },
];
const TARGETS = [
  { id: "i2", itemId: "HE-116", title: "Plan the delivery flight", listName: "To do", status: "TODO" },
  { id: "i3", itemId: "HE-120", title: "Confirm the export licence", listName: "Doing", status: "DOING" },
];

// Story state models the overlay: toggles and additions write back into the items.
function ControlledChecklist(args: ChecklistProps) {
  const [items, setItems] = useState(args.items);
  return <Checklist
    {...args}
    items={items}
    onToggle={(id, done) => { setItems((xs) => xs.map((x) => (x.id === id ? { ...x, done } : x))); args.onToggle?.(id, done); }}
    onAddItem={args.onAddItem && ((text) => { setItems((xs) => [...xs, { id: `new-${xs.length}`, text, done: false }]); args.onAddItem?.(text); })}
  />;
}

const meta = {
  title: "Overlay/Checklist",
  component: Checklist,
  render: (args) => <ControlledChecklist {...args} />,
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
  args: {
    items: SUBITEMS,
    moveTargets: TARGETS,
    onToggle: fn(),
    onReorder: fn(),
    onAddItem: fn(),
    onOpenItem: fn(),
    onConvertItem: fn(),
    onMoveItem: fn(),
    onDeleteItem: fn(),
    onDelete: fn(),
  },
  parameters: { docs: { description: { component: "The item's subitems: count and progress, checkbox rows with a ⋯ menu (Open · Convert to item · Move to another item… · Delete), drag reorder (native and long-press) and a row-styled add control. The overlay owns the items; the checklist keeps only the hide-checked, drag and move-dialog state. Each row action appears only when its callback is given." } } },
} satisfies Meta<typeof Checklist>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Subitems: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Book the maintenance slot" }));
    await expect(args.onToggle).toHaveBeenCalledWith("s2", true);
    await expect(canvas.getByRole("progressbar", { name: "2 of 3 subitems done" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Agree the payment terms with finance" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Delete" }));
    await expect(args.onDeleteItem).toHaveBeenCalledWith("s3");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const HideChecked: Story = {
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Hide checked items" }));
    await expect(canvas.queryByRole("checkbox", { name: "Collect the optional equipment list" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show checked items" }));
    await expect(canvas.getByRole("checkbox", { name: "Collect the optional equipment list" })).toBeChecked();
  },
};
export const AddSubitems: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Add a subitem" }));
    const input = canvas.getByRole("textbox", { name: "New subitem" });
    await expect(input).toHaveFocus();
    await userEvent.type(input, "Send the signed quote{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Send the signed quote");
    await expect(input).toHaveValue("");
    await expect(input).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByRole("button", { name: "Add a subitem" })).toBeVisible();
  },
};
export const MoveToAnotherItem: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Book the maintenance slot" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: /Move to another item/ }));
    const dialog = await page.findByRole("dialog", { name: "Move to another item" });
    await userEvent.click(within(dialog).getByRole("option", { name: /HE-120/ }));
    await expect(args.onMoveItem).toHaveBeenCalledWith("s2", TARGETS[1]);
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const AllDone: Story = { args: { items: SUBITEMS.map((s) => ({ ...s, done: true })) } };
export const ReadOnlyRows: Story = {
  args: { onReorder: undefined, onOpenItem: undefined, onConvertItem: undefined, onMoveItem: undefined, onDeleteItem: undefined, onDelete: undefined, onAddItem: undefined },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();
  },
};
export const LongText: Story = { args: { items: [{ id: "s9", text: "Agree the payment terms with finance, including the deposit, the delivery instalment and the currency hedge for the Swiss franc", done: false }] } };
