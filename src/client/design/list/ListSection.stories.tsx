import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { ListRow } from "./ListRow";
import { ListSection } from "./ListSection";

const rows = (
  <>
    <ListRow dragId="r1" itemId="HE-112" title="Confirm the hangar slot for October" labels={[{ color: "blue", text: "Ops" }]} due="Oct 9, 2026" assignees={["Flo Zuallaert"]} />
    <ListRow dragId="r2" itemId="HE-115" title="Prepare the helicopter quote" labels={[{ color: "orange", text: "Sales" }]} due="Oct 2, 2026" dueState="overdue" priority="High" />
    <ListRow dragId="r3" itemId="HE-118" title="Send the pilot roster" attachments={2} assignees={["Sam Verhoeven"]} />
  </>
);

const meta = {
  title: "List/ListSection",
  component: ListSection,
  decorators: [(Story) => <div style={{ maxWidth: 900, padding: 12, background: "var(--chrome-canvas)" }}><Story /></div>],
  args: { name: "Doing", count: 3, listId: "doing", children: rows, onAddItem: fn(), onRename: fn(), onIconChange: fn(), onStatusRoleChange: fn(), onManageLinks: fn(), onSelectAll: fn(), onHide: fn() },
  parameters: { docs: { description: { component: "One list in the List view: a collapsible header with icon picker, name, count, + (add at top) and ⋯ list actions over a block of ListRows ending in an \"Add an item\" quick-add row. Compose it inside ListView. Collapse and the open composer are local state; new items, renames and icon or role changes go to the caller through callbacks." } } },
} satisfies Meta<typeof ListSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { name: "Backlog", count: 0, children: undefined } };
export const Collapsed: Story = {
  args: { defaultCollapsed: true },
  async play({ canvas, userEvent }) {
    const chevron = canvas.getByRole("button", { name: "Expand Doing" });
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(chevron);
    await expect(canvas.getByRole("button", { name: "Collapse Doing" })).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByRole("list", { name: "Doing items" })).toBeVisible();
  },
};
export const InboxStyle: Story = {
  args: { name: "Inbox", showHeader: false, showAddRow: false, menu: false, collapsible: false },
};
export const WithHeaderActions: Story = {
  args: { name: "Inbox", menu: false, collapsible: false, actions: <Button variant="ghost">Mark all read</Button> },
};

export const AddAtBottom: Story = {
  async play({ args, canvas, userEvent }) {
    // The ghost row at the bottom has its own name, distinct from the header + toggle.
    await userEvent.click(canvas.getByRole("button", { name: "Add an item" }));
    const field = canvas.getByRole("textbox", { name: "New item in Doing" });
    await expect(field).toHaveFocus();
    await userEvent.type(field, "Book the fuel truck{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Book the fuel truck", expect.objectContaining({ title: "Book the fuel truck" }), "bottom");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "New item in Doing" })).not.toBeInTheDocument();
  },
};
export const AddAtTop: Story = {
  args: { defaultCollapsed: true },
  async play({ args, canvas, userEvent }) {
    // The header + expands a collapsed section and opens the composer above the rows. It is a toggle, so
    // its name stays the same and only aria-pressed changes.
    const plus = canvas.getByRole("button", { name: "Add an item at the top of Doing" });
    await expect(plus).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(plus);
    await expect(plus).toHaveAttribute("aria-pressed", "true");
    await expect(plus).toHaveAccessibleName("Add an item at the top of Doing");
    await expect(canvas.getByRole("button", { name: "Collapse Doing" })).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox", { name: "New item in Doing" }), "Call the insurer{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Call the insurer", expect.objectContaining({ title: "Call the insurer" }), "top");
    await userEvent.click(plus);
    await expect(plus).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.queryByRole("textbox", { name: "New item in Doing" })).not.toBeInTheDocument();
  },
};
export const Rename: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    const field = await canvas.findByRole("textbox", { name: "List name" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.clear(field);
    await userEvent.type(field, "In progress{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("In progress");
  },
};
