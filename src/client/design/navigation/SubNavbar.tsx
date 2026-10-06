// SubNavbar — view switcher (List / Board / Cal. + optional Views toggle) and the Filter / Sort /
// Style / Members / Share actions. It owns its five dropdowns with ONE open-menu value (controllable
// via openMenu / onOpenMenuChange), so exactly one is open at a time and the host can show the Filter
// and Sort rows while their menu is open. Style is the quick appearance menu on the shared store (a
// dialog Popover); Share is a Menu with Copy project URL and share targets. Spec: DESIGN.md › Subnavbar.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";

import { useAppearance } from "../core/appearance";
import { Checkbox } from "../core/Checkbox";
import { copyIcon, useCopy } from "../core/clipboard";
import { Icon, type IconName } from "../core/Icon";
import { ExportMenu, type ExportFormatId } from "../core/ExportMenu";
import { MenuDivider, MenuHeading, MenuItem, MenuNote, MenuPopover } from "../core/Menu";
import { Popover } from "../core/Popover";
import { Segmented } from "../core/Segmented";
import { SwatchGroup } from "../core/SwatchGroup";
import { MODES, THEMES } from "../core/themes";
import { LabelChip } from "../board/LabelChip";
import "../core/text.css";
import "./SubNavbar.css";

export interface SubNavbarView {
  id: string;
  label: string;
  icon?: IconName;
}
export interface SubNavbarAction {
  id: string;
  label: string;
  icon?: IconName;
}
export const DEFAULT_VIEWS: SubNavbarView[] = [
  { id: "list", label: "List", icon: "list" },
  { id: "board", label: "Board", icon: "kanban" },
  { id: "calendar", label: "Cal.", icon: "calendar" },
];
export const DEFAULT_ACTIONS: SubNavbarAction[] = [
  { id: "filter", label: "Filter", icon: "filter" },
  { id: "sort", label: "Sort", icon: "arrow-up-narrow-wide" },
  { id: "style", label: "Style", icon: "palette" },
];
const VIS_ICONS: Record<string, IconName> = { Private: "lock", Shared: "users", Public: "globe" };
const SHARE_TARGETS: ReadonlyArray<{ id: string; label: string; icon: IconName; href: (u: string) => string }> = [
  { id: "x", label: "X", icon: "x-logo", href: (u) => "https://twitter.com/intent/tweet?url=" + encodeURIComponent(u) },
  { id: "telegram", label: "Telegram", icon: "send", href: (u) => "https://t.me/share/url?url=" + encodeURIComponent(u) },
  { id: "discord", label: "Discord", icon: "discord", href: () => "https://discord.com/channels/@me" },
];

export type SubNavbarMenu = "filter" | "sort" | "style" | "members" | "share";
/** The chip row each menu drives: presses there toggle chips without closing the menu. */
const MENU_ROWS: Partial<Record<SubNavbarMenu, string>> = { filter: '[role="toolbar"][aria-label="Filters"]', sort: '[role="toolbar"][aria-label="Sorting"]' };

/** A toolbar-tier dialog Popover behind an action button (Filter, Sort, Members); its body draws its own header, so the popup is flush. */
function ActionPopover({ label, trigger, children, width = 296, open, onOpenChange, keepOpenWithin }: { label: string; trigger: ReactElement; children: ReactNode; width?: number; open: boolean; onOpenChange: (open: boolean) => void; keepOpenWithin?: string }) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      keepOpenWithin={keepOpenWithin}
      tier="toolbar"
      placement="bottom-start"
      role="dialog"
      aria-label={label}
      width={width}
      className="td-pop-flush"
      trigger={trigger}
    >
      {children}
    </Popover>
  );
}

