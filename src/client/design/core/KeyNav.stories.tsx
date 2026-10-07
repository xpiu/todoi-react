import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";

import { KeyNav, type KeyNavProps } from "./KeyNav";

const ROW_STYLE = { padding: "var(--sp-2) var(--sp-3)", borderRadius: "var(--radius-md)", background: "var(--surface-card)" } as const;

// Story markup stands in for ListRow / ItemCard: any element matching itemSelector with a data-drag-id.
function Rows({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div role="list" aria-label={label} style={{ display: "grid", gap: "var(--sp-2)", minWidth: 220 }}>
      {ids.map((id) => (
        <div key={id} role="listitem" className="demo-row" data-drag-id={id} aria-label={`Item ${id}`} style={ROW_STYLE}>
          Item {id}
        </div>
      ))}
    </div>
  );
}

function RemovableRows(args: KeyNavProps) {
  const [ids, setIds] = useState(["HE-1", "HE-2", "HE-3"]);
  return (
    <KeyNav
      {...args}
      onItemKey={(id, action) => {
        args.onItemKey?.(id, action);
        if (action === "delete") setIds((current) => current.filter((x) => x !== id));
      }}
    >
      <Rows ids={ids} label="Inbox" />
    </KeyNav>
  );
}

const meta = {
  title: "Core/KeyNav",
  component: KeyNav,
  args: { itemSelector: ".demo-row", onMoveItem: fn(), onItemKey: fn(), onItemSelect: fn() },
  render: (args) => (
    <KeyNav {...args}>
      <Rows ids={["HE-1", "HE-2", "HE-3"]} label="To-do" />
    </KeyNav>
  ),
  parameters: { docs: { description: { component: "Headless keyboard container that BoardView and ListView wrap around their items: the whole collection is one Tab stop (roving tabindex), arrows and J/K move focus, Ctrl/Cmd+arrow emits onMoveItem, single keys emit onItemKey and S / shift+arrows / Ctrl+A emit onItemSelect. Items match itemSelector and are identified by data-drag-id; the caller owns the data and selection state." } } },
} satisfies Meta<typeof KeyNav>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SingleList: Story = {
  async play({ args, canvas, userEvent }) {
    const [first, second, third] = canvas.getAllByRole("listitem");
    await userEvent.tab();
    await expect(first).toHaveFocus();
    await expect(second).toHaveAttribute("tabindex", "-1");
    await userEvent.keyboard("{ArrowDown}");
    await expect(second).toHaveFocus();
    await userEvent.keyboard("j");
    await expect(third).toHaveFocus();
    await userEvent.keyboard("k");
    await expect(second).toHaveFocus();
    await userEvent.keyboard("d");
    await expect(args.onItemKey).toHaveBeenCalledWith("HE-2", "done");
    await userEvent.keyboard("s");
    await expect(args.onItemSelect).toHaveBeenCalledWith(["HE-2"], "toggle");
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    await expect(args.onItemSelect).toHaveBeenLastCalledWith(["HE-2", "HE-3"], "extend");
    await expect(third).toHaveFocus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await expect(args.onItemSelect).toHaveBeenLastCalledWith(["HE-1", "HE-2", "HE-3"], "all");
    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
    await expect(args.onMoveItem).toHaveBeenCalledWith("HE-3", "up");
  },
};

export const Columns: Story = {
  args: { columnSelector: ".demo-col" },
  render: (args) => (
    <KeyNav {...args} style={{ display: "flex", gap: "var(--sp-4)" }}>
      <section className="demo-col" aria-label="To-do">
        <Rows ids={["HE-1", "HE-2"]} label="To-do items" />
      </section>
      <section className="demo-col" aria-label="Doing">
        <Rows ids={["HE-3", "HE-4", "HE-5"]} label="Doing items" />
      </section>
    </KeyNav>
  ),
  async play({ canvas, userEvent }) {
    await userEvent.tab();
    await expect(canvas.getByRole("listitem", { name: "Item HE-1" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    await expect(canvas.getByRole("listitem", { name: "Item HE-4" })).toHaveFocus();
    // ↑/↓ stay inside the column.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect(canvas.getByRole("listitem", { name: "Item HE-5" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(canvas.getByRole("listitem", { name: "Item HE-2" })).toHaveFocus();
  },
};

export const Sections: Story = {
  args: { sectionSelector: ".demo-sec" },
  render: (args) => (
    <KeyNav {...args} style={{ display: "grid", gap: "var(--sp-4)" }}>
      <section className="demo-sec" aria-label="To-do">
        <Rows ids={["HE-1", "HE-2"]} label="To-do items" />
      </section>
      <section className="demo-sec" aria-label="Doing">
        <Rows ids={["HE-3", "HE-4", "HE-5"]} label="Doing items" />
      </section>
    </KeyNav>
  ),
  async play({ args, canvas, userEvent }) {
    await userEvent.tab();
    // ↓ crosses sections (no columnSelector); Ctrl/Cmd+A selects only the focused section.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect(canvas.getByRole("listitem", { name: "Item HE-3" })).toHaveFocus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await expect(args.onItemSelect).toHaveBeenLastCalledWith(["HE-3", "HE-4", "HE-5"], "all");
  },
};

export const DeleteKeepsFocus: Story = {
  render: (args) => <RemovableRows {...args} />,
  async play({ args, canvas, userEvent }) {
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}{Backspace}");
    await expect(args.onItemKey).toHaveBeenCalledWith("HE-2", "delete");
    await waitFor(() => expect(canvas.queryByRole("listitem", { name: "Item HE-2" })).not.toBeInTheDocument());
    await waitFor(() => expect(canvas.getByRole("listitem", { name: "Item HE-3" })).toHaveFocus());
  },
};
