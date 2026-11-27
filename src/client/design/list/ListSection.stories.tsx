import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { getAppearance, useAppearanceStore } from "../core/appearance";
import { Button } from "../core/Button";
import { applyViewportAttrs, getViewport } from "../core/viewport";
import { ListRow } from "./ListRow";
import { GroupLead, ListSection } from "./ListSection";

const rows = (
  <>
    <ListRow dragId="r1" itemId="HE-112" title="Confirm the hangar slot for October" labels={[{ color: "blue", text: "Ops" }]} due="Oct 9, 2026" assignees={["todoi"]} />
    <ListRow dragId="r2" itemId="HE-115" title="Prepare the helicopter quote" labels={[{ color: "orange", text: "Sales" }]} due="Oct 2, 2026" dueState="overdue" priority="High" />
    <ListRow dragId="r3" itemId="HE-118" title="Send the pilot roster" attachments={2} assignees={["Sam Verhoeven"]} />
  </>
);

const meta = {
  title: "List/ListSection",
  component: ListSection,
  decorators: [(Story) => <div style={{ maxWidth: 900, padding: 12, background: "var(--chrome-canvas)" }}><Story /></div>],
  args: { name: "Doing", count: 3, listId: "doing", children: rows, onAddItem: fn(), onRename: fn(), onIconChange: fn(), onStatusRoleChange: fn(), onManageLinks: fn(), onSelectAll: fn(), onHide: fn() },
  parameters: { docs: { description: { component: "One list in the List view: a collapsible header with icon picker, name, count, + (add at top) and ⋯ list actions over a block of ListRows ending in an \"Add an item\" quick-add row. Compose it inside ListView. Collapse and the open composer are local state; new items, renames and icon or role changes go to the caller through callbacks." } } },
} satisfies Meta<typeof ListSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
/** Suggest shortcuts puts N in the + hint and a hover chip at the end of "Add an item"; the chip stays out of the name. */
export const AddItemKey: Story = {
  async play({ canvas }) {
    const { set } = useAppearanceStore.getState();
    const before = getAppearance().suggestShortcuts;
    const add = canvas.getByRole("button", { name: "Add an item" });
    try {
      set({ suggestShortcuts: true });
      await waitFor(() => expect(add.querySelector(".td-add-kbd")).toHaveTextContent("N"));
      await expect(canvas.getByRole("button", { name: "Add an item at the top of Doing" })).toHaveAttribute("data-tip-kbd", "N");
      set({ suggestShortcuts: false });
      await waitFor(() => expect(add.querySelector(".td-add-kbd")).toBeNull());
      await expect(canvas.getByRole("button", { name: "Add an item at the top of Doing" })).not.toHaveAttribute("data-tip-kbd");
    } finally {
      set({ suggestShortcuts: before });
    }
  },
};
export const Empty: Story = { args: { name: "Backlog", count: 0, children: undefined } };
export const Collapsed: Story = {
  args: { defaultCollapsed: true },
  async play({ canvas, userEvent }) {
    const chevron = canvas.getByRole("button", { name: "Expand Doing" });
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(chevron);
    await expect(canvas.getByRole("button", { name: "Collapse Doing" })).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByRole("list", { name: "Doing items" })).toBeVisible();
  },
};
export const InboxStyle: Story = {
  args: { name: "Inbox", showHeader: false, showAddRow: false, menu: false, collapsible: false },
};
export const WithHeaderActions: Story = {
  args: { name: "Inbox", menu: false, collapsible: false, actions: <Button variant="ghost">Mark all read</Button> },
};

export const AddAtBottom: Story = {
  async play({ args, canvas, userEvent }) {
    // The ghost row at the bottom has its own name, distinct from the header + toggle.
    await userEvent.click(canvas.getByRole("button", { name: "Add an item" }));
    const field = canvas.getByRole("textbox", { name: "New item in Doing" });
    await expect(field).toHaveFocus();
    await userEvent.type(field, "Book the fuel truck{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Book the fuel truck", expect.objectContaining({ title: "Book the fuel truck" }), "bottom");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "New item in Doing" })).not.toBeInTheDocument();
  },
};
export const AddAtTop: Story = {
  args: { defaultCollapsed: true },
  async play({ args, canvas, userEvent }) {
    // The header + expands a collapsed section and opens the composer above the rows. It is a toggle, so
    // its name stays the same and only aria-pressed changes.
    const plus = canvas.getByRole("button", { name: "Add an item at the top of Doing" });
    await expect(plus).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(plus);
    await expect(plus).toHaveAttribute("aria-pressed", "true");
    await expect(plus).toHaveAccessibleName("Add an item at the top of Doing");
    await expect(canvas.getByRole("button", { name: "Collapse Doing" })).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox", { name: "New item in Doing" }), "Call the insurer{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Call the insurer", expect.objectContaining({ title: "Call the insurer" }), "top");
    await userEvent.click(plus);
    await expect(plus).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.queryByRole("textbox", { name: "New item in Doing" })).not.toBeInTheDocument();
  },
};
export const Rename: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    const field = await canvas.findByRole("textbox", { name: "List name" });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.clear(field);
    await userEvent.type(field, "In progress{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("In progress");
  },
};