export interface SubNavbarProps {
  views?: SubNavbarView[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  actions?: SubNavbarAction[];
  /** An action was opened (or pressed, when it has no menu) */
  onAction?: (id: string) => void;
  /** The one open dropdown; leave undefined to let the SubNavbar keep it */
  openMenu?: SubNavbarMenu | null;
  onOpenMenuChange?: (menu: SubNavbarMenu | null) => void;
  /** Body of the Filter action's Popover (a FilterMenu); without it the action only fires onAction */
  filterMenu?: ReactNode;
  /** Body of the Sort action's Popover (a SortMenu) */
  sortMenu?: ReactNode;
  /** Something is filtered / sorted: Rounded marks the trigger with a dot (Minimal relies on the chip rows) */
  filterActive?: boolean;
  sortActive?: boolean;
  /** "Export this view" rows at the end of the Share menu */
  onExport?: (format: ExportFormatId) => void;
  exportCount?: number;
  exportFiltered?: boolean;
  /** Body of the Members action's Popover (a MembersMenu); renders the Members button */
  membersMenu?: ReactNode;
  /** @default true */
  share?: boolean;
  projectUrl?: string;
  /** @default "Private" */
  visibility?: "Private" | "Shared" | "Public";
  /** "More options" footer in the Style menu → Settings › Appearance */
  onOpenAppearance?: () => void;
  /** Adds the icon-less "Views" segment that toggles the saved-views row */
  savedViewsToggle?: boolean;
  savedViewsOpen?: boolean;
  onSavedViewsToggle?: (open: boolean) => void;
  style?: CSSProperties;
  className?: string;
}

export function SubNavbar({ views = DEFAULT_VIEWS, activeView, onViewChange, actions = DEFAULT_ACTIONS, onAction, openMenu, onOpenMenuChange, filterMenu, sortMenu, filterActive = false, sortActive = false, onExport, exportCount, exportFiltered, membersMenu, share = true, projectUrl, visibility = "Private", onOpenAppearance, savedViewsToggle = false, savedViewsOpen = false, onSavedViewsToggle, style, className }: SubNavbarProps) {
  const ap = useAppearance();
  const active = activeView ?? views[0]?.id;
  // One open-menu value for all five dropdowns. The ref guards against a late close of the previous
  // menu (its outside press) clearing the one that has just opened.
  const [ownMenu, setOwnMenu] = useState<SubNavbarMenu | null>(null);
  const curMenu = openMenu !== undefined ? openMenu : ownMenu;
  const menuRef = useRef(curMenu);
  useLayoutEffect(() => {
    menuRef.current = curMenu;
  }, [curMenu]);
  const setMenu = (m: SubNavbarMenu | null) => {
    menuRef.current = m;
    if (openMenu === undefined) setOwnMenu(m);
    onOpenMenuChange?.(m);
  };
  const menuState = (id: SubNavbarMenu) => ({
    open: curMenu === id,
    onOpenChange: (open: boolean) => {
      if (open) {
        setMenu(id);
        onAction?.(id);
      } else if (menuRef.current === id) setMenu(null);
    },
  });
  const closeMenu = () => setMenu(null);
  const [copied, copy] = useCopy();
  const shareUrl = projectUrl ?? (typeof location !== "undefined" ? location.href : "");
  const copyUrl = () => void copy(shareUrl);
  const styleMenu = (
    <div className="td-style-menu">
      <div className="td-style-label">Theme</div>
      <Segmented
        stretch
        aria-label="Theme"
        value={ap.theme}
        onChange={(t) => {
          ap.set({ theme: t });
          closeMenu();
        }}
        options={THEMES.map((t) => ({ id: t.id, label: t.label }))}
      />
      <div className="td-style-label td-style-label-gap">Mode</div>
      <Segmented stretch aria-label="Mode" value={ap.mode} onChange={(m) => ap.set({ mode: m })} options={MODES.map((m) => ({ id: m.id, icon: m.icon, label: m.label }))} />
      <div className="td-style-label td-style-label-gap">Background</div>
      <SwatchGroup aria-label="Background color" options={ap.backgrounds} value={ap.background} onChange={(c) => ap.set({ background: c })} />
      {ap.foregrounds.length ? (
        <>
          <div className="td-style-label td-style-label-gap">Foreground</div>
          <SwatchGroup aria-label="Foreground color" options={ap.foregrounds.map((o) => ({ value: o.id, label: o.label, title: o.title, swatch: `linear-gradient(90deg, ${o.list} 50%, ${o.card} 50%)`, ink: o.ink }))} value={ap.foreground} onChange={(id) => ap.set({ foreground: id })} />
        </>
      ) : null}
      <div className="td-style-div" aria-hidden />
      <div className="td-style-row">
        <Checkbox checked={ap.showItemIds} onChange={(v) => ap.set({ showItemIds: v })} label="Show item IDs" />
        <span className="td-style-eg" aria-hidden>
          TD-102
        </span>
      </div>
      <div className="td-style-row">
        <Checkbox checked={ap.showLabels} onChange={(v) => ap.set({ showLabels: v })} label="Show labels" />
        <span className="td-style-trail" aria-hidden>
          <LabelChip color="teal" text="label" size="sm" />
        </span>
      </div>
      <div className="td-style-row">
        <Checkbox checked={ap.sidebarLeft} onChange={(v) => ap.set({ sidebarLeft: v })} label="Sidebar on left side" />
        <span className="td-style-trail" aria-hidden>
          <Icon name={ap.sidebarLeft ? "panel-left" : "panel-right"} size={14} />
        </span>
      </div>
      <div className="td-style-row">
        <Checkbox checked={ap.suggestShortcuts} onChange={(v) => ap.set({ suggestShortcuts: v })} label="Suggest shortcuts" />
      </div>
      <div className="td-style-row">
        <Checkbox checked={ap.colorizeColumns} onChange={(v) => ap.set({ colorizeColumns: v })} label="Colorize Board columns" />
      </div>
      {onOpenAppearance ? (
        <button
          type="button"
          className="td-style-more"
          onClick={() => {
            closeMenu();
            onOpenAppearance();
          }}
        >
          <Icon name="settings-2" size={14} />
          More options
        </button>
      ) : null}
    </div>
  );
  return (
    <div className={["td-subnav", className ?? ""].join(" ").trim()} style={style} role="toolbar" aria-label="Project views and actions">
      <div className="td-subnav-spacer" />
      {actions.length || membersMenu ? (
        <div className="td-subnav-actions">
          {actions.map((a) => {
            if (a.id === "style") {
              return (
                <Popover
                  key={a.id}
                  {...menuState("style")}
                  tier="toolbar"
                  placement="bottom-start"
                  role="dialog"
                  aria-label="Board style"
                  width={264}
                  trigger={
                    <button type="button" className="td-subnav-act td-tip td-tip-labeled" data-tip={a.label} data-menu="style">
                      {a.icon ? <Icon name={a.icon} size={16} /> : null}
                      {a.label}
                    </button>
                  }
                >
                  {styleMenu}
                </Popover>
              );
            }
            const menu = a.id === "filter" ? filterMenu : a.id === "sort" ? sortMenu : null;
            const marked = a.id === "filter" ? filterActive : a.id === "sort" ? sortActive : false;
            // The active marker is its own element: the trigger's ::after belongs to the tooltip.
            const button = (
              <button type="button" className="td-subnav-act td-tip td-tip-labeled" data-tip={a.label} data-menu={menu ? a.id : undefined} data-active={marked ? "true" : undefined} onClick={menu ? undefined : () => onAction?.(a.id)}>
                {a.icon ? <Icon name={a.icon} size={16} /> : null}
                {a.label}
                {marked ? (
                  <>
                    <span className="td-subnav-dot" aria-hidden />
                    <span className="td-sr-only"> (active)</span>
                  </>
                ) : null}
              </button>
            );
            if (!menu) return <span key={a.id}>{button}</span>;
            const id = a.id as SubNavbarMenu;
            return (
              <ActionPopover key={a.id} label={`${a.label} options`} trigger={button} {...menuState(id)} keepOpenWithin={MENU_ROWS[id]}>
                {menu}
              </ActionPopover>
            );
          })}
          {membersMenu ? (
            <ActionPopover
              label="Project members and sharing"
              width={320}
              {...menuState("members")}
              trigger={
                <button type="button" className="td-subnav-act td-tip td-tip-labeled" data-tip="Members" data-menu="members">
                  <Icon name="users" size={16} />
                  Members
                </button>
              }
            >
              {membersMenu}
            </ActionPopover>
          ) : null}
          {share ? (
            <MenuPopover
              {...menuState("share")}
              label="Share project"
              tier="toolbar"
              placement="bottom-end"
              minWidth={296}
              trigger={
                <button type="button" className="td-subnav-act td-tip" aria-label="Share" data-tip="Share" data-menu="share">
                  <Icon name="share-2" size={16} />
                </button>
              }
            >
              <MenuItem icon={copyIcon(copied, "link")} onSelect={copyUrl} closeOnSelect={false} trailing={<span className="td-share-vis"><Icon name={VIS_ICONS[visibility] ?? "lock"} size={12} />{visibility}</span>}>
                {copied === "copied" ? "Link copied!" : copied === "failed" ? "Couldn't copy. Use the address bar." : "Copy project URL"}
              </MenuItem>
              <MenuNote title={shareUrl}>{shareUrl}</MenuNote>
              <MenuDivider />
              {SHARE_TARGETS.map((t) => (
                <MenuItem key={t.id} icon={t.icon} onSelect={() => window.open(t.href(shareUrl), "_blank", "noopener")}>
                  {t.label}
                </MenuItem>
              ))}
              {onExport ? (
                <>
                  <MenuDivider />
                  <MenuHeading>Export this view</MenuHeading>
                  <ExportMenu scope="view" view={views.find((v) => v.id === active)?.label === "Cal." ? "Calendar" : views.find((v) => v.id === active)?.label} count={exportCount} filtered={exportFiltered} onExport={onExport} onPrint={() => window.print()} />
                </>
              ) : null}
            </MenuPopover>
          ) : null}
        </div>
      ) : null}
      {views.length ? (
        <div className="td-subnav-views" role="group" aria-label="View">
          {views.map((v) => (
            <button key={v.id} type="button" className="td-subnav-seg td-tip td-tip-labeled" data-tip={v.label === "Cal." ? "Calendar" : v.label} aria-label={v.label === "Cal." ? "Calendar" : undefined} aria-pressed={v.id === active} onClick={() => onViewChange?.(v.id)}>
              {v.icon ? <Icon name={v.icon} size={16} /> : null}
              {v.label}
            </button>
          ))}
          {savedViewsToggle ? (
            <>
              <span className="td-subnav-vdiv" aria-hidden />
              <button type="button" className="td-subnav-seg" aria-expanded={!!savedViewsOpen} aria-controls="td-saved-views" aria-label={savedViewsOpen ? "Hide saved views" : "Show saved views"} onClick={() => onSavedViewsToggle?.(!savedViewsOpen)}>
                Views
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
