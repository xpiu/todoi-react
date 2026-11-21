// TopNavbar — the always-visible chrome bar: title (click to rename) left; hoisted SubNavbar,
// connection pill, search with the ⌘K hint and its dropdown, the + create menu, the avatar menu and
// the sidebar toggle right (the toggle leads the bar when the sidebar docks left).
// Spec: DESIGN.md › Top navbar, Responsive.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useAppearanceStore, useThemePreference } from "../core/appearance";
import { Avatar } from "../core/Avatar";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { MenuDivider, MenuItem, MenuPopover } from "../core/Menu";
import { IS_MAC } from "../core/shortcuts";
import { TextField } from "../core/TextField";
import { SearchDropdown, type SearchDropdownProps, type SearchEntity, type SearchRecent, type SearchResultType, type SearchSources } from "./SearchDropdown";
import "./TopNavbar.css";

export type CreateKind = "group" | "project" | "list" | "item";
const CREATE_ITEMS: ReadonlyArray<[CreateKind, IconName, string]> = [
  ["group", "folders", "Create a group"],
  ["project", "folder", "Create a project"],
  ["list", "list", "Create a list"],
  ["item", "square-check-big", "Create an item"],
];

export interface TopNavbarUser {
  name: string;
  src?: string;
  /** "var(--label-teal)" */
  avatarColor?: string;
}

export interface TopNavbarProps {
  title: string;
  /** Stable identity of the screen/project; changing it discards the title draft. */
  titleKey?: string;
  /** When set, the title is click-to-rename */
  onTitleChange?: (title: string) => void;
  search?: boolean;
  /** @default "Search" */
  searchPlaceholder?: string;
  searchSources?: SearchSources;
  onSearchSelect?: (type: SearchResultType, id: string, entity: SearchEntity) => void;
  /** The query as typed and whether the dropdown is open — for sources fetched per query */
  onSearchChange?: (query: string, open: boolean) => void;
  /** State of the per-query sources (items), shown in the dropdown */
  searchStatus?: SearchDropdownProps["status"];
  /** Renders the + create menu; the host decides where the kind lands */
  onCreate?: (kind: CreateKind) => void;
  user?: TopNavbarUser;
  /** @default true */
  signedIn?: boolean;
  onOpenSettings?: () => void;
  /** Open the account page (/account) */
  onOpenAccount?: () => void;
  /** Label of the account row in the avatar menu, e.g. the account owner's name @default "Account" */
  accountLabel?: string;
  onLogout?: () => void;
  onLogin?: () => void;
  onCreateAccount?: () => void;
  sidebarOpen?: boolean;
  /** Renders the sidebar toggle */
  onToggleSidebar?: (open: boolean) => void;
  /** Omit to follow the appearance store */
  sidebarSide?: "left" | "right";
  /** Connectivity slot (ConnectionStatus) */
  status?: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** The SubNavbar hoisted into the bar on desktop */
  children?: ReactNode;
}