// Group sections (ListGroups): `groupId` + `lead`, no menu, no add rows; count and chevron always show.
const groupArgs = { groupId: "HIGH", name: "High", count: 3, menu: false, showAddRow: false, onAddItem: undefined, lead: <GroupLead group={{ icon: "flag", iconColor: "var(--label-orange)" }} /> } as const;
/** A group header leads with its glyph (or a member's avatar, or a label swatch) and has no + while the host gives no onAddItem. */
export const GroupSection: Story = {
  args: groupArgs,
  async play({ canvasElement, canvas }) {
    const section = canvasElement.querySelector("section")!;
    await expect(section).toHaveAttribute("data-group-id", "HIGH");
    await expect(canvas.queryByRole("button", { name: /Add an item/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /List actions/ })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Collapse High" })).toBeVisible();
  },
};
export const GroupLeads: Story = {
  render: (args) => (
    <div style={{ display: "grid", gap: 12 }}>
      <ListSection {...args} groupId="u1" name="Sam Verhoeven" count={2} lead={<GroupLead group={{ avatar: { name: "Sam Verhoeven" } }} />} />
      <ListSection {...args} groupId="l1" name="Sales" count={1} lead={<GroupLead group={{ color: "var(--label-orange)" }} />} />
      <ListSection {...args} groupId="today" name="Today" count={0} lead={<GroupLead group={{ icon: "calendar-check" }} />} empty="No items">
        {null}
      </ListSection>
    </div>
  ),
  args: groupArgs,
};
/** With onAddItem (a group that stands for one value) the header + opens the quick-add field at the top of the group,
 * styled as a list section's add row; the host adds the item with the group's value. */
export const GroupAddItem: Story = {
  args: { ...groupArgs, onAddItem: fn() },
  async play({ args, canvas, userEvent }) {
    const plus = canvas.getByRole("button", { name: "Add an item to High" });
    await userEvent.click(plus);
    await expect(plus).toHaveAttribute("aria-pressed", "true");
    const field = await canvas.findByRole("textbox", { name: "New item in High" });
    await waitFor(() => expect(field).toHaveFocus());
    await expect(field.closest(".td-list-section-addrow")).toBe(canvas.getByRole("list", { name: "High items" }).previousElementSibling);
    await userEvent.type(field, "Ship the rotor{Enter}");
    await expect(args.onAddItem).toHaveBeenCalledWith("Ship the rotor", expect.objectContaining({ title: "Ship the rotor" }), "top");
    // Enter keeps the field for the next item; Escape closes it
    await expect(field).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "New item in High" })).not.toBeInTheDocument();
  },
};
/**
 * A touch screen: viewport.ts sets html[data-touch] from `(hover: none) and (pointer: coarse)`; a story forces it with
 * html[data-force-touch] (Storybook's viewport only changes the width).
 */
function touchScreen() {
  const root = document.documentElement;
  root.setAttribute("data-force-touch", "true");
  applyViewportAttrs(getViewport());
  return () => {
    root.removeAttribute("data-force-touch");
    applyViewportAttrs(getViewport());
  };
}
const opacityOf = (el: HTMLElement) => getComputedStyle(el).opacity;
const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/**
 * On touch the header's controls always show (no hover to reveal them; a tappable control is never invisible): the
 * collapse chevron and the + are 44px targets around the same look, side by side, inside the header — over neither
 * each other, the ⋯, nor the rows.
 */
