import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId, useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { useAppearanceStore } from "../core/appearance";
import { FilterMenu } from "./FilterMenu";
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
    members={[{ id: "u1", name: "Flo Zuallaert", email: "flo@todoi.com", color: "var(--label-teal)", role: "owner" }, { id: "u2", name: "Sam Verhoeven", color: "var(--label-orange)", role: "editor" }]}
    currentUserId="u1"
    canManage
    visibility="shared"
    onVisibilityChange={() => {}}
    onChangeRole={() => {}}
    url="https://todoi.app/p/helicopter-sales"
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
    projectUrl: "https://todoi.app/p/helicopter-sales",
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
export const StyleMenu: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Style" }));
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog", { name: "Board style" }));
    const ids = dialog.getByRole("checkbox", { name: "Show item IDs" });
    const before = useAppearanceStore.getState().showItemIds;
    await userEvent.click(ids);
    await expect(useAppearanceStore.getState().showItemIds).toBe(!before);
    await userEvent.click(dialog.getByRole("button", { name: "More options" }));
    await expect(args.onOpenAppearance).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Board style" })).not.toBeInTheDocument());
  },
};
export const ShareAndExport: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Share" }));
    const page = within(canvasElement.ownerDocument.body);
    const menu = within(await page.findByRole("menu", { name: "Share project" }));
    await waitFor(() => expect(menu.getByText("https://todoi.app/p/helicopter-sales")).toBeVisible());
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
  },
};
