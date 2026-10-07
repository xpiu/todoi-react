import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import type { PickableItem } from "../core/ItemPicker";
import { RelationButton, RelationsSection } from "./Relations";

const ITEMS: PickableItem[] = [
  { id: "i2", itemId: "HE-116", title: "Book the maintenance slot", listName: "To do", status: "TODO" },
  { id: "i3", itemId: "HE-102", title: "Send the training schedule", listName: "Done", status: "DONE", done: true },
  { id: "i4", itemId: "HE-120", title: "Confirm the export licence", listName: "Doing", status: "DOING" },
  { id: "i5", itemId: "HE-121", title: "Draft the payment terms", listName: "Backlog", status: "BACKLOG" },
];
const [maintenance, training, licence] = ITEMS as [PickableItem, PickableItem, PickableItem, PickableItem];

const meta = {
  title: "Overlay/Relations",
  component: RelationsSection,
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
  args: {
    relations: [
      { type: "blocked_by", item: licence },
      { type: "blocks", item: maintenance },
      { type: "related", item: training },
    ],
    items: ITEMS,
    excludeIds: ["i1"],
    onAdd: fn(),
    onRemove: fn(),
    onOpen: fn(),
  },
  parameters: { docs: { description: { component: "The item's relations grouped as Blocked by · Blocks · Related to, Blocked by first and in red while any blocker is open. The overlay owns the relations: onAdd(type, item), onRemove(type, itemId) and onOpen(id) are its callbacks. RelationButton (the aside's Relations button) and RelationPicker (type segment + ItemPicker) are the add flow on their own." } } },
} satisfies Meta<typeof RelationsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Blocked: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByText("Blocked", { selector: ".td-rel-blocked" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /HE-120/ }));
    await expect(args.onOpen).toHaveBeenCalledWith("i4");
    const [removeFirst] = canvas.getAllByRole("button", { name: "Remove relation" });
    await userEvent.click(removeFirst!);
    await expect(args.onRemove).toHaveBeenCalledWith("blocked_by", "i4");
  },
};
export const BlockerDone: Story = {
  args: { relations: [{ type: "blocked_by", item: training }] },
  async play({ canvas }) {
    await expect(canvas.queryByText("Blocked", { selector: ".td-rel-blocked" })).not.toBeInTheDocument();
  },
};
export const AddRelation: Story = {
  args: { relations: [{ type: "related", item: training }] },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Add relation" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Add relation" });
    await expect(within(panel).queryByRole("option", { name: /HE-102/ })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("radio", { name: "Blocks" }));
    await userEvent.type(within(panel).getByRole("combobox"), "licence");
    await userEvent.keyboard("{Enter}");
    await expect(args.onAdd).toHaveBeenCalledWith("blocks", licence);
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Add relation" })).not.toBeInTheDocument());
  },
};
export const ReadOnly: Story = { args: { onAdd: undefined, onRemove: undefined } };
export const AsideButton: Story = {
  render: (args) => <div style={{ width: 200 }}><RelationButton block items={args.items} exclude={args.excludeIds} onAdd={args.onAdd!} /></div>,
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Relations" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Add relation" });
    await expect(within(panel).getByRole("radio", { name: "Blocked by" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(panel).getByRole("option", { name: /HE-116/ }));
    await expect(args.onAdd).toHaveBeenCalledWith("blocked_by", maintenance);
  },
};