const expectTouchHead = async (plus: HTMLElement) => {
  const head = plus.closest<HTMLElement>(".td-list-section-head")!;
  const chevron = head.querySelector<HTMLElement>(".td-list-section-chevron")!;
  for (const el of [chevron, plus]) {
    await waitFor(() => expect(opacityOf(el)).toBe("1"));
    const box = el.getBoundingClientRect();
    await expect([box.width, box.height]).toEqual([44, 44]);
    await expect(box.bottom).toBeLessThanOrEqual(head.getBoundingClientRect().bottom + 0.5);
  }
  const more = head.querySelector<HTMLElement>(".td-list-section-more");
  const targets = [chevron, plus, ...(more ? [more] : [])].map((el) => el.getBoundingClientRect());
  for (const [i, a] of targets.entries()) for (const b of targets.slice(i + 1)) await expect(overlaps(a, b)).toBe(false);
};
/** Phone, touch: a group's + is its only add affordance (no bottom add row), so it always shows, as does its chevron. */
export const GroupAddItemTouchPhone: Story = {
  args: { ...groupArgs, onAddItem: fn() },
  globals: { viewport: { value: "phone", isRotated: false } },
  beforeEach: touchScreen,
  async play({ canvas, canvasElement }) {
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-device", "phone"));
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-touch", "true");
    await expectTouchHead(canvas.getByRole("button", { name: "Add an item to High" }));
  },
};
/** Touch, collapsed: the chevron (Expand) and the + both show and keep their 44px targets apart. */
export const GroupCollapsedTouch: Story = {
  args: { ...groupArgs, onAddItem: fn(), defaultCollapsed: true },
  globals: { viewport: { value: "phone", isRotated: false } },
  beforeEach: touchScreen,
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Expand High" })).toHaveAttribute("aria-expanded", "false");
    await expectTouchHead(canvas.getByRole("button", { name: "Add an item to High" }));
  },
};
/** Tablet, touch: decided by the input, not the width — the chevron and + show here too, and on a list's header. */
export const GroupAddItemTouchTablet: Story = {
  render: (args) => (
    <div style={{ display: "grid", gap: 12 }}>
      <ListSection {...args} />
      <ListSection name="Doing" count={3} listId="doing" onAddItem={fn()}>
        {rows}
      </ListSection>
    </div>
  ),
  args: { ...groupArgs, onAddItem: fn() },
  globals: { viewport: { value: "tablet", isRotated: false } },
  beforeEach: touchScreen,
  async play({ canvas, canvasElement }) {
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-device", "tablet"));
    await expectTouchHead(canvas.getByRole("button", { name: "Add an item to High" }));
    await expectTouchHead(canvas.getByRole("button", { name: "Add an item at the top of Doing" }));
  },
};
/** A phone-wide window with a mouse: hover-capable, so the + waits for hover or focus inside the group, as on desktop. */
export const GroupAddItemNarrowWithMouse: Story = {
  args: { ...groupArgs, onAddItem: fn() },
  globals: { viewport: { value: "phone", isRotated: false } },
  async play({ canvas, canvasElement }) {
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-device", "phone"));
    const plus = canvas.getByRole("button", { name: "Add an item to High" });
    await waitFor(() => expect(opacityOf(plus)).toBe("0"));
    await expect(plus.getBoundingClientRect().width).toBeLessThan(44);
  },
};
/** Hover-capable: the + shows on the header's hover, and while focus is anywhere in the group (:focus-within). */
export const GroupAddItemFocusWithin: Story = {
  args: { ...groupArgs, onAddItem: fn() },
  async play({ canvas, userEvent }) {
    const plus = canvas.getByRole("button", { name: "Add an item to High" });
    await waitFor(() => expect(opacityOf(plus)).toBe("0"));
    // Focus on a row's control, inside the group
    const inRow = canvas.getByRole("button", { name: "Copy HE-112" });
    inRow.focus();
    await waitFor(() => expect(opacityOf(plus)).toBe("1"));
    inRow.blur();
    await waitFor(() => expect(opacityOf(plus)).toBe("0"));
    // Tab from the chevron reaches the + and shows it (:hover can't be checked here: synthetic pointer events don't set it)
    canvas.getByRole("button", { name: "Collapse High" }).focus();
    await userEvent.tab();
    await waitFor(() => expect(plus).toHaveFocus());
    await waitFor(() => expect(opacityOf(plus)).toBe("1"));
  },
};
/** The host controls collapse (per device for groups): the chevron asks, the host answers. */
export const GroupCollapsedControlled: Story = {
  args: { ...groupArgs, collapsed: true, onCollapsedChange: fn() },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Expand High" }));
    await expect(args.onCollapsedChange).toHaveBeenCalledWith(false);
    // Still collapsed: the host has not changed `collapsed`
    await expect(canvas.getByRole("button", { name: "Expand High" })).toHaveAttribute("aria-expanded", "false");
  },
};
/** Dragging an item over a group: "accept" rings it; "refuse" shows a ban glyph and the reason in the header. */
export const GroupDropStates: Story = {
  render: (args) => (
    <div style={{ display: "grid", gap: 12 }}>
      <ListSection {...args} groupId="today" name="Today" lead={<GroupLead group={{ icon: "calendar-check" }} />} dropState="accept" />
      <ListSection {...args} groupId="week" name="This week" lead={<GroupLead group={{ icon: "calendar-range" }} />} dropState="refuse" dropNote="This week covers several days. Open the item to pick a date." />
    </div>
  ),
  args: groupArgs,
  async play({ canvasElement, canvas }) {
    const [accept, refuse] = [...canvasElement.querySelectorAll("section")];
    await expect(accept).toHaveAttribute("data-drop", "accept");
    await expect(refuse).toHaveAttribute("data-drop", "refuse");
    await expect(canvas.getByText("This week covers several days. Open the item to pick a date.")).toBeVisible();
    await expect(getComputedStyle(refuse!).cursor).toBe("not-allowed");
  },
};
