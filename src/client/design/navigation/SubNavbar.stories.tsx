import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId, useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { getAppearance, useAppearanceStore } from "../core/appearance";
import { getTheme } from "../core/themes";
import { FilterMenu } from "./FilterMenu";
import { GroupMenu } from "./GroupMenu";
import { MembersMenu } from "./MembersMenu";
import { SavedViewTabs } from "./SavedViewTabs";
import { SortMenu } from "./SortMenu";
import { SubNavbar, type SubNavbarProps } from "./SubNavbar";

const filterMenu = (
  <FilterMenu
    sections={[["Labels", "label"], ["Due date", "due"]]}
    available={[{ type: "label", value: "Sales", color: "var(--label-blue)" }, { type: "label", value: "Urgent", color: "var(--label-red)" }, { type: "due", value: "Overdue", icon: "clock" }]}
    filters={[{ type: "label", value: "Sales" }]}
    counts={{ "label:Sales": 12, "label:Urgent": 3, "due:Overdue": 2 }}
    onToggle={() => {}}
  />
);
const sortMenu = (
  <SortMenu
    sections={[["Sort items", "items"]]}
    options={{ items: [{ key: "none", label: "None", icon: "circle-slash-2", hint: "Board order" }, { key: "due", label: "Due date", icon: "clock", dirs: { asc: "Soonest first", desc: "Latest first" } }] }}
    sort={{ items: null }}
    onSelect={() => {}}
  />
);
const membersMenu = (
  <MembersMenu
    members={[{ id: "u1", name: "todoi", email: "info@todoi.org", color: "var(--label-teal)", role: "owner" }, { id: "u2", name: "Sam Verhoeven", color: "var(--label-orange)", role: "editor" }]}
    currentUserId="u1"
    canManage
    visibility="shared"
    onVisibilityChange={() => {}}
    onChangeRole={() => {}}
    url="https://todoi.com/hs8d3kfw5t"
  />
);

// Story state models the host: it owns the active view and the saved-views row the Views toggle
// controls, passing one id to both (the toggle's aria-controls and the row's id).
function ControlledSubNavbar(args: SubNavbarProps) {
  const savedViewsId = useId();
  const [view, setView] = useState(args.activeView);
  const [svOpen, setSvOpen] = useState(!!args.savedViewsOpen);
  return (
    <>
      <SubNavbar
        {...args}
        activeView={view}
        onViewChange={(id) => {
          setView(id);
          args.onViewChange?.(id);
        }}
        savedViewsOpen={svOpen}
        savedViewsId={savedViewsId}
        onSavedViewsToggle={(open) => {
          setSvOpen(open);
          args.onSavedViewsToggle?.(open);
        }}
      />
      {svOpen ? <SavedViewTabs id={savedViewsId} views={[{ id: "v1", name: "Bugs this sprint", shared: true, definition: {} }]} onSelect={() => {}} onSave={() => {}} onAction={() => {}} onHide={() => setSvOpen(false)} /> : null}
    </>
  );
}

