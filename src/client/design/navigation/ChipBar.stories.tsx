import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";

import { FilterChip } from "../board/FilterChip";
import { ChipBar, ChipBarAction } from "./ChipBar";

const LABELS = ["Sales", "Marketing", "Urgent", "Blocked", "Customer", "Internal", "Design", "Engineering", "Finance", "Legal", "Support", "Research"];
const chips = (names: string[]) => names.map((n, i) => <FilterChip key={n} value={n} category="label" color={`var(--label-${["blue", "green", "red", "orange", "purple", "teal"][i % 6]})`} selected={i < 2} />);

const meta = {
  title: "Navigation/ChipBar",
  component: ChipBar,
  // The chip rows sit on the chrome canvas under the SubNavbar.
  decorators: [(Story) => <div style={{ background: "var(--chrome-canvas)", paddingBottom: 10, maxWidth: 720 }}><Story /></div>],
  args: { label: "Filter by", icon: "filter", "aria-label": "Filters", moreLabel: "More filters", backLabel: "Previous filters", children: chips(LABELS.slice(0, 4)) },
  parameters: { docs: { description: { component: "The shared frame of the Views, Filter by and Sort by rows: a leading label, the chips, an optional `after` slot and trailing ChipBarAction buttons. It owns only the desktop one-row scroller (≥1024px) with paging chevrons; below that the chips wrap. Callers own the chips and their state; use `as=\"nav\"` for a row of navigation buttons, otherwise it is a named toolbar." } } },
} satisfies Meta<typeof ChipBar>;
export default meta;
type Story = StoryObj<typeof meta>;

// ChipBarAction is composed into the `actions` slot; its spy lives at module scope (Storybook clears spies per story).
const onReset = fn();
export const Toolbar: Story = {
  args: { actions: <ChipBarAction icon="x" active onClick={onReset}>Reset filters</ChipBarAction> },
  async play({ canvas, userEvent }) {
    await expect(canvas.getByRole("toolbar", { name: "Filters" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reset filters" }));
    await expect(onReset).toHaveBeenCalledOnce();
  },
};
export const Navigation: Story = {
  args: { as: "nav", label: "Views", icon: "bookmark", "aria-label": "Saved views", children: ["All items", "Bugs this sprint", "My work"].map((v) => <button key={v} type="button" className="td-sv-tab">{v}</button>) },
  async play({ canvas }) {
    await expect(canvas.getByRole("navigation", { name: "Saved views" })).toBeVisible();
  },
};
/** At desktop width the chips stay on one row; the overflowing edge gets a paging chevron. */
export const Overflowing: Story = {
  args: { children: chips(LABELS), actions: <ChipBarAction icon="x" onClick={fn()}>Reset filters</ChipBarAction> },
  async play({ canvas, userEvent }) {
    const more = await canvas.findByRole("button", { name: "More filters" });
    await expect(canvas.queryByRole("button", { name: "Previous filters" })).not.toBeInTheDocument();
    await userEvent.click(more);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Previous filters" })).toBeVisible());
  },
};
