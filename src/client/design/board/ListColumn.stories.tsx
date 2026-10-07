import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { ItemCard } from "./ItemCard";
import { ListColumn } from "./ListColumn";

const meta = {
  title: "Board/ListColumn",
  component: ListColumn,
  // Columns sit on the board's chrome canvas.
  decorators: [(Story) => <div style={{ display: "flex", alignItems: "flex-start", padding: 12, background: "var(--chrome-canvas)" }}><Story /></div>],
  args: { name: "Doing", count: 3, listId: "doing", onAddItem: fn(), onRename: fn(), onIconChange: fn(), onStatusRoleChange: fn(), onManageLinks: fn(), onSelectAll: fn(), onHide: fn() },
  render: (args) => (
    <ListColumn {...args}>
      <ItemCard dragId="i1" itemId="HE-112" title="Confirm the hangar slot for October" labels={[{ color: "blue", text: "Ops" }]} due="Oct 9, 2026" assignees={["Flo Zuallaert"]} />
      <ItemCard dragId="i2" itemId="HE-115" title="Prepare the helicopter quote" labels={[{ color: "orange", text: "Sales" }]} due="Oct 2, 2026" dueState="overdue" priority="High" badges={{ checklist: { done: 2, total: 5 } }} />
      <ItemCard dragId="i3" itemId="HE-118" title="Send the pilot roster" badges={{ description: true, attachments: 2 }} assignees={["Sam Verhoeven", "Flo Zuallaert"]} />
    </ListColumn>
  ),
  parameters: { docs: { description: { component: "One board list: header with icon picker, name, count and ⋯ list actions, the card stack (a named list for ItemCards), and the \"Add an item\" quick-add composer. Compose it inside BoardView. Rename, icon, status role and new items are reported through callbacks; the caller persists them and re-renders." } } },
} satisfies Meta<typeof ListColumn>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { name: "Backlog", count: 0, listId: "backlog" }, render: (args) => <ListColumn {...args} /> };
export const ExplicitIconAndRole: Story = { args: { name: "Waiting on client", icon: "hourglass", statusRole: "TODO" } };
export const DropTarget: Story = { args: { dropTarget: true } };
export const LongName: Story = { args: { name: "Things to double-check with the maintenance team before the season starts", count: "12+" } };

export const AddItem: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Add an item" }));
    const field = canvas.getByRole("textbox", { name: "New item in Doing" });
    await expect(field).toHaveFocus();
    await userEvent.type(field, "Book the fuel truck{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Book the fuel truck", expect.objectContaining({ title: "Book the fuel truck" }));
    // The composer stays open for the next item; Escape on an empty field closes it.
    await expect(field).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "New item in Doing" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add an item" })).toBeVisible();
  },
};
export const Rename: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    // The ⋯ button and its menu both say which list they act on.
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu", { name: "Actions for Doing" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    const field = await canvas.findByRole("textbox", { name: "List name" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.clear(field);
    await userEvent.type(field, "In progress{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("In progress");
    await expect(canvas.queryByRole("textbox", { name: "List name" })).not.toBeInTheDocument();
  },
};
export const RenameCancel: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    const field = await canvas.findByRole("textbox", { name: "List name" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.type(field, "Scrapped");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "List name" })).not.toBeInTheDocument();
    await expect(args.onRename).not.toHaveBeenCalled();
  },
};
export const ChangeIcon: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Change icon for Doing" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Icon for Doing" });
    await userEvent.click(within(dialog).getByRole("button", { name: "On hold" }));
    await expect(args.onIconChange).toHaveBeenCalledWith("circle-pause");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