const meta = {
  title: "Navigation/SubNavbar",
  component: SubNavbar,
  render: (args) => <ControlledSubNavbar {...args} />,
  decorators: [(Story) => <div style={{ background: "var(--chrome-canvas)", padding: 8 }}><Story /></div>],
  args: {
    activeView: "board",
    projectUrl: "https://todoi.com/hs8d3kfw5t",
    visibility: "Shared",
    filterMenu,
    sortMenu,
    membersMenu,
    filterActive: true,
    savedViewsToggle: true,
    onViewChange: fn(),
    onAction: fn(),
    onOpenMenuChange: fn(),
    onExport: fn(),
    exportCount: 18,
    exportFiltered: true,
    onOpenAppearance: fn(),
    onSavedViewsToggle: fn(),
  },
  parameters: { docs: { description: { component: "The project toolbar: the List / Board / Cal. switcher (plus the Views toggle) and the Filter, Sort, Style, Members and Share actions. Hosts pass the menu bodies (FilterMenu, SortMenu, MembersMenu) as slots; the SubNavbar keeps exactly one menu open, controllable through openMenu / onOpenMenuChange so the host can show the matching chip row. Style edits the shared appearance store directly." } } },
} satisfies Meta<typeof SubNavbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ args, canvas, userEvent }) {
    const list = canvas.getByRole("button", { name: "List" });
    await userEvent.click(list);
    await expect(args.onViewChange).toHaveBeenCalledWith("list");
    await expect(list).toHaveAttribute("aria-pressed", "true");
    const views = canvas.getByRole("button", { name: "Show saved views" });
    await userEvent.click(views);
    await expect(args.onSavedViewsToggle).toHaveBeenCalledWith(true);
    const toggle = canvas.getByRole("button", { name: "Hide saved views" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const rowId = toggle.getAttribute("aria-controls");
    await expect(rowId).toBeTruthy();
    await expect(canvas.getByRole("navigation", { name: "Saved views" })).toHaveAttribute("id", rowId);
  },
};
/** Suggest shortcuts adds each view's and Filter's key to its hint; with it off, the hints carry no key. */
export const ShortcutHints: Story = {
  async play({ canvas }) {
    const { set } = useAppearanceStore.getState();
    const before = getAppearance().suggestShortcuts;
    try {
      set({ suggestShortcuts: true });
      await waitFor(() => expect(canvas.getByRole("button", { name: "Board" })).toHaveAttribute("data-tip-kbd", "G then B"));
      await expect(canvas.getByRole("button", { name: "Cal. (Calendar)" })).toHaveAttribute("data-tip-kbd", "G then C");
      await expect(canvas.getByRole("button", { name: /^Filter/ })).toHaveAttribute("data-tip-kbd", "F");
      await expect(canvas.getByRole("button", { name: /^Sort/ })).not.toHaveAttribute("data-tip-kbd");
      set({ suggestShortcuts: false });
      await waitFor(() => expect(canvas.getByRole("button", { name: "Board" })).not.toHaveAttribute("data-tip-kbd"));
    } finally {
      set({ suggestShortcuts: before });
    }
  },
};
/** One open menu at a time: opening Sort closes Filter. */
export const OneMenuAtATime: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: /^Filter/ }));
    const filter = await page.findByRole("dialog", { name: "Filter options" });
    await expect(within(filter).getByRole("checkbox", { name: "Sales" })).toHaveAttribute("aria-checked", "true");
    await expect(args.onAction).toHaveBeenCalledWith("filter");
    await expect(args.onOpenMenuChange).toHaveBeenLastCalledWith("filter");
    await userEvent.click(canvas.getByRole("button", { name: "Sort" }));
    await expect(await page.findByRole("dialog", { name: "Sort options" })).toBeInTheDocument();
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Filter options" })).not.toBeInTheDocument());
    await expect(args.onOpenMenuChange).toHaveBeenLastCalledWith("sort");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Sort options" })).not.toBeInTheDocument());
    await expect(args.onOpenMenuChange).toHaveBeenLastCalledWith(null);
  },
};
export const AppearanceMenu: Story = {
  async play({ args, canvas, canvasElement, globals, userEvent }) {
    // The action reads "Appearance" in both themes: the trigger's text in Rounded, the hint and accessible name of icon-only Minimal.
    const trigger = await canvas.findByRole("button", { name: "Appearance" });
    await expect(trigger).toHaveAttribute("data-tip", "Appearance");
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog", { name: "Appearance" }));
    const ids = dialog.getByRole("checkbox", { name: "Show item IDs" });
    const before = useAppearanceStore.getState().showItemIds;
    await userEvent.click(ids);
    await expect(useAppearanceStore.getState().showItemIds).toBe(!before);
    // Row dividers: offered only by a theme that rules its List rows (Minimal); it writes <html data-row-dividers>.
    const dividers = dialog.queryByRole("checkbox", { name: "Row dividers" });
    if (getTheme(globals.theme).ruledRows) {
      const root = canvasElement.ownerDocument.documentElement;
      await expect(dividers).toHaveAttribute("aria-checked", "true");
      await expect(root).toHaveAttribute("data-row-dividers", "true");
      await userEvent.click(dividers!);
      await expect(root).toHaveAttribute("data-row-dividers", "false");
      await expect(getAppearance().rowDividers).toBe(false);
    } else await expect(dividers).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "More options" }));
    await expect(args.onOpenAppearance).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Appearance" })).not.toBeInTheDocument());
  },
};
/** "Checked items move to Done" is a project setting: one row-wide button (box, label, chevron) that shows the
 * project's value and opens the Projects page. It is not a checkbox, so it never toggles in place. While a menu is
 * open the toolbar marks it with data-open-menu, which turns the neighbouring triggers' hints off. */
