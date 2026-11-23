// SidebarOrder — the sidebar's arrangement as a list: a drag handle at the start of every row (pointer events, so a
// finger, a pen and a mouse all drag it) and Move up / Move down at its end. The touch twin of the Sidebar's drag and
// drop on the same contract (`order` / `onReorder` / `onProjectMove` / `canMoveProject`); Settings › Appearance ›
// Sidebar order. Rows follow the sidebar: a group, its projects indented under it, the nav rows. A project lands only
// inside a group, and in another group only where `canMoveProject` allows it.
// Spec: DESIGN.md › Sidebar reordering (Design: navigation/SidebarOrder).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { useProjectIcons } from "../core/appearance";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { DEFAULT_NAV, type SidebarGroup, type SidebarNavItem } from "./Sidebar";
import { orderIds } from "./sidebarArrangement";
import "../core/text.css";
import "./SidebarOrder.css";

export interface SidebarOrderProps {
  groups: SidebarGroup[];
  navItems?: SidebarNavItem[];
  order?: string[];
  onReorder?: (order: string[]) => void;
  onProjectMove?: (projectId: string, groupId: string, index: number) => void;
  /** Whether a project may enter another group (its own group always takes it) @default every group */
  canMoveProject?: (projectId: string, groupId: string) => boolean;
  "aria-label"?: string;
  style?: CSSProperties;
  className?: string;
}

interface Row {
  kind: "group" | "project" | "nav";
  key: string;
  id: string;
  /** A project's group */
  gid?: string;
  name: string;
  icon?: IconName;
  color?: string;
  up: boolean;
  down: boolean;
}
/** Where a drag would land: an index in the top-level order, or in a group's projects; `y` places the line */
type Landing = { index: number; gid?: string; y: number; indent?: boolean } | null;

const scrollParent = (el: HTMLElement | null): HTMLElement => {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement as HTMLElement;
};

