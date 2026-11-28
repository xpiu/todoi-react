// Sidebar — the chrome rail below the TopNavbar: group sections with project rows (⋯ menu: Project
// settings, Rename, Change icon, Duplicate, Archive, Delete), then Projects / Project groups / Inbox
// nav rows. Docks right by default or left when the appearance store says so; collapses to width 0.
// Project rows accept item drags (application/x-todoi-item) to file Inbox items. Below the desktop class
// (`modal`) the same rail is a sheet on Base UI Dialog. Phone: modal and full height; focus stays inside,
// Escape, the scrim or × closes it, focus returns to the toggle, and the page behind neither scrolls nor
// responds. Tablet: the sheet and its scrim cover the body row only, so the chrome rows above stay in
// reach; the dialog is not modal there, and the top-bar toggle, Escape or the scrim closes it.
// Desktop: group headers, nav rows and project rows reorder by drag and drop (Alt+↑ / Alt+↓ on a focused row); a
// project lands only inside a group, and in another group only where `canMoveProject` allows it.
// Spec: DESIGN.md › Sidebar, Sidebar reordering.
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";

import { useProjectIcons, useThemePreference } from "../core/appearance";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { IconPicker } from "../core/IconPicker";
import { MenuDivider, MenuItem, MenuPopover } from "../core/Menu";
import { PortalContainerContext } from "../core/portalContainer";
import { useToastHost } from "../core/ToastPortal";
import { orderIds } from "./sidebarArrangement";
import "./Sidebar.css";

export const ITEM_DRAG_TYPE = "application/x-todoi-item";
const hasItemDrag = (e: DragEvent) => Array.prototype.includes.call(e.dataTransfer?.types ?? [], ITEM_DRAG_TYPE);
/** A sidebar row drag (reordering): kept apart from item drags so neither reads as the other */
const SB_DRAG_TYPE = "application/x-todoi-sidebar";
const MOVE_KEYS = "Alt+ArrowUp Alt+ArrowDown";
/** The row being dragged, and where it would land: an index in the top-level order, or in a group's projects */
type SbDrag = { kind: "top" | "project"; id: string };
type SbInsert = { index: number; gid?: string } | null;

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
  /** Top-level order: group ids and nav ids in one list (an id it lacks lands after its default predecessor) */
  order?: string[];
  /** Desktop: group headers and nav rows reorder (drag and drop, Alt+↑↓); called with the whole new top-level order */
  onReorder?: (order: string[]) => void;
  /** Desktop: a project moves to `index` (counted without it) in `groupId`, its own group or another one */
  onProjectMove?: (projectId: string, groupId: string, index: number) => void;
  /** Whether a project may enter another group (its own group always takes it) @default every group */
  canMoveProject?: (projectId: string, groupId: string) => boolean;
  /** @default "Drop on a project to file it" */
  dropHint?: string;
  /** true fully hides the sidebar (animated width to 0; a closed sheet when `modal`) */
  collapsed?: boolean;
  /** Phone and tablet: a sheet over the page instead of a rail beside it; full height and modal unless `contained` */
  modal?: boolean;
  /** With `modal` (the app sets it on tablets): sheet and scrim cover only the element the Sidebar is rendered in, which must be positioned, and the dialog is not modal, so the chrome rows above that element stay usable */
  contained?: boolean;
  /** The sheet asks to close (Escape, the scrim, its close button) */
  onClose?: () => void;
  /** @default 264 (max) */
  width?: number;
  side?: "left" | "right";
  style?: CSSProperties;
  className?: string;
}

