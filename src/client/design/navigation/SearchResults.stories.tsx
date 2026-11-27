import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { EMPTY_SEARCH_FILTERS, SearchResults, type SearchFilters, type SearchResult } from "./SearchResults";

const PROJECTS = [
  { id: "p1", name: "Helicopters Europe website", icon: "globe" as const, color: "var(--label-orange)" },
  { id: "p2", name: "Dealers & stock", icon: "package" as const, color: "var(--label-blue)" },
];
const MEMBERS = [
  { id: "u1", name: "Sam Verhoeven" },
  { id: "u2", name: "todoi" },
];
const RESULTS: SearchResult[] = [
  { id: "a", itemId: "MP-112", title: "Pricing page: do we show the price or only “request a quote”?", projectName: "Helicopters Europe website", listName: "Doing", match: { field: "title" } },
  { id: "b", itemId: "MP-121", title: "Write the copy for the used helicopters page", projectName: "Helicopters Europe website", listName: "New", match: { field: "description", text: "Short intro, then one block per model. Sam takes it if nobody else has started by Friday, and the dealers check the price list before it goes live." } },
  { id: "c", itemId: "DS-14", title: "Stock list for the spring fair", projectName: "Dealers & stock", listName: "Backlog", done: true, match: { field: "comment", text: "Both dealers want the price hidden on the new models.", author: "Sam Verhoeven" } },
  { id: "d", itemId: "MP-90", title: "Old price table", projectName: "Helicopters Europe website", listName: "Done", archived: true, match: { field: "title" } },
  { id: "e", title: "Ask the bank about price insurance", listName: "Inbox", match: { field: "title" } },
];

const meta = {
  title: "Navigation/SearchResults",
  component: SearchResults,
  args: { query: "price", results: RESULTS, total: RESULTS.length, status: "ready", projects: PROJECTS, members: MEMBERS, onQueryChange: fn(), onFiltersChange: fn(), onOpen: fn(), onShowMore: fn(), onRetry: fn() },
  // A page: it fills the content area under the top bar.
  decorators: [(Story) => <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}><Story /></div>],
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The Search page behind the top bar's quick dropdown (\"See all results\"): titles, descriptions and comments. Each result says where it matched (Title, Description, Comment · author) with a one-line snippet, the match in `<mark>`. Filters: Project, Status, Assignee (with Unassigned), Include archived. The first 20 show; \"Show n more\" adds the next page. Presentational: the host runs the search. Keys: ↓ from the field enters the list; ↑↓ or J/K; Home / End; ↵ opens; ↑ on the first result returns to the field; Esc in the field clears it." } },
  },
} satisfies Meta<typeof SearchResults>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Title, description and comment matches, a done and an archived item, an Inbox item. */
export const Results: Story = {
  async play({ canvas }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("5 results");
    const rows = within(canvas.getByRole("list", { name: "Search results" })).getAllByRole("button");
    await expect(rows).toHaveLength(5);
    // Where it matched, and the match marked in the title or in the snippet.
    await expect(rows[0]!.querySelector("mark")).toHaveTextContent("price");
    await expect(rows[1]).toHaveTextContent("Description");
    await expect(rows[1]!.querySelector(".td-search-snippet mark")).toHaveTextContent("price");
    await expect(rows[2]).toHaveTextContent("Comment · Sam Verhoeven");
    await expect(rows[3]).toHaveTextContent("Archived");
    await expect(rows[3]).toHaveAttribute("data-archived", "true");
    await expect(rows[4]).toHaveTextContent("Inbox");
  },
};

export const Keyboard: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "Search items" });
    await waitFor(() => expect(field).toHaveFocus());
    const rows = within(canvas.getByRole("list", { name: "Search results" })).getAllByRole("button");
    // One Tab stop: only the roving result is tabbable.
    await expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    await userEvent.keyboard("{ArrowDown}");
    await expect(rows[0]).toHaveFocus();
    await userEvent.keyboard("j");
    await expect(rows[1]).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(rows[4]).toHaveFocus();
    await userEvent.keyboard("k");
    await expect(rows[3]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect(rows[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onOpen).toHaveBeenCalledWith(RESULTS[1]);
    // The list remembers where it was: Tab back into it lands on the same result.
    await expect(rows[1]).toHaveAttribute("tabindex", "0");
    await userEvent.keyboard("{Home}{ArrowUp}");
    await expect(field).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(args.onQueryChange).toHaveBeenCalledWith("");
  },
};

/** The host's side: filters narrow together; "Clear filters" shows while any is on. */
function WithFilters(props: ComponentProps<typeof SearchResults>) {
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH_FILTERS);
  return (
    <SearchResults
      {...props}
      filters={filters}
      onFiltersChange={(f) => {
        props.onFiltersChange?.(f);
        setFilters(f);
      }}
    />
  );
}
export const Filters: Story = {
  render: (args) => <WithFilters {...args} />,
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await expect(canvas.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("combobox", { name: /^Assignee/ }));
    await userEvent.click(await page.findByRole("option", { name: "Unassigned" }));
    await expect(args.onFiltersChange).toHaveBeenLastCalledWith({ ...EMPTY_SEARCH_FILTERS, assignee: "__none" });
    await userEvent.click(canvas.getByRole("checkbox", { name: "Include archived" }));
    await expect(args.onFiltersChange).toHaveBeenLastCalledWith({ ...EMPTY_SEARCH_FILTERS, assignee: "__none", archived: true });
    await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }));
    await expect(args.onFiltersChange).toHaveBeenLastCalledWith(EMPTY_SEARCH_FILTERS);
  },
};