export const CheckedMoveShortcut: Story = {
  args: { checkedMove: true, onOpenCheckedMove: fn() },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(await canvas.findByRole("button", { name: "Appearance" }));
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog", { name: "Appearance" }));
    await expect(canvas.getByRole("toolbar", { name: "Project views and actions" })).toHaveAttribute("data-open-menu", "appearance");
    await expect(dialog.queryByRole("checkbox", { name: /Checked items move to Done/ })).not.toBeInTheDocument();
    const row = dialog.getByRole("button", { name: "Checked items move to Done: on. Opens the Projects page" });
    await expect(row.querySelector(".td-check-box-on")).not.toBeNull();
    const label = row.querySelector(".td-appearance-goto-label")!;
    await expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(20);
    await userEvent.click(label);
    await expect(args.onOpenCheckedMove).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Appearance" })).not.toBeInTheDocument());
    await expect(canvas.getByRole("toolbar", { name: "Project views and actions" })).not.toHaveAttribute("data-open-menu");
  },
};
export const ShareAndExport: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Share" }));
    const page = within(canvasElement.ownerDocument.body);
    const menu = within(await page.findByRole("menu", { name: "Share project" }));
    await waitFor(() => expect(menu.getByText("https://todoi.com/hs8d3kfw5t")).toBeVisible());
    await userEvent.click(menu.getByRole("menuitem", { name: /CSV/ }));
    await expect(args.onExport).toHaveBeenCalledWith("csv");
  },
};
export const MembersAction: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Members" }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "Project members and sharing" })).toBeInTheDocument();
  },
};
/** Without menu bodies the actions only report presses through onAction. */
export const ActionsOnly: Story = {
  args: { filterMenu: undefined, sortMenu: undefined, membersMenu: undefined, share: false, savedViewsToggle: false, filterActive: false, onExport: undefined },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await expect(args.onAction).toHaveBeenCalledWith("filter");
    // No groupMenu, no Group button
    await expect(canvas.queryByRole("button", { name: /^Group/ })).not.toBeInTheDocument();
  },
};
/** With `groupMenu` the Group button (layers) follows Sort; it carries the active dot while a group is picked, and its 264px menu stays open on a pick. */
export const GroupAction: Story = {
  args: { activeView: "list", groupActive: true, groupMenu: <GroupMenu group="priority" onSelect={fn()} onReset={fn()} onShowEmptyChange={fn()} /> },
  async play({ canvas, canvasElement, userEvent }) {
    const buttons = [...canvasElement.querySelectorAll<HTMLElement>(".td-subnav-actions .td-subnav-action")].map((b) => b.dataset.tip);
    await expect(buttons.slice(0, 3)).toEqual(["Filter", "Sort", "Group"]);
    const group = canvas.getByRole("button", { name: /^Group/ });
    await expect(group).toHaveAttribute("data-active", "true");
    await expect(group).toHaveAttribute("data-menu", "group");
    await userEvent.click(group);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Group options" });
    await expect(within(dialog).getByRole("radio", { name: "Priority" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Status" }));
    await expect(page.getByRole("dialog", { name: "Group options" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Group options" })).not.toBeInTheDocument());
    await waitFor(() => expect(group).toHaveFocus());
  },
};
/** Board and Calendar: the Group menu's rows are disabled, with the note and "Open List view". */
export const GroupOutsideListView: Story = {
  args: { activeView: "board", groupActive: true, groupMenu: <GroupMenu group="status" disabled note="Groups show in List view." onOpenList={fn()} />, openMenu: "group" },
  async play({ canvasElement }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Group options" });
    await expect(within(dialog).getByRole("note")).toHaveTextContent("Groups show in List view.");
    await expect(within(dialog).getByRole("radio", { name: "Status" })).toBeDisabled();
  },
};
