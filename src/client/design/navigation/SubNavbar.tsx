// SubNavbar — view switcher (List / Board / Cal. + optional Views toggle) and the Filter / Sort /
// Style / Members / Share actions. Style is the quick appearance menu on the shared store (a dialog
// Popover); Share is a Menu with Copy project URL and share targets. Spec: DESIGN.md › Subnavbar.
import { useState, type CSSProperties, type ReactElement, type ReactNode } from "react";

import { useAppearance } from "../core/appearance";
import { Checkbox } from "../core/Checkbox";
import { Icon, type IconName } from "../core/Icon";
import { MenuDivider, MenuItem, MenuNote, MenuPopover } from "../core/Menu";
import { Popover, usePopover } from "../core/Popover";
import { Segmented } from "../core/Segmented";
import { SwatchGroup } from "../core/SwatchGroup";
import { MODES, THEMES } from "../core/themes";
import { LabelChip } from "../board/LabelChip";
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

/** A toolbar-tier dialog Popover behind an action button (Filter, Sort). */
function MenuPopoverless({ label, trigger, children }: { label: string; trigger: ReactElement; children: ReactNode }) {
  const pop = usePopover();
  return (
    <Popover open={pop.open} onOpenChange={pop.setOpen} tier="toolbar" placement="bottom-start" role="dialog" aria-label={`${label} options`} width={296} trigger={trigger}>
      {children}
    </Popover>
  );
}

export interface SubNavbarProps {
  views?: SubNavbarView[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  actions?: SubNavbarAction[];
  /** Filter / Sort pressed (Style opens its own menu) */
  onAction?: (id: string) => void;
  /** Which action currently shows its panel (pressed look) */
  activeAction?: string | null;
  /** Body of the Filter action's Popover (a FilterMenu); without it the action only fires onAction */
  filterMenu?: ReactNode;
  /** Body of the Sort action's Popover (a SortMenu) */
  sortMenu?: ReactNode;
  /** Count badges on the Filter / Sort actions while something is active */
  filterCount?: number;
  sortCount?: number;
  /** Renders the Members button */
  onMembers?: () => void;
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

export function SubNavbar({ views = DEFAULT_VIEWS, activeView, onViewChange, actions = DEFAULT_ACTIONS, onAction, activeAction, filterMenu, sortMenu, filterCount = 0, sortCount = 0, onMembers, share = true, projectUrl, visibility = "Private", onOpenAppearance, savedViewsToggle = false, savedViewsOpen = false, onSavedViewsToggle, style, className }: SubNavbarProps) {
  const ap = useAppearance();
  const active = activeView ?? views[0]?.id;
  const stylePop = usePopover();
  const [copied, setCopied] = useState(false);
  const shareUrl = projectUrl ?? (typeof location !== "undefined" ? location.href : "");
  const copyUrl = () => {
    void navigator.clipboard?.writeText(shareUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };
  const styleMenu = (
    <div className="td-style-menu">
      <div className="td-style-label">Theme</div>
      <Segmented
        stretch
        aria-label="Theme"
        value={ap.theme}
        onChange={(t) => {
          ap.set({ theme: t });
          stylePop.close();
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
            stylePop.close();
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
      {actions.length || onMembers ? (
        <div className="td-subnav-actions">
          {actions.map((a) => {
            if (a.id === "style") {
              return (
                <Popover
                  key={a.id}
                  open={stylePop.open}
                  onOpenChange={stylePop.setOpen}
                  tier="toolbar"
                  placement="bottom-start"
                  role="dialog"
                  aria-label="Board style"
                  width={264}
                  trigger={
                    <button type="button" className="td-subnav-act td-tip td-tip-labeled" data-tip={a.label}>
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
            const badge = a.id === "filter" ? filterCount : a.id === "sort" ? sortCount : 0;
            const button = (
              <button type="button" className="td-subnav-act td-tip td-tip-labeled" data-tip={a.label} data-active={badge ? "true" : undefined} aria-expanded={menu ? undefined : activeAction === a.id} onClick={menu ? undefined : () => onAction?.(a.id)}>
                {a.icon ? <Icon name={a.icon} size={16} /> : null}
                {a.label}
                {badge ? <span className="td-subnav-badge">{badge}</span> : null}
              </button>
            );
            if (!menu) return <span key={a.id}>{button}</span>;
            return (
              <MenuPopoverless key={a.id} label={a.label} trigger={button}>
                {menu}
              </MenuPopoverless>
            );
          })}
          {onMembers ? (
            <button type="button" className="td-subnav-act td-tip td-tip-labeled" data-tip="Members" aria-expanded={activeAction === "members"} onClick={onMembers}>
              <Icon name="users" size={16} />
              Members
            </button>
          ) : null}
          {share ? (
            <MenuPopover
              label="Share project"
              tier="toolbar"
              placement="bottom-end"
              minWidth={296}
              trigger={
                <button type="button" className="td-subnav-act td-tip" aria-label="Share" data-tip="Share">
                  <Icon name="share-2" size={16} />
                </button>
              }
            >
              <MenuItem icon={copied ? "check" : "link"} onSelect={copyUrl} closeOnSelect={false} trailing={<span className="td-share-vis"><Icon name={VIS_ICONS[visibility] ?? "lock"} size={12} />{visibility}</span>}>
                {copied ? "Link copied!" : "Copy project URL"}
              </MenuItem>
              <MenuNote title={shareUrl}>{shareUrl}</MenuNote>
              <MenuDivider />
              {SHARE_TARGETS.map((t) => (
                <MenuItem key={t.id} icon={t.icon} onSelect={() => window.open(t.href(shareUrl), "_blank", "noopener")}>
                  {t.label}
                </MenuItem>
              ))}
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
