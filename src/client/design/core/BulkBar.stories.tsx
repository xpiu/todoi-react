import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { BulkBar, type BulkAction } from "./BulkBar";

// The shape useProjectActions.bulkActions builds for the project screen.
const ACTIONS: BulkAction[] = [
  {
    id: "move",
    label: "Move to",
    icon: "arrow-right",
    options: [
      { value: "todo", label: "To-do", icon: "circle-todo" },
      { value: "doing", label: "Doing", icon: "circle-dot", iconColor: "var(--label-blue)" },
      { value: "done", label: "Done", icon: "circle-check", iconColor: "var(--success-icon)" },
      { value: null, label: "", divider: true },
      { value: "__move", label: "Move to another project…", icon: "folder-input" },
    ],
  },
  { id: "label", label: "Label", icon: "tag", options: [{ value: "l1", label: "Sales", swatch: "var(--label-blue)", checked: true }, { value: "l2", label: "Urgent", swatch: "var(--label-red)", checked: false }] },
  { id: "done", label: "Done", icon: "circle-check" },
  { id: "delete", label: "Delete", icon: "trash-2", danger: true },
];

const meta = {
  title: "Core/BulkBar",
  component: BulkBar,
  args: { count: 3, actions: ACTIONS, onAction: fn(), onClear: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The fixed bottom-centre toolbar shown while items are selected. The caller owns the selection and passes `actions`; plain actions fire onAction(id) directly, actions with options open a Menu and fire onAction(id, value). Each call should apply to the whole selection and raise one undo toast. Renders nothing when count is 0." } },
  },
} satisfies Meta<typeof BulkBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Selection: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const bar = canvas.getByRole("toolbar", { name: "Actions for 3 selected items" });
    await userEvent.click(within(bar).getByRole("button", { name: "Done" }));
    await expect(args.onAction).toHaveBeenLastCalledWith("done");

    const move = within(bar).getByRole("button", { name: "Move to" });
    await userEvent.click(move);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Doing" }));
    await expect(args.onAction).toHaveBeenLastCalledWith("move", "doing");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(move).toHaveFocus());

    await userEvent.click(within(bar).getByRole("button", { name: "Clear selection" }));
    await expect(args.onClear).toHaveBeenCalledOnce();
  },
};
export const LabelMenu: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Label" }));
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu", { name: "Label" });
    await expect(within(menu).getByRole("menuitemradio", { name: "Sales" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "Urgent" }));
    await expect(args.onAction).toHaveBeenCalledWith("label", "l2");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const OneItem: Story = { args: { count: 1 } };
export const WithoutClear: Story = { args: { onClear: undefined } };
export const NoSelection: Story = {
  args: { count: 0 },
  async play({ canvas }) {
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();
  },
};