// Minimal underlines the rename field under the typed text: --td-title-line = text width, floored so an empty
// field still reads as a field, capped at the field.
let titleMeasure: CanvasRenderingContext2D | null = null;
function sizeTitleLine(input: HTMLInputElement) {
  titleMeasure ??= document.createElement("canvas").getContext("2d");
  if (!titleMeasure) return;
  const cs = getComputedStyle(input);
  titleMeasure.font = cs.font;
  if ("letterSpacing" in titleMeasure) titleMeasure.letterSpacing = cs.letterSpacing;
  const w = Math.ceil(titleMeasure.measureText(input.value).width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  input.style.setProperty("--td-title-line", `${Math.min(Math.max(w, 24), input.clientWidth)}px`);
}

function GuestAvatar({ size, tone }: { size: number; tone: "chrome" | "card" }) {
  return (
    <span aria-hidden className="td-topnav-guest" data-tone={tone} style={{ width: size, height: size }}>
      <Icon name="user" size={Math.round(size * 0.6)} />
    </span>
  );
}

// Keep the title draft scoped to its project without resetting search or the rest of the navbar.
function NavbarTitle({ title, onTitleChange }: Pick<TopNavbarProps, "title" | "onTitleChange">) {
  const [editing, setEditing] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);
  const commitTitle = (value: string) => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== title) onTitleChange?.(v);
  };
  return editing ? (
    <input
      className="td-topnav-title"
      defaultValue={title}
      autoFocus
      maxLength={120}
      aria-label="Project name"
      onFocus={(e) => {
        e.target.setSelectionRange(0, e.target.value.length, "backward");
        e.target.scrollLeft = 0;
        sizeTitleLine(e.target);
      }}
      onChange={(e) => sizeTitleLine(e.target)}
      onBlur={(e) => commitTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Escape") e.currentTarget.value = title;
          restoreFocus.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  ) : onTitleChange ? (
    <span
      ref={triggerRef}
      className="td-topnav-title"
      data-editable="true"
      title="Click to rename"
      role="button"
      tabIndex={0}
      aria-label={`Rename project: ${title}`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      <span className="td-topnav-title-text">{title}</span>
      <span className="td-topnav-title-pen" aria-hidden>
        <Icon name="pencil" size={14} />
      </span>
    </span>
  ) : (
    <span className="td-topnav-title">{title}</span>
  );
}

export function TopNavbar({
  title,
  titleKey,
  onTitleChange,
  search,
  searchPlaceholder = "Search",
  searchSources,
  onSearchSelect,
  onSearchChange,
  searchStatus,
  onCreate,
  user,
  signedIn = true,
  onOpenSettings,
  onOpenAccount,
  accountLabel,
  onLogout,
  onLogin,
  onCreateAccount,
  sidebarOpen = true,
  onToggleSidebar,
  sidebarSide,
  status,
  style,
  className,
  children,
}: TopNavbarProps) {
  const sidebarLeft = useThemePreference("sidebarLeft");
  const side = sidebarSide ?? (sidebarLeft ? "left" : "right");
  const leftToggle = side === "left";
  const kbdHint = IS_MAC ? "⌘K" : "Ctrl+K";

  // Search field + dropdown
  const [sOpen, setSOpen] = useState(false);
  const [sQ, setSQ] = useState("");
  const [sFocus, setSFocus] = useState(false);
  const [sRecent, setSRecent] = useState<SearchRecent[]>([]);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  // The field is the dropdown's combobox: it controls the results listbox and points at its highlighted option.
  const sListId = useId();
  const [sActive, setSActive] = useState<string>();
  useEffect(() => onSearchChange?.(sQ, sOpen), [sQ, sOpen, onSearchChange]);
  useEffect(() => {
    if (!sOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sOpen]);
  const closeSearch = () => {
    setSOpen(false);
    setSQ("");
  };
  const pickResult = (type: SearchResultType, id: string, entity: SearchEntity) => {
    setSRecent((r) => [{ type, entity }, ...r.filter((x) => !(x.type === type && x.entity.id === entity.id))].slice(0, 5));
    closeSearch();
    onSearchSelect?.(type, id, entity);
  };
  const showKbd = !sFocus && !sOpen && !sQ;
  // Minimal shows the right-hand toggle at 16px (CSS). The pixel-snapped glyph must be drawn at that size: drawn for 20px and scaled down, its rules land between pixels and antialias to grey.
  const minimal = useAppearanceStore((s) => s.theme) === "minimal";
  const minimalRightToggle = minimal && !leftToggle;
  const toggleBtn = onToggleSidebar ? (
    <IconButton
      name={leftToggle ? "panel-left" : "panel-right"}
      label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      tooltip={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      tooltipSide={leftToggle ? "bottom-start" : "bottom-end"}
      variant="chrome"
      className={leftToggle ? "td-topnav-sbtoggle-left" : undefined}
      iconSize={minimalRightToggle ? 16 : undefined}
      aria-expanded={sidebarOpen}
      onClick={() => onToggleSidebar(!sidebarOpen)}
    />
  ) : null;

  const hasUserMenu = !!(onOpenSettings || onOpenAccount || onLogout || onLogin || onCreateAccount);
  const avatarEl = user ? signedIn ? <Avatar name={user.name} src={user.src} color={user.avatarColor} size={28} /> : <GuestAvatar size={28} tone="chrome" /> : null;

  return (
    <header className={["td-topnav", className ?? ""].join(" ").trim()} style={style} data-sidebar-side={side}>
      {leftToggle ? toggleBtn : null}
      <NavbarTitle key={`${titleKey ?? title}:${!!onTitleChange}`} title={title} onTitleChange={onTitleChange} />
      <div className="td-topnav-spacer" />
      {children ?? null}
      {status ? <div className="td-topnav-status">{status}</div> : null}
      {search ? (
        <div
          ref={searchWrapRef}
          className="td-topnav-search"
          data-open={searchSources && sOpen ? "true" : undefined}
          onFocus={() => {
            setSFocus(true);
            if (searchSources) setSOpen(true);
          }}
          onBlur={() => setSFocus(false)}
          onClick={searchSources ? (e) => (e.target as HTMLElement).tagName === "INPUT" && setSOpen(true) : undefined}
        >
          <TextField
            dark
            icon="search"
            // Minimal shows the search glyph at 14px (CSS); its pixel-snapped ring is drawn at that size
            iconSize={minimal ? 14 : 16}
            placeholder={searchPlaceholder}
            value={searchSources ? sQ : undefined}
            onChange={(e) => {
              if (searchSources) {
                setSQ(e.target.value);
                setSOpen(true);
              }
            }}
            aria-label="Search"
            {...(searchSources ? { role: "combobox", "aria-autocomplete": "list", "aria-expanded": !!sActive, "aria-controls": sActive ? sListId : undefined, "aria-activedescendant": sActive } as const : null)}
            className="td-topnav-field"
            data-kbd={showKbd ? (IS_MAC ? "short" : "long") : undefined}
          />
          {showKbd ? (
            <span className="td-topnav-kbd" aria-hidden>
              {kbdHint}
            </span>
          ) : null}
          {searchSources && sOpen ? <SearchDropdown id={sListId} onActiveChange={setSActive} query={sQ} sources={searchSources} status={searchStatus} recent={sRecent} onSelect={pickResult} onClose={closeSearch} /> : null}
        </div>
      ) : null}
      {onCreate ? (
        <div className="td-topnav-create">
          <MenuPopover
            label="Create"
            tier="nav"
            placement="bottom-end"
            offset={10}
            minWidth={null}
            className="td-create-menu"
            trigger={
              <button type="button" className="td-topnav-plus td-tooltip" aria-label="Create" data-tip="Create">
                <Icon name="plus" size={20} />
              </button>
            }
          >
            {CREATE_ITEMS.map(([kind, icon, label]) => (
              <MenuItem key={kind} icon={icon} onSelect={() => onCreate(kind)}>
                {label}
              </MenuItem>
            ))}
          </MenuPopover>
        </div>
      ) : null}
      {user || (toggleBtn && !leftToggle) ? (
        <div className="td-topnav-user">
          {user ? (
            hasUserMenu ? (
              <MenuPopover
                label="Account"
                tier="nav"
                placement="bottom-end"
                offset={10}
                minWidth={null}
                className="td-user-menu"
                trigger={
                  <button type="button" className="td-topnav-avatarbtn td-tooltip" data-tip="Account" data-tip-side="bottom-end" aria-label={signedIn ? `Account: ${user.name}` : "Account (not signed in)"}>
                    {avatarEl}
                  </button>
                }
              >
                {/* Signed in, the rows start at once: the account row carries the owner's name. Signed out, a header
                    says so above the rows. */}
                {signedIn ? null : (
                  <>
                    <div className="td-user-menu-id td-user-menu-idrow">
                      <GuestAvatar size={36} tone="card" />
                      <span className="td-user-menu-idtext">
                        <span className="td-user-menu-name">Not signed in</span>
                        <span className="td-user-menu-email">Log in to sync your work</span>
                      </span>
                    </div>
                    <MenuDivider />
                  </>
                )}
                {onOpenAccount ? (
                  <MenuItem icon="user" onSelect={onOpenAccount}>
                    {accountLabel ?? "Account"}
                  </MenuItem>
                ) : null}
                {onOpenSettings ? (
                  <MenuItem icon="settings" onSelect={onOpenSettings}>
                    Settings
                  </MenuItem>
                ) : null}
                {signedIn ? (
                  onLogout ? (
                    <MenuItem icon="log-out" onSelect={onLogout}>
                      Log out
                    </MenuItem>
                  ) : null
                ) : onLogin ? (
                  <MenuItem icon="log-in" onSelect={onLogin}>
                    Log in
                  </MenuItem>
                ) : null}
                {!signedIn && onCreateAccount ? <MenuItem icon="user" onSelect={onCreateAccount}>Create account</MenuItem> : null}
              </MenuPopover>
            ) : (
              avatarEl
            )
          ) : null}
          {leftToggle ? null : toggleBtn}
        </div>
      ) : null}
    </header>
  );
}
