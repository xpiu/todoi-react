// Sidebar — the chrome rail below the TopNavbar: group sections with project rows (⋯ menu: Project
// settings, Rename, Change icon, Duplicate, Archive, Delete), then Projects / Project groups / Inbox
// nav rows. Docks right by default or left when the appearance store says so; collapses to width 0.
// Project rows accept item drags (application/x-todoi-item) to file Inbox items. Below the desktop class
// (`modal`) the same rail is a modal sheet on Base UI Dialog: focus stays inside, Escape or the scrim
// closes it, focus returns to the toggle, and the page behind neither scrolls nor responds.
// Spec: DESIGN.md › Sidebar.
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";

import { useAppearance } from "../core/appearance";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { IconPicker } from "../core/IconPicker";
import { MenuDivider, MenuItem, MenuPopover } from "../core/Menu";
import { PortalContainerContext } from "../core/portalContainer";
import { useToastHost } from "../core/ToastPortal";
import "./Sidebar.css";

export const ITEM_DRAG_TYPE = "application/x-todoi-item";
const hasItemDrag = (e: DragEvent) => Array.prototype.includes.call(e.dataTransfer?.types ?? [], ITEM_DRAG_TYPE);

export interface SidebarProject {
  id: string;
  name: string;
  icon?: IconName;
  /** CSS colour for the glyph, e.g. "var(--label-orange)" */
  color?: string;
  count?: number;
}
export interface SidebarGroup {
  id: string;
  name: string;
  projects: SidebarProject[];
}
export interface SidebarNavItem {
  id: string;
  label: string;
  icon: IconName;
  addable?: boolean;
  addLabel?: string;
  addTip?: string;
  /** 2–4 word styled hint under the row */
  tip?: string;
  /** Longer description, aria only */
  tooltip?: string;
  /** Unread count: renders the dot on the icon */
  unread?: number;
  count?: number;
}

export const DEFAULT_NAV: SidebarNavItem[] = [
  { id: "projects", label: "Projects", icon: "folder", addable: true, addLabel: "Add a project to the last-active project group", addTip: "New project", tip: "All projects", tooltip: "All projects across groups" },
  { id: "groups", label: "Project groups", icon: "folders", addable: true, addLabel: "Add a project group", addTip: "New project group", tip: "Groups and totals", tooltip: "All project groups with item totals and completion" },
  { id: "inbox", label: "Inbox", icon: "inbox", addable: true, addLabel: "Add an item to the Inbox", addTip: "Add to Inbox", tip: "Items without a project", tooltip: "Open the Inbox — the account-level list that catches items without a project or group yet" },
];

export type ProjectAction = "settings" | "duplicate" | "archive" | "delete";

export interface SidebarProps {
  groups?: SidebarGroup[];
  navItems?: SidebarNavItem[];
  /** id of the selected project or nav item */
  activeId?: string;
  onSelect?: (id: string) => void;
  /** + on a group header */
  onAdd?: (groupId: string) => void;
  /** trailing + on an addable nav row */
  onNavAdd?: (navId: string) => void;
  onProjectRename?: (projectId: string, name: string) => void;
  onProjectIconChange?: (projectId: string, icon: IconName | null) => void;
  onProjectAction?: (projectId: string, action: ProjectAction) => void;
  /** Makes project rows drop targets for dragged items */
  onItemDrop?: (projectId: string, itemId: string) => void;
  /** @default "Drop on a project to file it" */
  dropHint?: string;
  /** true fully hides the sidebar (animated width to 0; a closed sheet when `modal`) */
  collapsed?: boolean;
  /** Phone and tablet: a modal sheet over the page instead of a rail beside it */
  modal?: boolean;
  /** The sheet asks to close (Escape, the scrim, its close button) */
  onClose?: () => void;
  /** @default 264 (max) */
  width?: number;
  side?: "left" | "right";
  style?: CSSProperties;
  className?: string;
}

