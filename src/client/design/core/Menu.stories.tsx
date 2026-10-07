import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "./Button";
import { MenuButton, MenuDivider, MenuHeading, MenuItem, MenuNote, MenuPopover, type MenuButtonProps } from "./Menu";

function ItemActions(args: MenuButtonProps) {
  return (
    <MenuButton {...args}>
      <MenuItem icon="pencil" shortcut="E">Rename</MenuItem>
      <MenuItem icon="copy">Duplicate</MenuItem>
      <MenuItem icon="link" disabled>Copy link</MenuItem>
      <MenuDivider />
      <MenuItem icon="archive">Archive</MenuItem>
      <MenuItem icon="trash-2" danger shortcut="⌫">Delete</MenuItem>
      <MenuNote>Deleted items stay in the Trash for 90 days.</MenuNote>
    </MenuButton>
  );
}

// A row with `drill` keeps the menu open so the caller can swap in a sub-view.
function MoveMenu(args: MenuButtonProps) {
  const [view, setView] = useState<"root" | "move">("root");
  const [list, setList] = useState("To-do");
  return (
    <MenuButton {...args} onOpenChange={(open, reason) => { if (!open) setView("root"); args.onOpenChange?.(open, reason); }}>
      {view === "root" ? (
        <>
          <MenuItem icon="arrow-right" drill trailing={list} onSelect={() => setView("move")}>Move to</MenuItem>
          <MenuItem icon="archive">Archive</MenuItem>
        </>
      ) : (
        <>
          <MenuHeading>Move to list</MenuHeading>
          {["To-do", "Doing", "Done"].map((name) => (
            <MenuItem key={name} checked={name === list} onSelect={() => setList(name)}>{name}</MenuItem>
          ))}
        </>
      )}
    </MenuButton>
  );
}

function SortMenu(args: MenuButtonProps) {
  const [sort, setSort] = useState("manual");
  const options = [{ id: "manual", label: "Manual" }, { id: "due", label: "Due date" }, { id: "priority", label: "Priority" }];
  return (
    <MenuPopover {...args} trigger={<Button variant="outline" icon="arrow-down-wide-narrow">Sort</Button>} placement="bottom-start">
      <MenuHeading>Sort items by</MenuHeading>
      {options.map((o) => (
        <MenuItem key={o.id} checked={o.id === sort} onSelect={() => setSort(o.id)}>{o.label}</MenuItem>
      ))}
    </MenuPopover>
  );
}

const meta = {
  title: "Core/Menu",
  component: MenuButton,
  render: (args) => <ItemActions {...args} />,
  args: { label: "Item actions", tooltip: "More", onOpenChange: fn() },
  parameters: { docs: { description: { component: "Action and option menus on Base UI Menu (roving focus, typeahead, Escape, outside press, focus return). MenuButton is the ⋯ IconButton trigger; MenuPopover puts the same menu behind any trigger element. Compose MenuItem, MenuDivider, MenuHeading and MenuNote inside; rows with checked become menuitemradio, and drill rows keep the menu open for a caller-owned sub-view. Open state is uncontrolled unless open is passed." } } },
} satisfies Meta<typeof MenuButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Actions: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Item actions" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu", { name: "Item actions" });
    await expect(args.onOpenChange).toHaveBeenCalledWith(true, undefined);
    await expect(within(menu).getByRole("menuitem", { name: "Copy link" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Duplicate/ }));
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, "select");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const Keyboard: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Item actions" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu", { name: "Item actions" });
    // Keyboard open moves focus into the menu; Home / End / typeahead rove from there.
    await waitFor(() => expect(menu).toContainElement(canvasElement.ownerDocument.activeElement as HTMLElement));
    await userEvent.keyboard("{End}");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /Delete/ })).toHaveFocus());
    await userEvent.keyboard("{Home}");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /Rename/ })).toHaveFocus());
    await userEvent.keyboard("a");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /Archive/ })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, "escape");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const DrillIn: Story = {
  args: { label: "Move item" },
  render: (args) => <MoveMenu {...args} />,
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Move item" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: /Move to/ }));
    const doing = await page.findByRole("menuitemradio", { name: "Doing" });
    await expect(page.getByRole("menuitemradio", { name: "To-do" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(doing);
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const OptionsBehindButton: Story = {
  args: { label: "Sort items" },
  render: (args) => <SortMenu {...args} />,
  async play({ canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Sort" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitemradio", { name: "Due date" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await userEvent.click(trigger);
    await expect(await page.findByRole("menuitemradio", { name: "Due date" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemradio", { name: "Manual" })).toHaveAttribute("aria-checked", "false");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const Disabled: Story = {
  args: { disabled: true },
  async play({ args, canvas }) {
    const trigger = canvas.getByRole("button", { name: "Item actions" });
    await expect(trigger).toBeDisabled();
    trigger.click();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