export function SidebarOrder({ groups, navItems = DEFAULT_NAV, order, onReorder, onProjectMove, canMoveProject, "aria-label": ariaLabel = "Sidebar order", style, className }: SidebarOrderProps) {
  // Minimal shows no glyphs in the sidebar, so none here either
  const showIcons = useProjectIcons();
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const navById = new Map(navItems.map((n) => [n.id, n]));
  const topIds = orderIds(order, [...groups.map((g) => g.id), ...navItems.map((n) => n.id)]);
  const gids = topIds.filter((id) => groupById.has(id));
  const mayEnter = (pid: string, gid: string) => groups.find((g) => g.projects.some((p) => p.id === pid))?.id === gid || (canMoveProject?.(pid, gid) ?? true);
  const last = topIds.length - 1;
  const rows: Row[] = [];
  topIds.forEach((id, i) => {
    const g = groupById.get(id);
    if (!g) {
      const n = navById.get(id)!;
      rows.push({ kind: "nav", key: `t:${id}`, id, name: n.label, icon: n.icon, up: i > 0, down: i < last });
      return;
    }
    rows.push({ kind: "group", key: `t:${id}`, id, name: g.name, up: i > 0, down: i < last });
    const gi = gids.indexOf(id);
    const above = groupById.get(gids[gi - 1] ?? ""), below = groupById.get(gids[gi + 1] ?? "");
    g.projects.forEach((p, pi) =>
      rows.push({ kind: "project", key: `p:${p.id}`, id: p.id, gid: id, name: p.name, icon: p.icon ?? "kanban", color: p.color, up: pi > 0 || (!!above && mayEnter(p.id, above.id)), down: pi < g.projects.length - 1 || (!!below && mayEnter(p.id, below.id)) }),
    );
  });
  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  const [moved, setMoved] = useState<{ key: string; n: number } | null>(null);
  const [say, setSay] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const wash = (key: string) => setMoved((m) => ({ key, n: m ? m.n + 1 : 0 }));
  // The moved row keeps the focus on the button that moved it (the other one once that reached an end), so repeated taps or Enter keep moving it
  const focusAfter = useRef<{ key: string; up: boolean; t: number } | null>(null);
  useLayoutEffect(() => {
    const f = focusAfter.current;
    if (!f) return;
    if (performance.now() - f.t > 1000) {
      focusAfter.current = null;
      return;
    }
    const li = listRef.current?.querySelector<HTMLElement>(`[data-sbo-key="${CSS.escape(f.key)}"]`);
    const bs = li?.querySelectorAll<HTMLButtonElement>(".td-sbo-move");
    if (!bs?.length) return;
    const b = bs[f.up ? 0 : 1], o = bs[f.up ? 1 : 0];
    const t = b && b.getAttribute("aria-disabled") !== "true" ? b : o;
    if (t && document.activeElement !== t) t.focus();
  });

  /** `at`: the event's timeStamp (focus follows the row for a second after it) */
  const move = (r: Row, up: boolean, at: number) => {
    if (!(up ? r.up : r.down)) return;
    const dir = up ? "up" : "down";
    let msg: string;
    if (r.kind !== "project") {
      const i = topIds.indexOf(r.id), j = i + (up ? -1 : 1);
      const next = topIds.slice();
      next.splice(i, 1);
      next.splice(j, 0, r.id);
      onReorder?.(next);
      msg = `${r.name} moved ${dir}. ${j + 1} of ${next.length}.`;
    } else {
      const g = groupById.get(r.gid!)!;
      const i = g.projects.findIndex((p) => p.id === r.id);
      if (up ? i > 0 : i < g.projects.length - 1) {
        onProjectMove?.(r.id, r.gid!, i + (up ? -1 : 1));
        msg = `${r.name} moved ${dir}. ${i + (up ? 0 : 2)} of ${g.projects.length} in ${g.name}.`;
      } else {
        // At the edge of its group a project steps into the neighbouring group (end of the one above, top of the one below)
        const ng = groupById.get(gids[gids.indexOf(r.gid!) + (up ? -1 : 1)]!)!;
        onProjectMove?.(r.id, ng.id, up ? ng.projects.length : 0);
        msg = `${r.name} moved to ${ng.name}.`;
      }
    }
    wash(r.key);
    setSay(msg);
    focusAfter.current = { key: r.key, up, t: at };
  };

  // ── Handle drag: a group or nav row lands between top-level entries (a group takes its projects along); a project
  // lands only inside a group, between projects or on a group row (its first place) ──
  const drag = useRef<{ row: Row; y: number; raf: number; scroller: HTMLElement } | null>(null);
  const landing = useRef<Landing>(null);
  const [dragKey, setDragKey] = useState<{ key: string; kind: Row["kind"]; id: string } | null>(null);
  const [line, setLine] = useState<Landing>(null);
  const place = (y: number) => {
    const d = drag.current, l = listRef.current, box = rootRef.current;
    if (!d || !l || !box) return;
    const rects = [...l.children].map((n) => n.getBoundingClientRect());
    if (rects.length !== rows.length || !rects.length) return;
    const top0 = box.getBoundingClientRect().top + box.clientTop;
    const lineAt = (f: number) => (f < rects.length ? rects[f]!.top : rects[rects.length - 1]!.bottom) - top0;
    let k = rects.findIndex((r) => y < r.bottom);
    if (k < 0) k = rects.length - 1;
    const r = rows[k]!;
    let next: Landing = null;
    if (d.row.kind !== "project") {
      const tid = r.kind === "project" ? r.gid! : r.id;
      const first = rows.findIndex((x) => x.key === `t:${tid}`);
      let end = first;
      while (end + 1 < rows.length && rows[end + 1]!.kind === "project") end++;
      const after = y > (rects[first]!.top + rects[end]!.bottom) / 2;
      const i = topIds.indexOf(tid) + (after ? 1 : 0), from = topIds.indexOf(d.row.id);
      if (i !== from && i !== from + 1) next = { index: i, y: lineAt(after ? end + 1 : first) };
    } else if (r.kind !== "nav") {
      const gid = r.kind === "group" ? r.id : r.gid!;
      const head = rows.findIndex((x) => x.key === `t:${gid}`);
      const i = r.kind === "group" ? 0 : k - head - 1 + (y > (rects[k]!.top + rects[k]!.bottom) / 2 ? 1 : 0);
      const from = groupById.get(gid)!.projects.findIndex((p) => p.id === d.row.id);
      if (mayEnter(d.row.id, gid) && !(from >= 0 && (i === from || i === from + 1))) next = { gid, index: i, y: lineAt(head + 1 + i), indent: true };
    }
    const a = landing.current;
    if ((!a && !next) || (a && next && a.y === next.y && a.index === next.index && a.gid === next.gid)) return;
    landing.current = next;
    setLine(next);
  };
  // The page scrolls under the finger near its edges; the loop reads the latest `place`
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  });
  const rowOf = (e: PointerEvent) => rowByKey.get((e.currentTarget as HTMLElement).closest<HTMLElement>("[data-sbo-key]")?.dataset.sboKey ?? "");
  const onGripDown = (e: PointerEvent<HTMLSpanElement>) => {
    const r = rowOf(e);
    if (e.button || !r) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    const d = { row: r, y: e.clientY, raf: 0, scroller: scrollParent(rootRef.current) };
    // Stops when the drag ends, and once the list has unmounted (its ref is then null)
    const tick = () => {
      if (drag.current !== d || !rootRef.current) return;
      const s = d.scroller;
      const b = s === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : s.getBoundingClientRect();
      const v = d.y < b.top + 40 ? -8 : d.y > b.bottom - 40 ? 8 : 0;
      if (v) {
        s.scrollTop += v;
        placeRef.current(d.y);
      }
      d.raf = requestAnimationFrame(tick);
    };
    drag.current = d;
    d.raf = requestAnimationFrame(tick);
    setDragKey({ key: r.key, kind: r.kind, id: r.id });
  };
  const onGripMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.y = e.clientY;
    place(e.clientY);
  };
  const endGrip = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    const t = landing.current;
    drag.current = null;
    landing.current = null;
    setDragKey(null);
    setLine(null);
    if (!commit || !t) return;
    const r = d.row;
    if (r.kind !== "project") {
      const from = topIds.indexOf(r.id);
      const next = topIds.filter((x) => x !== r.id);
      const j = t.index > from ? t.index - 1 : t.index;
      next.splice(j, 0, r.id);
      onReorder?.(next);
      setSay(`${r.name} moved. ${j + 1} of ${next.length}.`);
    } else {
      const g = groupById.get(t.gid!)!;
      const from = g.projects.findIndex((p) => p.id === r.id);
      const j = from >= 0 && t.index > from ? t.index - 1 : t.index;
      onProjectMove?.(r.id, t.gid!, j);
      setSay(t.gid === r.gid ? `${r.name} moved. ${j + 1} of ${g.projects.length} in ${g.name}.` : `${r.name} moved to ${g.name}.`);
    }
    wash(r.key);
  };

  return (
    <div ref={rootRef} className={["td-sbo", className ?? ""].filter(Boolean).join(" ")} data-dragging={dragKey ? "true" : undefined} style={style}>
      <ol ref={listRef} className="td-sbo-list" aria-label={ariaLabel}>
        {rows.map((r) => {
          const can = r.kind === "project" ? !!onProjectMove : !!onReorder;
          const self = !!dragKey && (dragKey.key === r.key || (dragKey.kind === "group" && r.gid === dragKey.id));
          return (
            <li key={r.key} className="td-sbo-row" data-kind={r.kind} data-sbo-key={r.key} data-drag-self={self ? "true" : undefined} data-moved={moved?.key === r.key ? (moved.n % 2 ? "a" : "b") : undefined}>
              {/* Pointer only and hidden from assistive tech: the arrows are the keyboard and screen-reader path */}
              {can ? (
                <span className="td-sbo-grip" aria-hidden="true" onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={() => endGrip(true)} onPointerCancel={() => endGrip(false)} onLostPointerCapture={() => endGrip(false)}>
                  <Icon name="grip-vertical" size={16} />
                </span>
              ) : null}
              {showIcons && r.icon ? (
                <span className="td-sbo-glyph">
                  <Icon name={r.icon} size={16} color={r.color} />
                </span>
              ) : null}
              <span className="td-sbo-name">{r.name}</span>
              {can ? (
                <span className="td-sbo-moves">
                  {([true, false] as const).map((up) => (
                    <IconButton key={up ? "up" : "down"} name={up ? "arrow-up" : "arrow-down"} label={`Move ${r.name} ${up ? "up" : "down"}`} size={28} iconSize={16} className="td-sbo-move" aria-disabled={(up ? r.up : r.down) ? undefined : "true"} onClick={(e) => move(r, up, e.timeStamp)} />
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {line ? <span className="td-sbo-line" data-indent={line.indent ? "true" : undefined} style={{ top: line.y - 1 }} /> : null}
      <span className="td-sr-only" role="status">
        {say}
      </span>
    </div>
  );
}