export const Empty: Story = {
  args: { query: "", results: [], status: "idle" },
  async play({ canvas }) {
    await expect(canvas.getByText("Search items")).toBeVisible();
    await expect(canvas.getByText("Finds words in titles, descriptions and comments, in every project you can open.")).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("");
  },
};

export const ShortQuery: Story = {
  args: { query: "p", results: [], status: "idle" },
  async play({ canvas }) {
    await expect(canvas.getByText("Type at least 2 characters.")).toBeVisible();
  },
};

/** Nothing for 150ms, then five placeholder rows. */
export const Loading: Story = {
  args: { results: [], status: "loading" },
  async play({ canvas, canvasElement }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("Searching…");
    await expect(canvasElement.querySelector(".td-search-skeleton")).toBeNull();
    await waitFor(() => expect(canvasElement.querySelectorAll(".td-search-skeleton")).toHaveLength(5));
  },
};

export const NoResults: Story = {
  args: { query: "zeppelin", results: [], total: 0 },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("No results");
    await expect(canvas.getByText("No results for “zeppelin”")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Include archived" }));
    await expect(args.onFiltersChange).toHaveBeenCalledWith({ ...EMPTY_SEARCH_FILTERS, archived: true });
  },
};

export const NoResultsFiltered: Story = {
  args: { query: "zeppelin", results: [], total: 0, filters: { ...EMPTY_SEARCH_FILTERS, project: "p1", status: "DOING" } },
  async play({ args, canvas }) {
    await expect(canvas.getByText("Filters are on. Clear them to search everything.")).toBeVisible();
    const clear = canvas.getAllByRole("button", { name: "Clear filters" });
    await expect(clear).toHaveLength(2);
    clear[1]!.click();
    await expect(args.onFiltersChange).toHaveBeenCalledWith(EMPTY_SEARCH_FILTERS);
  },
};

export const Failed: Story = {
  args: { results: [], status: "error", error: "The server didn't answer." },
  async play({ args, canvas, userEvent }) {
    const alert = canvas.getByRole("alert");
    await expect(alert).toHaveTextContent("Couldn't search");
    await expect(alert).toHaveTextContent("The server didn't answer.");
    // The query stays.
    await expect(canvas.getByRole("textbox", { name: "Search items" })).toHaveValue("price");
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

export const Offline: Story = {
  args: { offline: true },
  async play({ canvas }) {
    await expect(canvas.getByText("You're offline")).toBeVisible();
    await expect(canvas.getByText("Search needs a connection. Items you already have open still work.")).toBeVisible();
  },
};

const many = (from: number, n: number): SearchResult[] => Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, itemId: `MP-${200 + from + i}`, title: `Price check ${from + i + 1}`, projectName: "Helicopters Europe website", listName: "To-do", match: { field: "title" } }));
/** The host's side of paging: 38 matches, 20 at a time. */
function Paged(props: ComponentProps<typeof SearchResults>) {
  const [results, setResults] = useState(() => many(0, 20));
  return (
    <SearchResults
      {...props}
      results={results}
      total={38}
      onShowMore={() => {
        props.onShowMore?.();
        setResults((r) => [...r, ...many(r.length, 18)]);
      }}
    />
  );
}
export const ShowMore: Story = {
  render: (args) => <Paged {...args} />,
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("status")).toHaveTextContent("Showing 20 of 38 results");
    await userEvent.click(canvas.getByRole("button", { name: "Show 18 more" }));
    await expect(args.onShowMore).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("status")).toHaveTextContent("38 results");
    // Focus lands on the first new result.
    await waitFor(() => expect(canvas.getByRole("button", { name: /Price check 21/ })).toHaveFocus());
    await expect(canvas.queryByRole("button", { name: /more/ })).not.toBeInTheDocument();
  },
};

export const ShowMoreFailed: Story = {
  args: { results: many(0, 20), total: 38, moreStatus: "error" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn't load more results.");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onShowMore).toHaveBeenCalledOnce();
  },
};

export const ShowMoreLoading: Story = {
  args: { results: many(0, 20), total: 38, moreStatus: "loading" },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Loading…" })).toBeDisabled();
  },
};

/** Phone: the project path drops under the title; the field and rows are 44px touch targets. */
export const Phone: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  async play({ canvas, canvasElement }) {
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-device", "phone"));
    const row = within(canvas.getByRole("list", { name: "Search results" })).getAllByRole("button")[0]!;
    const title = row.querySelector(".td-search-title")!.getBoundingClientRect();
    const path = row.querySelector(".td-search-meta")!.getBoundingClientRect();
    await expect(path.top).toBeGreaterThanOrEqual(title.bottom - 1);
    // The page never scrolls sideways.
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  },
};
