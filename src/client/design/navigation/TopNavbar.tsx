// TopNavbar — the always-visible chrome bar: title (click to rename) left; hoisted SubNavbar,
// connection pill, search with the ⌘K hint and its dropdown, the + create menu, the avatar menu and
// the sidebar toggle right (the toggle leads the bar when the sidebar docks left).
// Spec: DESIGN.md › Top navbar, Responsive.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useAppearance } from "../core/appearance";
import { Avatar } from "../core/Avatar";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { MenuDivider, MenuItem, MenuPopover } from "../core/Menu";
import { IS_MAC } from "../core/shortcuts";
import { TextField } from "../core/TextField";
import { SearchDropdown, type SearchEntity, type SearchRecent, type SearchResultType, type SearchSources } from "./SearchDropdown";
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
  nickname?: string;
  email?: string;
  src?: string;
  /** "var(--label-teal)" */
  avatarColor?: string;
}

export interface TopNavbarProps {
  title: string;
  /** When set, the title is click-to-rename */
  onTitleChange?: (title: string) => void;
  search?: boolean;
  /** @default "Search" */
  searchPlaceholder?: string;
  searchSources?: SearchSources;
  onSearchSelect?: (type: SearchResultType, id: string, entity: SearchEntity) => void;
  /** Renders the + create menu; the host decides where the kind lands */
  onCreate?: (kind: CreateKind) => void;
  user?: TopNavbarUser;
  /** @default true */
  signedIn?: boolean;
  onOpenSettings?: () => void;
  onOpenAccount?: () => void;
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

function GuestAvatar({ size, tone }: { size: number; tone: "chrome" | "card" }) {
  return (
    <span aria-hidden className="td-topnav-guest" data-tone={tone} style={{ width: size, height: size }}>
      <Icon name="user" size={Math.round(size * 0.6)} />
    </span>
  );
}

export function TopNavbar({
  title,
  onTitleChange,
  search,
  searchPlaceholder = "Search",
  searchSources,
  onSearchSelect,
  onCreate,
  user,
  signedIn = true,
  onOpenSettings,
  onOpenAccount,
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
  const ap = useAppearance();
  const side = sidebarSide ?? (ap.sidebarLeft ? "left" : "right");
  const leftToggle = side === "left";
  const kbdHint = IS_MAC ? "⌘K" : "Ctrl+K";

  // Search field + dropdown
  const [sOpen, setSOpen] = useState(false);
  const [sQ, setSQ] = useState("");
  const [sFocus, setSFocus] = useState(false);
  const [sRecent, setSRecent] = useState<SearchRecent[]>([]);
  const searchWrapRef = useRef<HTMLDivElement>(null);
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

  // Title rename
  const [editing, setEditing] = useState(false);
  const commitTitle = (value: string) => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== title) onTitleChange?.(v);
  };
  const titleEl = editing ? (
    <input
      className="td-topnav-title"
      defaultValue={title}
      autoFocus
      aria-label="Project name"
      onFocus={(e) => {
        e.target.setSelectionRange(0, e.target.value.length, "backward");
        e.target.scrollLeft = 0;
      }}
      onBlur={(e) => commitTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          e.currentTarget.value = title;
          e.currentTarget.blur();
        }
      }}
    />
  ) : onTitleChange ? (
    <span
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
      <span className="td-topnav-title-txt">{title}</span>
      <span className="td-topnav-title-pen" aria-hidden>
        <Icon name="pencil" size={14} />
      </span>
    </span>
  ) : (
    <span className="td-topnav-title">{title}</span>
  );

  const toggleBtn = onToggleSidebar ? (
    <IconButton
      name={leftToggle ? "panel-left" : "panel-right"}
      label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      tooltip={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      tooltipSide={leftToggle ? "bottom-start" : "bottom-end"}
      variant="chrome"
      className={leftToggle ? "td-topnav-sbtoggle-left" : undefined}
      aria-expanded={sidebarOpen}
      onClick={() => onToggleSidebar(!sidebarOpen)}
    />
  ) : null;

  const hasUserMenu = !!(onOpenSettings || onOpenAccount || onLogout || onLogin || onCreateAccount);
  const avatarEl = user ? signedIn ? <Avatar name={user.name} src={user.src} color={user.avatarColor} size={28} /> : <GuestAvatar size={28} tone="chrome" /> : null;

  return (
    <header className={["td-topnav", className ?? ""].join(" ").trim()} style={style} data-sidebar-side={side}>
      {leftToggle ? toggleBtn : null}
      {titleEl}
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
            placeholder={searchPlaceholder}
            value={searchSources ? sQ : undefined}
            onChange={(e) => {
              if (searchSources) {
                setSQ(e.target.value);
                setSOpen(true);
              }
            }}
            aria-label="Search"
            className="td-topnav-field"
            data-kbd={showKbd ? (IS_MAC ? "short" : "long") : undefined}
          />
          {showKbd ? (
            <span className="td-topnav-kbd" aria-hidden>
              {kbdHint}
            </span>
          ) : null}
          {searchSources && sOpen ? <SearchDropdown query={sQ} sources={searchSources} recent={sRecent} onSelect={pickResult} onClose={closeSearch} /> : null}
        </div>
      ) : null}
      {onCreate ? (
        <div className="td-topnav-create">
          <MenuPopover
            label="Create"
            tier="nav"
            placement="bottom-end"
            minWidth={212}
            trigger={
              <button type="button" className="td-topnav-plus td-tip" aria-label="Create" data-tip="Create">
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
                minWidth={264}
                trigger={
                  <button type="button" className="td-topnav-avatarbtn td-tip" data-tip="Account" data-tip-side="bottom-end" aria-label={signedIn ? `Account: ${user.name}` : "Account (not signed in)"}>
                    {avatarEl}
                  </button>
                }
              >
                {signedIn ? (
                  <MenuItem className="td-usermenu-id" onSelect={() => (onOpenAccount ?? onOpenSettings ?? onLogout)?.()}>
                    <span className="td-usermenu-idrow">
                      <Avatar name={user.name} src={user.src} color={user.avatarColor} size={36} />
                      <span className="td-usermenu-idtext">
                        <span className="td-usermenu-name">{user.nickname ?? user.name}</span>
                        {user.email ? <span className="td-usermenu-email">{user.email}</span> : null}
                      </span>
                    </span>
                  </MenuItem>
                ) : (
                  <div className="td-usermenu-id td-usermenu-idrow">
                    <GuestAvatar size={36} tone="card" />
                    <span className="td-usermenu-idtext">
                      <span className="td-usermenu-name">Not signed in</span>
                      <span className="td-usermenu-email">Log in to sync your work</span>
                    </span>
                  </div>
                )}
                <MenuDivider />
                {onOpenAccount ? (
                  <MenuItem icon="user" onSelect={onOpenAccount}>
                    Account
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
