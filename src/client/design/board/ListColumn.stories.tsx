import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { useAppearanceStore } from "../core/appearance";
import { ColumnTints } from "../core/columnTints";
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
      <ItemCard dragId="i1" itemId="HE-112" title="Confirm the hangar slot for October" labels={[{ color: "blue", text: "Ops" }]} due="Oct 9, 2026" assignees={["todoi"]} />
      <ItemCard dragId="i2" itemId="HE-115" title="Prepare the helicopter quote" labels={[{ color: "orange", text: "Sales" }]} due="Oct 2, 2026" dueState="overdue" priority="High" badges={{ checklist: { done: 2, total: 5 } }} />
      <ItemCard dragId="i3" itemId="HE-118" title="Send the pilot roster" badges={{ description: true, attachments: 2 }} assignees={["Sam Verhoeven", "todoi"]} />
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
    await expect(args.onAddItem).toHaveBeenCalledWith("Book the fuel truck", expect.objectContaining({ title: "Book the fuel truck" }), "bottom");
    // The composer stays open for the next item; Escape on an empty field closes it.
    await expect(field).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "New item in Doing" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add an item" })).toBeVisible();
  },
};
export const AddItemFromMenu: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    // ⋯ › Add an item opens the composer above the first card; the item lands first.
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Add an item" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    const field = await canvas.findByRole("textbox", { name: "New first item in Doing" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.type(field, "Check the tyres{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Check the tyres", expect.objectContaining({ title: "Check the tyres" }), "top");
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
/** Colorize Board columns: lists with no Status role take pool tints in order (ColumnTints.assign); a role wins over a tint. */
export const ColumnTintPool: Story = {
  beforeEach() {
    // Colorize is remembered per theme; turn it on in both so every theme × mode shows the pool.
    for (const theme of ["rounded", "minimal"] as const) useAppearanceStore.getState().set({ theme, colorizeColumns: true });
  },
  render: (args) => {
    const lists = [{ id: "clients", name: "Clients" }, { id: "doing", name: "Doing" }, { id: "vendors", name: "Vendors" }, { id: "new-list", name: "List 4" }];
    const tints = ColumnTints.assign(lists);
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {lists.map((l) => (
          <ListColumn key={l.id} {...args} listId={l.id} name={l.name} count={1} tint={tints[l.id]}>
            <ItemCard dragId={`${l.id}-1`} itemId="HE-120" title={`A card in ${l.name}`} labels={[{ color: "blue", text: "Ops" }]} />
          </ListColumn>
        ))}
      </div>
    );
  },
  async play({ canvasElement }) {
    const col = (id: string) => canvasElement.querySelector(`.td-list-column[data-list-id="${id}"]`);
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-colorize-columns", "true");
    await expect(col("clients")).toHaveAttribute("data-column-tint", "1");
    await expect(col("doing")).toHaveAttribute("data-status-role", "DOING");
    await expect(col("doing")).not.toHaveAttribute("data-column-tint");
    await expect(col("vendors")).toHaveAttribute("data-column-tint", "2");
    // The app's placeholder name for a new list is not the New status: it takes the next tint
    await expect(col("new-list")).not.toHaveAttribute("data-status-role");
    await expect(col("new-list")).toHaveAttribute("data-column-tint", "3");
  },
};
export const RenameByClickingTheName: Story = {
  async play({ args, canvas, userEvent }) {
    // The name itself starts the same inline rename as ⋯ › Rename; after Enter focus returns to the name.
    await userEvent.click(canvas.getByRole("button", { name: "Doing, rename list" }));
    const field = await canvas.findByRole("textbox", { name: "List name" });
    await waitFor(() => expect(field).toHaveFocus());
    await expect(field).toHaveValue("Doing");
    await userEvent.clear(field);
    await userEvent.type(field, "In progress{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("In progress");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Doing, rename list" })).toHaveFocus());
  },
};
export const RenameFromKeyboard: Story = {
  async play({ args, canvas, userEvent }) {
    const name = canvas.getByRole("button", { name: "Doing, rename list" });
    name.focus();
    await userEvent.keyboard("{Enter}");
    const field = await canvas.findByRole("textbox", { name: "List name" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "List name" })).not.toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Doing, rename list" })).toHaveFocus());
    // Space opens it too
    await userEvent.keyboard(" ");
    await expect(await canvas.findByRole("textbox", { name: "List name" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect(args.onRename).not.toHaveBeenCalled();
  },
};
/** Without onRename (a read-only board) the name is plain text, not a button. */
export const ReadOnlyName: Story = {
  args: { onRename: undefined },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button", { name: "Doing, rename list" })).toBeNull();
    await expect(canvas.getByText("Doing", { selector: ".td-list-column-name" }).tagName).toBe("SPAN");
  },
};
export const ChangeIcon: Story = {
  async play({ args, canvas, canvasElement, globals, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    if (globals.theme === "minimal") {
      // Minimal list heads are words only: the icon is changed from the ⋯ menu's Icon row
      await expect(canvas.queryByRole("button", { name: "Change icon for Doing" })).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
      await userEvent.click(await page.findByRole("menuitem", { name: /Icon/ }));
      const picker = await page.findByRole("group", { name: "List icon" });
      await userEvent.click(within(picker).getByRole("button", { name: "On hold" }));
      await expect(args.onIconChange).toHaveBeenCalledWith("circle-pause");
      return;
    }
    await userEvent.click(canvas.getByRole("button", { name: "Change icon for Doing" }));
    const dialog = await page.findByRole("dialog", { name: "Icon for Doing" });
    await userEvent.click(within(dialog).getByRole("button", { name: "On hold" }));
    await expect(args.onIconChange).toHaveBeenCalledWith("circle-pause");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
