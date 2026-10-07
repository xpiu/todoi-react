import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { SavedViewTabs, type SavedViewTab, type SavedViewTabsProps } from "./SavedViewTabs";

const VIEWS: SavedViewTab[] = [
  { id: "v1", name: "Bugs this sprint", shared: true, definition: { view: "board", filters: [{ type: "label", value: "Bug" }] } },
  { id: "v2", name: "My work", shared: false, definition: { view: "list", filters: [{ type: "assignee", value: "Flo Zuallaert" }], sort: { items: { key: "due", dir: "asc" } } } },
  { id: "v3", name: "Overdue", shared: true, definition: { filters: [{ type: "due", value: "Overdue" }] } },
];

// Story state models the host's active saved view; the component keeps its own save and rename drafts.
function ControlledTabs(args: SavedViewTabsProps) {
  const [activeId, setActiveId] = useState(args.activeId ?? null);
  return (
    <SavedViewTabs
      {...args}
      activeId={activeId}
      onSelect={(id) => {
        setActiveId(id);
        args.onSelect(id);
      }}
    />
  );
}

const meta = {
  title: "Navigation/SavedViewTabs",
  component: SavedViewTabs,
  render: (args) => <ControlledTabs {...args} />,
  decorators: [(Story) => <div style={{ background: "var(--chrome-canvas)", paddingBottom: 10 }}><Story /></div>],
  args: { views: VIEWS, activeId: null, onSelect: fn(), onSave: fn(), onAction: fn(), onHide: fn() },
  parameters: { docs: { description: { component: "The \"Views\" row under the toolbar: All items plus one button per saved view (aria-current marks the active one), a ⋯ menu per view, Save view and Hide. The host owns the views, the active id and whether the live filters drift (`dirty`); the component only keeps its Save and Rename drafts. A rejected onSave keeps the Save popover open with the reason." } } },
} satisfies Meta<typeof SavedViewTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllItems: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("button", { name: "All items" })).toHaveAttribute("aria-current", "true");
    await userEvent.click(canvas.getByRole("button", { name: "My work" }));
    await expect(args.onSelect).toHaveBeenCalledWith("v2");
    await expect(canvas.getByRole("button", { name: "My work" })).toHaveAttribute("aria-current", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Hide" }));
    await expect(args.onHide).toHaveBeenCalledOnce();
  },
};
export const ActiveAndDirty: Story = {
  args: { activeId: "v1", dirty: true, canSave: true, currentDef: { view: "board", filters: [{ type: "label", value: "Bug" }, { type: "priority", value: "High" }] } },
  async play({ args, canvas, canvasElement, userEvent }) {
    await expect(canvas.getByRole("button", { name: /^Bugs this sprint/ })).toHaveAttribute("aria-current", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Bugs this sprint" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Update with current filters" }));
    await expect(args.onAction).toHaveBeenCalledWith("v1", "update");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const SaveView: Story = {
  args: { canSave: true, currentDef: { filters: [{ type: "due", value: "Overdue" }], sort: { items: { key: "priority", dir: "asc" } } } },
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Save view" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Save view" });
    const name = within(dialog).getByRole("textbox", { name: "View name" });
    await waitFor(() => expect(name).toHaveFocus());
    await expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(name, "Overdue by priority{Enter}");
    await expect(args.onSave).toHaveBeenCalledWith("Overdue by priority", true);
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Save view" })).not.toBeInTheDocument());
  },
};
export const SaveError: Story = {
  args: { canSave: true, onSave: fn(() => Promise.reject(new Error("the server is unreachable"))) },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Save view" }));
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Save view" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "View name" }), "Sprint 12");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await expect(await within(dialog).findByText(/Couldn't save the view: the server is unreachable/)).toBeVisible();
    await expect(within(dialog).getByRole("textbox", { name: "View name" })).toHaveValue("Sprint 12");
  },
};
export const Rename: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Overdue" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Rename" }));
    const field = await canvas.findByRole("textbox", { name: "View name" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.clear(field);
    await userEvent.type(field, "Late items{Enter}");
    await expect(args.onAction).toHaveBeenCalledWith("v3", "rename", "Late items");
  },
};
export const ManyViews: Story = {
  args: { views: Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, name: `Sprint ${i + 1} review`, shared: i % 2 === 0, definition: {} })) },
};
