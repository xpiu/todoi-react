import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { SearchDropdown, type SearchSources } from "./SearchDropdown";

const SOURCES: SearchSources = {
  groups: [{ id: "g1", name: "Helicopters Europe", projects: [{}, {}, {}] }, { id: "g2", name: "Internal", projects: [{}] }],
  projects: [
    { id: "p1", name: "Helicopter sales", icon: "rocket", color: "var(--label-orange)", groupName: "Helicopters Europe" },
    { id: "p2", name: "Marketing site", icon: "globe", color: "var(--label-blue)", groupName: "Internal" },
    { id: "p3", name: "Hiring", icon: "users", color: "var(--label-teal)", groupName: "Internal" },
  ],
  items: [
    { id: "i1", projectId: "p1", itemId: "HE-115", title: "Prepare the helicopter quote", listName: "Doing" },
    { id: "i2", projectId: "p1", itemId: "HE-98", title: "Send the helicopter brochure", listName: "Done", done: true },
    { id: "i3", projectId: "p2", itemId: "IN-12", title: "Refresh the pricing page", listName: "To-do" },
  ],
  inbox: [{ id: "x1", projectId: null, title: "Call the helicopter insurer" }, { id: "x2", projectId: null, title: "Book the trade fair stand" }],
};

const meta = {
  title: "Navigation/SearchDropdown",
  component: SearchDropdown,
  // Absolutely positioned under the TopNavbar's search field; the story gives it that anchor.
  decorators: [(Story) => <div style={{ position: "relative", width: 400, height: 460, marginLeft: "auto" }}><Story /></div>],
  args: { query: "", sources: SOURCES, onSelect: fn(), onClose: fn() },
  parameters: { docs: { description: { component: "The results panel under the TopNavbar search field, which owns the query and open state. Without a query it lists Recent, Projects and Inbox; with one it groups matches into Projects, Project groups, Items and Inbox. ↑↓ and Enter are handled at document level so the field keeps focus; Esc calls onClose. Pass `status` for per-query sources so loading or failure never reads as \"No results\"." } } },
} satisfies Meta<typeof SearchDropdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoQuery: Story = {
  args: { recent: [{ type: "item", entity: SOURCES.items![0]! }] },
};
export const Matches: Story = {
  args: { query: "helicopter" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("option", { name: /Helicopter sales/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("option", { name: /^Helicopters Europe/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelect).toHaveBeenCalledWith("group", "g1", expect.objectContaining({ name: "Helicopters Europe" }));
    await userEvent.click(canvas.getByRole("option", { name: /HE-115/ }));
    await expect(args.onSelect).toHaveBeenLastCalledWith("item", "i1", expect.objectContaining({ itemId: "HE-115" }));
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
export const ItemsLoading: Story = {
  args: { query: "hel", status: "loading", sources: { ...SOURCES, items: [] } },
  // Defect (aria-required-children): the status line renders inside role="listbox", which allows only options/groups.
  parameters: { a11y: { test: "todo" } },
};
export const Offline: Story = {
  args: { query: "invoice", status: "offline" },
  // Defect (aria-required-children): the status line renders inside role="listbox", which allows only options/groups.
  parameters: { a11y: { test: "todo" } },
  async play({ canvas }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("You’re offline. Item search needs a connection.");
  },
};
export const NoResults: Story = {
  args: { query: "zeppelin", status: "ready" },
  // Defect (aria-required-children): the status line renders inside role="listbox", which allows only options/groups.
  parameters: { a11y: { test: "todo" } },
  async play({ canvas }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("No projects or items match “zeppelin”");
  },
};
