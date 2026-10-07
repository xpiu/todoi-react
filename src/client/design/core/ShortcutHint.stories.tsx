import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, waitFor } from "storybook/test";

import { Button } from "./Button";
import { Keys, SHORTCUT_HINTS, ShortcutHint, useShortcutHints } from "./ShortcutHint";

const hint = (id: string) => ({ id, parts: SHORTCUT_HINTS[id]!.parts });

// The app shell owns the hook and renders one ShortcutHint; this models a pointer action that a key could have done.
function FilterButtonWithHint() {
  const { hint: active, suggest, reset } = useShortcutHints(true);
  // Fresh 3-show budget per story render; the real budget persists in localStorage.
  useEffect(() => reset(), [reset]);
  return (
    <>
      <Button variant="outline" icon="filter" onClick={() => suggest("filter")}>Filter</Button>
      <ShortcutHint hint={active} />
    </>
  );
}

const meta = {
  title: "Core/ShortcutHint",
  component: ShortcutHint,
  args: { hint: hint("item") },
  parameters: { docs: { description: { component: "The quiet bottom-right \"Suggest shortcuts\" pill with kbd chips. The app shell owns useShortcutHints (pointer-only, one at a time, gone after 6s or on any keypress, at most three shows per situation) and renders one ShortcutHint with its hint; SHORTCUT_HINTS names the situations. It is aria-hidden, a pointer-user nudge rather than an announcement. Keys renders the same chips for the ? dialog and Settings." } } },
} satisfies Meta<typeof ShortcutHint>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ItemActions: Story = {};
export const SingleKey: Story = { args: { hint: hint("add-item") } };
export const Chord: Story = { args: { hint: hint("view-board") } };
export const Modified: Story = { args: { hint: hint("move-item") } };
export const Hidden: Story = {
  args: { hint: null },
  async play({ canvasElement }) {
    await expect(canvasElement.querySelector(".td-hint")).toBeNull();
  },
};
export const KeyChips: Story = {
  render: () => <Keys keys={["ctrl", "+", "shift", "+", "K"]} />,
};
export const SuggestAfterPointer: Story = {
  render: () => <FilterButtonWithHint />,
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await waitFor(() => expect(canvasElement.querySelector(".td-hint")).toHaveTextContent("opens the filter menu"));
    await userEvent.keyboard("x");
    await waitFor(() => expect(canvasElement.querySelector(".td-hint")).toBeNull());
  },
};
