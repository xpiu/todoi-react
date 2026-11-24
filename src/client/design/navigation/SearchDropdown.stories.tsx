import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

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
  args: { query: "helicopter", id: "search-results", onActiveChange: fn() },
  async play({ args, canvas, globals, userEvent }) {
    await expect(canvas.getByRole("listbox", { name: "Search results" })).toHaveAttribute("id", "search-results");
    // Minimal shows no project glyphs: project and group rows lead with the name.
    const glyph = canvas.getByRole("option", { name: /Helicopter sales/ }).querySelector(".td-search-dropdown-icon");
    if (globals.theme === "minimal") await expect(glyph).toBeNull();
    else await expect(glyph).not.toBeNull();
    await expect(canvas.getByRole("option", { name: /Helicopter sales/ })).toHaveAttribute("aria-selected", "true");
    await expect(args.onActiveChange).toHaveBeenLastCalledWith(canvas.getByRole("option", { name: /Helicopter sales/ }).id);
    await userEvent.keyboard("{ArrowDown}");
    const group = canvas.getByRole("option", { name: /^Helicopters Europe/ });
    await expect(group).toHaveAttribute("aria-selected", "true");
    await expect(args.onActiveChange).toHaveBeenLastCalledWith(group.id);
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
  async play({ canvas }) {
    // The status line and the key hints sit beside the listbox, which holds only grouped options.
    const results = canvas.getByRole("listbox", { name: "Search results" });
    await expect(canvas.getByRole("status")).toHaveTextContent("Searching items…");
    await expect(results).not.toContainElement(canvas.getByRole("status"));
    await expect(results).not.toHaveTextContent("navigate");
    await expect(within(results).getByRole("group", { name: "Projects" })).toContainElement(canvas.getByRole("option", { name: /Helicopter sales/ }));
  },
};
export const Offline: Story = {
  args: { query: "invoice", status: "offline" },
  async play({ canvas }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("You’re offline. Item search needs a connection.");
    await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument();
  },
};
/** The way to the Search page: a row under the listbox (never an option), shift+↵ from anywhere in the list. */
export const SeeAll: Story = {
  args: { query: "helicopter", onSeeAll: fn() },
  async play({ args, canvas, userEvent }) {
    const all = canvas.getByRole("button", { name: /See all results, with descriptions and comments/ });
    await expect(canvas.getByRole("listbox", { name: "Search results" })).not.toContainElement(all);
    await userEvent.keyboard("{ArrowDown}{Shift>}{Enter}{/Shift}");
    await expect(args.onSeeAll).toHaveBeenCalledWith("helicopter");
    await expect(args.onSelect).not.toHaveBeenCalled();
    // ↵ alone still opens the highlighted result.
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelect).toHaveBeenCalledWith("group", "g1", expect.objectContaining({ name: "Helicopters Europe" }));
    await userEvent.click(all);
    await expect(args.onSeeAll).toHaveBeenCalledTimes(2);
  },
};
/** Nothing matches by name: ↵ takes "See all results", which also searches descriptions and comments. */
export const SeeAllWhenNothingMatches: Story = {
  args: { query: "  zeppelin ", status: "ready", onSeeAll: fn() },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("No projects or items match “zeppelin”");
    await userEvent.keyboard("{Enter}");
    await expect(args.onSeeAll).toHaveBeenCalledWith("zeppelin");
  },
};
/** No query, no row: there is nothing to see all of. */
export const SeeAllNeedsQuery: Story = {
  args: { onSeeAll: fn() },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button", { name: /See all results/ })).not.toBeInTheDocument();
  },
};
export const NoResults: Story = {
  args: { query: "zeppelin", status: "ready", onActiveChange: fn() },
  async play({ args, canvas }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("No projects or items match “zeppelin”");
    await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument();
    await expect(args.onActiveChange).toHaveBeenLastCalledWith(undefined);
  },
};
