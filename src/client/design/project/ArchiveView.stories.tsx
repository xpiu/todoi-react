import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { ArchiveView, type ArchiveEntry } from "./ArchiveView";

const NOW = new Date("2026-10-07T15:00:00").getTime();
const ENTRIES: ArchiveEntry[] = [
  { id: "p9", kind: "project", removed: "archived", title: "Trade fair 2025", icon: "tent", color: "var(--label-green)", by: "Flo Zuallaert", at: "2026-09-30T10:00:00", groupName: "Helicopters Europe", itemCount: 14 },
  { id: "i1", kind: "item", removed: "archived", title: "Prepare the helicopter quote", key: "HE-115", by: "Sam Verhoeven", at: "2026-10-06T09:00:00", projectId: "p1", projectName: "Helicopter sales", listName: "Doing" },
  { id: "i2", kind: "item", removed: "archived", title: "Send the brochure", key: "HE-98", done: true, at: "2026-10-01T09:00:00", projectId: "p1", projectName: "Helicopter sales", listName: "Done" },
  { id: "i3", kind: "item", removed: "deleted", title: "Old pricing draft", key: "IN-4", by: "Flo Zuallaert", at: "2026-07-12T09:00:00", projectId: "p2", projectName: "Marketing site", listName: "To-do" },
  { id: "p8", kind: "project", removed: "deleted", title: "Test project", icon: "flag", color: "var(--label-red)", at: "2026-10-05T12:00:00", itemCount: 2 },
];
const PROJECTS = [{ id: "p1", name: "Helicopter sales", icon: "rocket" as const, color: "var(--label-orange)" }, { id: "p2", name: "Marketing site", icon: "globe" as const, color: "var(--label-blue)" }];

const meta = {
  title: "Project/ArchiveView",
  component: ArchiveView,
  decorators: [(Story) => <div style={{ background: "var(--chrome-canvas)", padding: 16, maxWidth: 820 }}><Story /></div>],
  args: { entries: ENTRIES, projects: PROJECTS, now: NOW, onRestore: fn(), onDelete: fn(), onDestroy: fn(), onOpen: fn(), onEmptyTrash: fn(), onTabChange: fn() },
  parameters: { docs: { description: { component: "Archive and Trash for an account or one project (`project`). The host owns the entries and performs Restore, Delete, Delete forever and Empty trash; the view keeps the tab (unless `tab` is controlled), search, project filter and the inline confirmations. Use `surface=\"card\"` inside a white card (ProjectPanel), the default chrome surface on a page." } } },
} satisfies Meta<typeof ArchiveView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Archive: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByText("Projects · 1")).toBeVisible();
    await userEvent.click(canvas.getAllByRole("button", { name: "Restore" })[1]!);
    await expect(args.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }));
  },
};
export const SearchAndFilter: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.type(canvas.getByRole("textbox", { name: "Search archive" }), "zeppelin");
    await expect(canvas.getByText("No matches for “zeppelin”")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(canvas.getByRole("textbox", { name: "Search archive" })).toHaveValue("");
    await userEvent.click(canvas.getByRole("combobox", { name: "Project" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: "Helicopter sales" }));
    await expect(within(canvas.getByRole("list", { name: "Archive" })).getAllByRole("listitem")).toHaveLength(2);
    await waitFor(() => expect(page.queryByRole("listbox")).not.toBeInTheDocument());
  },
};
export const DeleteFromArchive: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "More for Send the brochure" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Delete" }));
    await expect(args.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "i2" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const Trash: Story = {
  args: { tab: "trash" },
  async play({ args, canvas, canvasElement, userEvent }) {
    await expect(canvas.getByText("gone in 3 days")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "More for Old pricing draft" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Delete forever" }));
    await expect(canvas.getByText(/Delete “Old pricing draft” forever\?/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Delete forever" }));
    await expect(args.onDestroy).toHaveBeenCalledWith(expect.objectContaining({ id: "i3" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const EmptyTrash: Story = {
  args: { tab: "trash" },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Empty trash" }));
    await expect(canvas.getByText("Delete 2 entries forever?")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Empty trash" }));
    await expect(args.onEmptyTrash).toHaveBeenCalledWith([expect.objectContaining({ id: "i3" }), expect.objectContaining({ id: "p8" })]);
  },
};
export const SwitchTabs: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: /Trash/ }));
    await expect(args.onTabChange).toHaveBeenCalledWith("trash");
    await expect(canvas.getByRole("list", { name: "Trash" })).toBeVisible();
  },
};
export const ProjectScopeOnCard: Story = {
  args: { project: true, surface: "card", entries: ENTRIES.filter((e) => e.projectId === "p1") },
  decorators: [(Story) => <div style={{ background: "var(--surface-card)", padding: 16 }}><Story /></div>],
};
export const Busy: Story = { args: { busy: true } };
export const Empty: Story = { args: { entries: [] } };