export function Sidebar({ groups = [], navItems = DEFAULT_NAV, activeId, onSelect, onAdd, onNavAdd, onProjectRename, onProjectIconChange, onProjectAction, onItemDrop, dropHint = "Drop on a project to file it", collapsed = false, modal = false, onClose, width = 264, side, style, className }: SidebarProps) {
  width = Math.min(width, 264);
  // The sheet's popup hosts its menus and the app toast, so both stay usable while the page is inert.
  const [sheetEl, setSheetEl] = useState<HTMLElement | null>(null);
  useToastHost(modal && !collapsed ? sheetEl : null);
  const ap = useAppearance();
  const dock = side ?? (ap.sidebarLeft ? "left" : "right");
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Rename replaces the row (and its ⋯ trigger), so the closing menu hands focus to the field instead.
  const renameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const asideRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dropId, setDropId] = useState<string | null>(null);
  // Spring-loaded groups: resting over a collapsed group header during a drag opens it. Re-arming the
  // same group keeps its timer; the effect cancels it on disarm, on another group and on unmount.
  const [dwellGid, setDwellGid] = useState<string | null>(null);
  useEffect(() => {
    if (!dwellGid) return;
    const t = setTimeout(() => {
      setClosedGroups((o) => ({ ...o, [dwellGid]: false }));
      setDwellGid(null);
    }, 550);
    return () => clearTimeout(t);
  }, [dwellGid]);
  const clearDwell = () => setDwellGid(null);
  const armOpen = (gid: string) => setDwellGid(gid);
  const endDrag = () => {
    setDragging(false);
    setDropId(null);
    clearDwell();
  };
  const editable = !!(onProjectRename || onProjectIconChange || onProjectAction);
  const commitRename = (p: SidebarProject) => {
    const v = draft.trim();
    setRenamingId(null);
    if (v && v !== p.name) onProjectRename?.(p.id, v);
  };
  const dropProps = (p: SidebarProject) => ({
    onDragEnter: (e: DragEvent) => {
      if (hasItemDrag(e)) {
        e.preventDefault();
        setDropId(p.id);
      }
    },
    onDragOver: (e: DragEvent) => {
      if (!hasItemDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      clearDwell();
      setDropId(p.id);
    },
    onDragLeave: (e: DragEvent) => {
      if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
      setDropId((x) => (x === p.id ? null : x));
    },
    onDrop: (e: DragEvent) => {
      if (!hasItemDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const id = e.dataTransfer.getData(ITEM_DRAG_TYPE) || e.dataTransfer.getData("text/plain");
      endDrag();
      if (id) onItemDrop?.(p.id, id);
    },
  });

  const projectRow = (p: SidebarProject) => {
    const current = p.id === activeId;
    const renaming = p.id === renamingId;
    const canDrop = !!onItemDrop;
    const btn = renaming ? (
      <div className="td-sidebar-row" data-static="true">
        <Icon name={p.icon ?? "kanban"} size={16} color={p.color} />
        <input
          ref={renameRef}
          className="td-sidebar-rename"
          autoFocus
          value={draft}
          aria-label={`Rename ${p.name}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitRename(p)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(p);
            else if (e.key === "Escape") {
              // Ends the rename only; the sidebar sheet stays open.
              e.stopPropagation();
              setRenamingId(null);
            }
          }}
        />
      </div>
    ) : (
      <button type="button" className="td-sidebar-row" tabIndex={collapsed ? -1 : undefined} data-droptarget={canDrop && dragging ? "true" : undefined} data-drop={canDrop && dropId === p.id ? "true" : undefined} aria-current={current ? "true" : undefined} onClick={() => onSelect?.(p.id)}>
        <span className="td-sidebar-iconwrap">
          <Icon name={p.icon ?? "kanban"} size={16} color={p.color} />
        </span>
        <span className="td-sidebar-label">{p.name}</span>
        {p.count != null ? <span className="td-sidebar-count">{p.count}</span> : null}
      </button>
    );
    return (
      <div key={p.id} className="td-sidebar-rowwrap" data-current={current ? "true" : undefined} {...(canDrop && !renaming ? dropProps(p) : null)}>
        {btn}
        {/* Stays mounted while renaming (trigger hidden) so the closing menu hands focus to the field. */}
        {editable ? (
          <MenuPopover label={`Settings for ${p.name}`} placement="bottom-end" minWidth={184} finalFocus={() => renameRef.current ?? true} trigger={<IconButton name="ellipsis" label={`Settings for ${p.name}`} tooltip="Project settings" tooltipSide="bottom-end" size={24} iconSize={16} variant="chrome" className="td-sidebar-more" hidden={renaming} tabIndex={collapsed ? -1 : undefined} />}>
            {(close) => <ProjectMenu project={p} close={close} onRename={() => { setDraft(p.name); setRenamingId(p.id); }} onIconChange={onProjectIconChange} onAction={onProjectAction} />}
          </MenuPopover>
        ) : null}
      </div>
    );
  };

  const navRow = (it: SidebarNavItem) => {
    const current = it.id === activeId;
    const hasAdd = !!(it.addable && onNavAdd);
    const btn = (
      <button type="button" className={"td-sidebar-row" + (it.tip ? " td-tip" : "")} tabIndex={collapsed ? -1 : undefined} data-tip={it.tip} aria-label={it.tooltip || it.unread ? [it.label, it.unread ? `${it.unread} unread` : null, it.tooltip].filter(Boolean).join(" — ") : undefined} aria-current={current ? "true" : undefined} onClick={() => onSelect?.(it.id)}>
        <span className="td-sidebar-iconwrap" data-unread={it.unread ? "true" : undefined}>
          <Icon name={it.icon} size={16} />
          {it.unread ? <span className="td-sidebar-dot" aria-hidden="true" /> : null}
        </span>
        <span className="td-sidebar-label">{it.label}</span>
        {it.count != null ? <span className="td-sidebar-count">{it.count}</span> : null}
      </button>
    );
    if (!hasAdd) return <div key={it.id} className="td-sidebar-rowwrap">{btn}</div>;
    return (
      <div key={it.id} className="td-sidebar-rowwrap" data-current={current ? "true" : undefined}>
        {btn}
        <IconButton name="plus" label={it.addLabel ?? `Add to ${it.label}`} tooltip={it.addTip ?? `Add to ${it.label}`} tooltipSide="bottom-end" size={24} iconSize={16} variant="chrome" className="td-sidebar-add" tabIndex={collapsed ? -1 : undefined} onClick={() => onNavAdd!(it.id)} />
      </div>
    );
  };

  const cls = ["td-sidebar", dock === "left" ? "td-sidebar-left" : "td-sidebar-right", className ?? ""].filter(Boolean).join(" ");
  const asideDnd = onItemDrop
    ? {
        onDragEnter: (e: DragEvent) => {
          if (hasItemDrag(e)) setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (hasItemDrag(e) && !dragging) setDragging(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (asideRef.current && e.relatedTarget && asideRef.current.contains(e.relatedTarget as Node)) return;
          endDrag();
        },
        onDrop: endDrag,
        onDragEnd: endDrag,
      }
    : null;
  const inner = (
    <>
      <div className="td-sidebar-inner" style={{ width }}>
        {groups.map((g) => {
          const open = !closedGroups[g.id];
          return (
            <div key={g.id} className="td-sidebar-group">
              <div
                className="td-sidebar-head"
                onDragOver={onItemDrop ? (e) => hasItemDrag(e) && !open && armOpen(g.id) : undefined}
                onDragLeave={onItemDrop ? clearDwell : undefined}
              >
                <button type="button" className="td-sidebar-headbtn" aria-expanded={open} tabIndex={collapsed ? -1 : undefined} onClick={() => setClosedGroups((o) => ({ ...o, [g.id]: open }))}>
                  <Icon name="chevron-down" size={16} className="td-sidebar-chev" data-open={String(open)} />
                  <span className="td-sidebar-label">{g.name}</span>
                </button>
                {onAdd ? <IconButton name="plus" label={`Add a project to ${g.name}`} tooltip="New project here" tooltipSide="bottom-end" size={24} iconSize={16} variant="chrome" tabIndex={collapsed ? -1 : undefined} onClick={() => onAdd(g.id)} /> : null}
              </div>
              {open ? g.projects.map(projectRow) : null}
            </div>
          );
        })}
        {navItems.length ? <nav className="td-sidebar-nav">{navItems.map(navRow)}</nav> : null}
      </div>
      {dragging && dropHint ? (
        <div className="td-sidebar-drophint" style={{ width }}>
          <Icon name="corner-down-right" size={14} />
          {dropHint}
        </div>
      ) : null}
    </>
  );
  if (modal) {
    return (
      <BaseDialog.Root open={!collapsed} onOpenChange={(open) => !open && onClose?.()}>
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="td-sidebar-scrim" />
          <BaseDialog.Popup ref={setSheetEl} className={cls + " td-sidebar-sheet"} aria-label="Sidebar" style={{ width, ...style }} {...asideDnd}>
            <PortalContainerContext.Provider value={sheetEl}>
              <div className="td-sidebar-sheethead">
                <IconButton name="x" label="Hide sidebar" size={32} iconSize={18} variant="chrome" onClick={() => onClose?.()} />
              </div>
              <div className="td-sidebar-sheetbody">{inner}</div>
            </PortalContainerContext.Provider>
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    );
  }
  return (
    <aside ref={asideRef} className={cls} data-hidden={String(!!collapsed)} data-dragging={dragging ? "true" : undefined} aria-hidden={collapsed || undefined} style={{ width: collapsed ? 0 : width, ...style }} aria-label="Sidebar" {...asideDnd}>
      {inner}
    </aside>
  );
}

function ProjectMenu({ project, close, onRename, onIconChange, onAction }: { project: SidebarProject; close: () => void; onRename: () => void; onIconChange?: SidebarProps["onProjectIconChange"]; onAction?: SidebarProps["onProjectAction"] }) {
  const [picking, setPicking] = useState(false);
  if (picking) {
    return (
      <IconPicker
        value={project.icon ?? null}
        autoIcon="kanban"
        onChange={(n) => {
          close();
          onIconChange?.(project.id, n);
        }}
      />
    );
  }
  return (
    <>
      <MenuItem icon="settings" onSelect={() => onAction?.(project.id, "settings")}>
        Project settings
      </MenuItem>
      <MenuItem icon="pencil" onSelect={onRename}>
        Rename
      </MenuItem>
      <MenuItem icon="shapes" drill onSelect={() => setPicking(true)}>
        Change icon
      </MenuItem>
      <MenuItem icon="copy" onSelect={() => onAction?.(project.id, "duplicate")}>
        Duplicate
      </MenuItem>
      <MenuDivider />
      <MenuItem icon="archive" onSelect={() => onAction?.(project.id, "archive")}>
        Archive
      </MenuItem>
      <MenuItem icon="trash-2" danger onSelect={() => onAction?.(project.id, "delete")}>
        Delete
      </MenuItem>
    </>
  );
}