export function Sidebar({ groups = [], navItems = DEFAULT_NAV, activeId, onSelect, onAdd, onNavAdd, onProjectRename, onProjectIconChange, onProjectAction, onItemDrop, order, onReorder, onProjectMove, canMoveProject, dropHint = "Drop on a project to file it", collapsed = false, modal = false, contained = false, onClose, width = 264, side, style, className }: SidebarProps) {
  width = Math.min(width, 264);
  // Contained: the sheet opens inside a host that covers the Sidebar's own parent, under the chrome rows.
  const under = modal && contained;
  const [underEl, setUnderEl] = useState<HTMLElement | null>(null);
  // The sheet's popup hosts its menus, and on phones the app toast too, so both stay usable while the page is inert.
  const [sheetEl, setSheetEl] = useState<HTMLElement | null>(null);
  useToastHost(modal && !under && !collapsed ? sheetEl : null);
  const sidebarLeft = useThemePreference("sidebarLeft");
  const projectIcons = useProjectIcons();
  const dock = side ?? (sidebarLeft ? "left" : "right");
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

  // ── Reordering (desktop) ──
  // Handlers read the row from data-sb-* attributes: data-sb-id (the row), data-sb-gid (a project's group),
  // data-sb-kind ("top" | "project") on the drag sources and on the buttons that take Alt+↑↓.
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const navById = new Map(navItems.map((n) => [n.id, n]));
  const topIds = orderIds(order, [...groups.map((g) => g.id), ...navItems.map((n) => n.id)]);
  const canTop = !!onReorder && !modal;
  const canProj = !!onProjectMove && !modal;
  const groupOf = (pid: string) => groups.find((g) => g.projects.some((p) => p.id === pid));
  const mayEnter = (pid: string, gid: string) => groupOf(pid)?.id === gid || (canMoveProject?.(pid, gid) ?? true);
  const sbRef = useRef<SbDrag | null>(null);
  const insRef = useRef<SbInsert>(null);
  const [sb, setSb] = useState<SbDrag | null>(null);
  const [ins, setInsState] = useState<SbInsert>(null);
  const setIns = (v: SbInsert) => {
    const a = insRef.current;
    if (a === v || (a && v && a.gid === v.gid && a.index === v.index)) return;
    insRef.current = v;
    setInsState(v);
  };
  const endSb = () => {
    sbRef.current = null;
    insRef.current = null;
    setSb(null);
    setInsState(null);
    clearDwell();
  };
  const data = (e: { currentTarget: EventTarget }) => (e.currentTarget as HTMLElement).dataset;
  const lowerHalf = (e: DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2 ? 1 : 0;
  };
  /** Dropping where it already is changes nothing: no landing place */
  const projNoop = (id: string, gid: string, i: number) => {
    const from = groupById.get(gid)!.projects.findIndex((p) => p.id === id);
    return from >= 0 && (i === from || i === from + 1);
  };
  /** Over a group block or a nav row: a top-level drag lands before or after it */
  const onTopOver = (e: DragEvent) => {
    const d = sbRef.current;
    if (!d) return;
    // A nav row takes no project (a group block leaves it to its header and rows)
    if (d.kind === "project") return groupById.has(data(e).sbId ?? "") ? undefined : setIns(null);
    const i = topIds.indexOf(data(e).sbId!) + lowerHalf(e);
    const from = topIds.indexOf(d.id);
    setIns(i === from || i === from + 1 ? null : { index: i });
  };
  /** Over a project row: a project lands before or after it, if it may enter that group */
  const onProjectOver = (e: DragEvent) => {
    const d = sbRef.current;
    if (d?.kind !== "project") return;
    clearDwell();
    const { sbId, sbGid } = data(e);
    const i = groupById.get(sbGid!)!.projects.findIndex((p) => p.id === sbId) + lowerHalf(e);
    setIns(!mayEnter(d.id, sbGid!) || projNoop(d.id, sbGid!, i) ? null : { gid: sbGid, index: i });
  };
  // A group header takes a project at the top of an open group, at the end of a closed one (which springs open after a rest, like an item drag)
  const onHeadOver = (e: DragEvent) => {
    const g = groupById.get(data(e).sbGid!)!;
    const open = !closedGroups[g.id];
    if (hasItemDrag(e)) {
      if (!open) armOpen(g.id);
      return;
    }
    const d = sbRef.current;
    if (d?.kind !== "project") return;
    if (!mayEnter(d.id, g.id)) return setIns(null);
    if (!open) armOpen(g.id);
    const i = open ? 0 : g.projects.length;
    setIns(projNoop(d.id, g.id, i) ? null : { gid: g.id, index: i });
  };
  const onSbDragStart = (e: DragEvent) => {
    const { sbKind, sbId } = data(e);
    if (!sbKind || !sbId) return;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(SB_DRAG_TYPE, sbId);
    const d: SbDrag = { kind: sbKind as SbDrag["kind"], id: sbId };
    sbRef.current = d;
    // After the browser took its drag image: the source dims only now
    setTimeout(() => sbRef.current?.id === sbId && setSb(d), 0);
  };
  const onInnerDragOver = (e: DragEvent) => {
    if (sbRef.current && insRef.current) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };
  const onInnerDrop = (e: DragEvent) => {
    const d = sbRef.current, t = insRef.current;
    if (!d || !t) return;
    e.preventDefault();
    endSb();
    if (d.kind === "top") {
      const from = topIds.indexOf(d.id);
      const next = topIds.filter((x) => x !== d.id);
      next.splice(t.index > from ? t.index - 1 : t.index, 0, d.id);
      onReorder?.(next);
    } else {
      const from = groupById.get(t.gid!)!.projects.findIndex((p) => p.id === d.id);
      onProjectMove?.(d.id, t.gid!, from >= 0 && t.index > from ? t.index - 1 : t.index);
    }
  };
  // The landing line is drawn before the row it lands in front of (after the last row only at the very end): one gap, one line
  const topIns = sb?.kind === "top" && ins ? (ins.index < topIds.length ? { id: topIds[ins.index]!, pos: "before" } : { id: topIds[topIds.length - 1]!, pos: "after" }) : null;
  const topInsAttr = (id: string) => (topIns?.id === id ? topIns.pos : undefined);
  const projIns = sb?.kind === "project" && ins ? ins : null;
  const projInsAttr = (g: SidebarGroup, i: number) => {
    if (projIns?.gid !== g.id) return undefined;
    return projIns.index === i ? "before" : projIns.index === g.projects.length && i === g.projects.length - 1 ? "after" : undefined;
  };
  // Keyboard twin of the drag: Alt+↑ / Alt+↓ moves the focused row one place; a project at the edge of its group steps
  // into the neighbouring group (where it may enter), so it is always inside one. Focus stays on the moved row.
  const focusAfter = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    asideRef.current?.querySelector<HTMLElement>(`[data-sb-id="${CSS.escape(id)}"] button`)?.focus();
  });
  const onMoveKey = (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const { sbKind, sbId: id, sbGid: gid } = data(e);
    if (!sbKind || !id) return;
    const up = e.key === "ArrowUp";
    e.preventDefault();
    if (sbKind === "top") {
      const i = topIds.indexOf(id), j = i + (up ? -1 : 1);
      if (j < 0 || j >= topIds.length) return;
      const next = topIds.slice();
      next.splice(i, 1);
      next.splice(j, 0, id);
      focusAfter.current = id;
      onReorder?.(next);
      return;
    }
    const ps = groupById.get(gid!)!.projects;
    const i = ps.findIndex((p) => p.id === id);
    if (up ? i > 0 : i < ps.length - 1) {
      focusAfter.current = id;
      onProjectMove?.(id, gid!, i + (up ? -1 : 1));
      return;
    }
    const gids = topIds.filter((x) => groupById.has(x));
    const ng = groupById.get(gids[gids.indexOf(gid!) + (up ? -1 : 1)]!);
    if (!ng || !mayEnter(id, ng.id)) return;
    setClosedGroups((o) => ({ ...o, [ng.id]: false }));
    focusAfter.current = id;
    onProjectMove?.(id, ng.id, up ? ng.projects.length : 0);
  };
  /** Drag-source props of a movable row (its rowwrap, or a group's header) */
  const sourceProps = (kind: SbDrag["kind"], id: string) => ((kind === "project" ? canProj : canTop) ? { draggable: true, "data-sb-kind": kind, "data-sb-id": id, onDragStart: onSbDragStart, onDragEnd: endSb } : null);
  /** Alt+↑↓ on a movable row's button */
  const keyProps = (kind: SbDrag["kind"], id: string, gid?: string) => ((kind === "project" ? canProj : canTop) ? { "aria-keyshortcuts": MOVE_KEYS, "data-sb-kind": kind, "data-sb-id": id, "data-sb-gid": gid, onKeyDown: onMoveKey } : null);

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

  const projectRow = (p: SidebarProject, g: SidebarGroup, index: number) => {
    const current = p.id === activeId;
    const renaming = p.id === renamingId;
    const canDrop = !!onItemDrop;
    const btn = renaming ? (
      <div className="td-sidebar-row" data-static="true">
        {projectIcons ? <Icon name={p.icon ?? "kanban"} size={16} color={p.color} /> : null}
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
      <button type="button" className="td-sidebar-row" tabIndex={collapsed ? -1 : undefined} data-droptarget={canDrop && dragging ? "true" : undefined} data-drop={canDrop && dropId === p.id ? "true" : undefined} aria-current={current ? "true" : undefined} onClick={() => onSelect?.(p.id)} {...keyProps("project", p.id, g.id)}>
        <span className="td-sidebar-iconwrap">
          <Icon name={p.icon ?? "kanban"} size={16} color={p.color} />
        </span>
        <span className="td-sidebar-label">{p.name}</span>
        {p.count != null ? <span className="td-sidebar-count">{p.count}</span> : null}
      </button>
    );
    return (
      <div key={p.id} className="td-sidebar-rowwrap" data-current={current ? "true" : undefined} {...(canDrop && !renaming ? dropProps(p) : null)} {...(renaming ? null : sourceProps("project", p.id))} data-sb-gid={g.id} data-sb-self={sb?.id === p.id ? "true" : undefined} data-sb-insert={projInsAttr(g, index)} onDragOver={canDrop || canProj ? (e) => {
        if (canDrop && !renaming) dropProps(p).onDragOver(e);
        if (canProj) onProjectOver(e);
      } : undefined}>
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
    const label = it.count == null ? it.label : `${it.label} ${it.count}`;
    const btn = (
      <button type="button" className={"td-sidebar-row" + (it.tip ? " td-tooltip" : "")} tabIndex={collapsed ? -1 : undefined} {...keyProps("top", it.id)} data-tip={it.tip} aria-label={it.tooltip ? `${label} — ${it.tooltip}` : undefined} aria-current={current ? "true" : undefined} onClick={() => onSelect?.(it.id)}>
        <span className="td-sidebar-iconwrap">
          <Icon name={it.icon} size={16} />
        </span>
        <span className="td-sidebar-label">{it.label}</span>
        {/* The space keeps "Inbox 7" two words in the name check (the flex row drops it visually). */}
        {it.count != null ? <> <span className="td-sidebar-count">{it.count}</span></> : null}
      </button>
    );
    // A project dragged over a nav row has no landing place there (onTopOver)
    const dnd = { ...sourceProps("top", it.id), "data-sb-self": sb?.id === it.id ? "true" : undefined, "data-sb-insert": topInsAttr(it.id), onDragOver: canTop || canProj ? onTopOver : undefined };
    if (!hasAdd) return <div key={it.id} className="td-sidebar-rowwrap" {...dnd}>{btn}</div>;
    return (
      <div key={it.id} className="td-sidebar-rowwrap" data-current={current ? "true" : undefined} {...dnd}>
        {btn}
        <IconButton name="plus" label={it.addLabel ?? `Add to ${it.label}`} tooltip={it.addTip ?? `Add to ${it.label}`} tooltipSide="bottom-end" size={24} iconSize={16} variant="chrome" className="td-sidebar-add" tabIndex={collapsed ? -1 : undefined} onClick={() => onNavAdd!(it.id)} />
      </div>
    );
  };

  const cls = ["td-sidebar", dock === "left" ? "td-sidebar-left" : "td-sidebar-right", className ?? ""].filter(Boolean).join(" ");
  const asideDnd =
    onItemDrop || canTop || canProj
      ? {
          onDragEnter: (e: DragEvent) => {
            if (onItemDrop && hasItemDrag(e)) setDragging(true);
          },
          onDragOver: (e: DragEvent) => {
            if (onItemDrop && hasItemDrag(e) && !dragging) setDragging(true);
          },
          onDragLeave: (e: DragEvent) => {
            if (asideRef.current && e.relatedTarget && asideRef.current.contains(e.relatedTarget as Node)) return;
            if (sbRef.current) {
              setIns(null);
              clearDwell();
            } else endDrag();
          },
          onDrop: () => {
            if (!sbRef.current) endDrag();
          },
          onDragEnd: () => {
            endDrag();
            endSb();
          },
        }
      : null;
  // Top-level entries in sidebar order; neighbouring nav rows share one <nav> block
  const blocks: Array<{ group: SidebarGroup } | { nav: SidebarNavItem[] }> = [];
  for (const id of topIds) {
    const g = groupById.get(id);
    if (g) {
      blocks.push({ group: g });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && "nav" in last) last.nav.push(navById.get(id)!);
    else blocks.push({ nav: [navById.get(id)!] });
  }
  const inner = (
    <>
      <div className="td-sidebar-inner" style={{ width }} onDragOver={canTop || canProj ? onInnerDragOver : undefined} onDrop={canTop || canProj ? onInnerDrop : undefined}>
        {blocks.map((b) => {
          if ("nav" in b) return <nav key={`nav-${b.nav[0]!.id}`} className="td-sidebar-nav">{b.nav.map(navRow)}</nav>;
          const g = b.group;
          const open = !closedGroups[g.id];
          // A project over a closed or empty group rings the header instead of drawing a line
          const headDrop = projIns?.gid === g.id && (!open || !g.projects.length);
          return (
            <div key={g.id} className="td-sidebar-group" data-sb-id={canTop ? g.id : undefined} data-sb-self={sb?.id === g.id ? "true" : undefined} data-sb-insert={topInsAttr(g.id)} onDragOver={canTop ? onTopOver : undefined}>
              <div className="td-sidebar-head" data-sb-drop={headDrop ? "true" : undefined} {...sourceProps("top", g.id)} data-sb-gid={g.id} onDragOver={onItemDrop || canProj ? onHeadOver : undefined} onDragLeave={onItemDrop || canProj ? clearDwell : undefined}>
                <button type="button" className="td-sidebar-headbtn" aria-expanded={open} tabIndex={collapsed ? -1 : undefined} onClick={() => setClosedGroups((o) => ({ ...o, [g.id]: open }))} {...keyProps("top", g.id)}>
                  <Icon name="chevron-down" size={16} className="td-sidebar-chevron" data-open={String(open)} />
                  <span className="td-sidebar-label">{g.name}</span>
                </button>
                {onAdd ? <IconButton name="plus" label={`Add a project to ${g.name}`} tooltip="New project here" tooltipSide="bottom-end" size={24} iconSize={16} variant="chrome" tabIndex={collapsed ? -1 : undefined} onClick={() => onAdd(g.id)} /> : null}
              </div>
              {open ? g.projects.map((p, i) => projectRow(p, g, i)) : null}
            </div>
          );
        })}
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
      <>
        {under ? <div ref={setUnderEl} className="td-sidebar-under" /> : null}
        {/* Under the chrome rows the dialog is not modal: the bars keep working, a press on them leaves the
            sheet open, and only the scrim (its own click), Escape and the host's toggle close it. */}
        <BaseDialog.Root open={!collapsed} modal={!under} disablePointerDismissal={under} onOpenChange={(open) => !open && onClose?.()}>
          {/* While the host is not mounted yet its container is null, and the portal waits for it. */}
          <BaseDialog.Portal container={under ? underEl : undefined}>
            <BaseDialog.Backdrop className="td-sidebar-scrim" onClick={under ? () => onClose?.() : undefined} />
            <BaseDialog.Popup ref={setSheetEl} className={cls + " td-sidebar-sheet"} aria-label="Sidebar" style={{ width, ...style }} {...asideDnd}>
              <PortalContainerContext value={sheetEl}>
                {under ? null : (
                  <div className="td-sidebar-sheethead">
                    <IconButton name="x" label="Hide sidebar" size={32} iconSize={18} variant="chrome" onClick={() => onClose?.()} />
                  </div>
                )}
                <div className="td-sidebar-sheetbody">{inner}</div>
              </PortalContainerContext>
            </BaseDialog.Popup>
          </BaseDialog.Portal>
        </BaseDialog.Root>
      </>
    );
  }
  return (
    <aside ref={asideRef} className={cls} data-hidden={String(!!collapsed)} data-dragging={dragging || sb?.kind === "project" ? "true" : undefined} aria-hidden={collapsed || undefined} style={{ width: collapsed ? 0 : width, ...style }} aria-label="Sidebar" {...asideDnd}>
      {inner}
    </aside>
  );
}

function ProjectMenu({ project, close, onRename, onIconChange, onAction }: { project: SidebarProject; close: () => void; onRename: () => void; onIconChange?: SidebarProps["onProjectIconChange"]; onAction?: SidebarProps["onProjectAction"] }) {
  const [picking, setPicking] = useState(false);
  // Minimal shows no project glyphs, so it offers no "Change icon" either.
  const projectIcons = useProjectIcons();
  if (picking && projectIcons) {
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
      {projectIcons ? (
        <MenuItem icon="shapes" drill onSelect={() => setPicking(true)}>
          Change icon
        </MenuItem>
      ) : null}
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
