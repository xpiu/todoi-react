import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { DEFAULT_NAV, ITEM_DRAG_TYPE, Sidebar, type SidebarGroup } from "./Sidebar";

const GROUPS: SidebarGroup[] = [
  { id: "g1", name: "Helicopters Europe", projects: [{ id: "p1", name: "Helicopter sales", icon: "rocket", color: "var(--label-orange)", count: 24 }, { id: "p2", name: "Maintenance plans", icon: "wrench", color: "var(--label-teal)" }] },
  { id: "g2", name: "Internal", projects: [{ id: "p3", name: "Marketing site", icon: "globe", color: "var(--label-blue)" }, { id: "p4", name: "Hiring the next support engineer for the Benelux team", icon: "users", color: "var(--label-pink)" }] },
];

const meta = {
  title: "Navigation/Sidebar",
  component: Sidebar,
  // The rail sits beside the content under the TopNavbar and fills its height.
  decorators: [(Story) => <div style={{ display: "flex", height: "100vh", background: "var(--chrome-canvas)" }}><div style={{ flex: 1 }} /><Story /></div>],
  args: {
    groups: GROUPS,
    navItems: DEFAULT_NAV,
    activeId: "p1",
    side: "right",
    onSelect: fn(),
    onAdd: fn(),
    onNavAdd: fn(),
    onProjectRename: fn(),
    onProjectIconChange: fn(),
    onProjectAction: fn(),
    onClose: fn(),
  },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The chrome rail of project groups and the Projects / Project groups / Inbox rows. The host owns the selection, collapse and every mutation through callbacks; the rail keeps only group expansion, the inline rename draft and drag state. Pass `modal` below the desktop class to get the same rail as a Base UI Dialog sheet, and `onItemDrop` to make project rows drop targets for Inbox items." } },
  },
} satisfies Meta<typeof Sidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rail: Story = {
  async play({ args, canvas, globals, userEvent }) {
    await expect(canvas.getByRole("button", { name: "Helicopter sales 24" })).toHaveAttribute("aria-current", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Marketing site" }));
    await expect(args.onSelect).toHaveBeenCalledWith("p3");
    const header = canvas.getByRole("button", { name: "Internal" });
    await userEvent.click(header);
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("button", { name: "Marketing site" })).not.toBeInTheDocument();
    // Minimal hides the group header's + (its CSS sets display: none); Rounded shows it on hover and focus.
    if (globals.theme === "minimal") await expect(canvas.queryByRole("button", { name: "Add a project to Helicopters Europe" })).not.toBeInTheDocument();
    else {
      await userEvent.click(canvas.getByRole("button", { name: "Add a project to Helicopters Europe" }));
      await expect(args.onAdd).toHaveBeenCalledWith("g1");
    }
    await userEvent.click(canvas.getByRole("button", { name: "Add an item to the Inbox" }));
    await expect(args.onNavAdd).toHaveBeenCalledWith("inbox");
  },
};
export const ProjectMenu: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Settings for Maintenance plans" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Archive" }));
    await expect(args.onProjectAction).toHaveBeenCalledWith("p2", "archive");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const RenameProject: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Settings for Marketing site" }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Rename" }));
    const field = await canvas.findByRole("textbox", { name: "Rename Marketing site" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.clear(field);
    await userEvent.type(field, "Website{Enter}");
    await expect(args.onProjectRename).toHaveBeenCalledWith("p3", "Website");
  },
};
export const ChangeIcon: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Settings for Helicopter sales" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Change icon" }));
    await userEvent.click(await page.findByRole("button", { name: "Backlog" }));
    await expect(args.onProjectIconChange).toHaveBeenCalledWith("p1", "archive");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const DropInboxItem: Story = {
  args: { activeId: "inbox", onItemDrop: fn() },
  async play({ args, canvas }) {
    const row = canvas.getByRole("button", { name: "Maintenance plans" });
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(ITEM_DRAG_TYPE, "item-42");
    row.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }));
    row.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    await expect(await canvas.findByText("Drop on a project to file it")).toBeVisible();
    await waitFor(() => expect(row).toHaveAttribute("data-drop", "true"));
    row.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    await expect(args.onItemDrop).toHaveBeenCalledWith("p2", "item-42");
    await waitFor(() => expect(canvas.queryByText("Drop on a project to file it")).not.toBeInTheDocument());
  },
};
export const Unread: Story = {
  args: { activeId: "inbox", navItems: DEFAULT_NAV.map((n) => (n.id === "inbox" ? { ...n, unread: 3, count: 7 } : n)) },
};
export const DockedLeft: Story = {
  args: { side: "left" },
  decorators: [(Story) => <div style={{ display: "flex", height: "100vh", background: "var(--chrome-canvas)" }}><Story /><div style={{ flex: 1 }} /></div>],
};
export const Collapsed: Story = {
  args: { collapsed: true },
  async play({ canvasElement }) {
    // Collapsed, the rail stays mounted at width 0 and leaves the accessibility tree.
    await expect(canvasElement.querySelector("aside")).toHaveAttribute("aria-hidden", "true");
  },
};
/** Phone and tablet: the same rail as a modal sheet. */
export const ModalSheet: Story = {
  args: { modal: true },
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const sheet = await page.findByRole("dialog", { name: "Sidebar" });
    await waitFor(() => expect(sheet).toBeVisible());
    await userEvent.click(within(sheet).getByRole("button", { name: "Marketing site" }));
    await expect(args.onSelect).toHaveBeenCalledWith("p3");
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
