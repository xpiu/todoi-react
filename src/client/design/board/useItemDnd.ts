// Native HTML5 drag-and-drop for items across lists (board columns and list sections), with the
// spec's quiet cues: the source dims (td-drag-src), a 2px action-blue line marks the slot
// (td-drop-before / td-drop-after on the card or row under the pointer, td-drop-end on an empty tail).
// With `onDropSubitem` (List view) a subitem row drags too: between the rows of an item's subitems it
// reorders or moves there, and over another item's row it rings that row (td-drop-into) and moves under it.
// With `groups` (the grouped List view) a row drops on a whole group section instead: no slot line, the host draws
// the cue it reports (accept ring, or a refusal with its reason) and a drop changes the grouped field.
// The touch layer (useTouchDrag) reuses the same cue logic through `cueAt`. Spec: DESIGN.md › Drag & drop, Group by.
import { useEffect, useMemo, useRef, type DragEvent, type RefObject } from "react";

import { isReadOnly } from "../auth/GuestBar";
import { ITEM_DRAG_TYPE } from "../navigation/Sidebar";

export interface DropTarget {
  listId: string;
  /** Index among the destination's top-level items */
  position: number;
}

/** Where a dragged subitem lands: under `parentId`, at `index` among its subitems (null: at the end) */
export interface SubitemTarget {
  parentId: string;
  index: number | null;
}
/** Where a row lands in the grouped List view: a group section, which takes it (ok) or refuses with a reason */
export interface GroupTarget {
  groupId: string;
  fromGroupId: string | null;
  ok: boolean;
  reason?: string | null;
}
export type AnyDropTarget = DropTarget | SubitemTarget | GroupTarget;
export const isSubitemTarget = (t: AnyDropTarget): t is SubitemTarget => "parentId" in t;
export const isGroupTarget = (t: AnyDropTarget): t is GroupTarget => "groupId" in t;

/** Group mode (grouped List view): rows drop on group sections (data-group-id), never between rows */
export interface GroupDndOptions {
  /** Selector of a group section (carries data-group-id) */
  selector: string;
  /** Does the group take the item? A refusal with a null reason is silent */
  canDrop: (itemId: string, fromGroupId: string | null, toGroupId: string) => { ok: boolean; reason?: string | null };
  onDrop: (itemId: string, fromGroupId: string | null, toGroupId: string) => void;
  /** The group under the dragged row and its verdict; null when there is none. The host draws it (ListGroups `drop`) */
  onCue: (cue: { groupId: string; state: "accept" | "refuse"; note?: string } | null) => void;
  /** The drag ended over a group that refuses: its reason, to announce */
  onRefuse?: (reason: string) => void;
}

export interface ItemDndOptions {
  /** Selector of a draggable item inside the view (carries data-drag-id) @default "[data-drag-id]" */
  itemSelector?: string;
  /** Selector of a list container (carries data-list-id) */
  listSelector: string;
  /** Selector of the container holding a list's items (an empty list's end cue lives here) */
  cardsSelector: string;
  onDrop: (itemId: string, target: DropTarget) => void;
  /** Makes subitem rows (ids "parentId/subId") draggable; called with the subitem's own id */
  onDropSubitem?: (subitemId: string, target: SubitemTarget) => void;
  /** Group mode: replaces the list / slot targets (onDrop is then unused) */
  groups?: GroupDndOptions;
}

export interface ItemDnd {
  /** Spread onto the view root */
  rootProps: {
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Paint the slot cue for a point and return the target it means (null off any list). `source` is the lifted element
   * (the touch layer; native drags remember it from dragstart) */
  cueAt: (x: number, y: number, draggingId: string | null, source?: Element | null) => AnyDropTarget | null;
  /** Commit a drop the touch layer resolved through cueAt */
  drop: (draggingId: string, target: AnyDropTarget) => void;
  /** Clear every cue and the dimmed source */
  end: () => void;
}

const CUE_CLASSES = ["td-drop-before", "td-drop-after", "td-drop-end", "td-drop-into"];
const isSubitem = (id: string | null) => !id || id.includes("/");

export function clearCues(root: HTMLElement) {
  root.querySelectorAll(CUE_CLASSES.map((c) => "." + c).join(",")).forEach((n) => n.classList.remove(...CUE_CLASSES));
}

/** Resolve the drop target under a point and paint the cue. */
function resolve(root: HTMLElement, x: number, y: number, o: Required<Pick<ItemDndOptions, "itemSelector" | "listSelector" | "cardsSelector">>, draggingId: string | null): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  const list = el?.closest<HTMLElement>(o.listSelector);
  clearCues(root);
  if (!list || !root.contains(list)) return null;
  const listId = list.getAttribute("data-list-id");
  if (!listId) return null;
  const cards = [...list.querySelectorAll<HTMLElement>(o.itemSelector)].filter((c) => !isSubitem(c.getAttribute("data-drag-id")) && c.getAttribute("data-drag-id") !== draggingId);
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i]!.getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      cards[i]!.classList.add("td-drop-before");
      return { listId, position: i };
    }
  }
  const last = cards[cards.length - 1];
  if (last) last.classList.add("td-drop-after");
  else list.querySelector(o.cardsSelector)?.classList.add("td-drop-end");
  return { listId, position: cards.length };
}

/** A dragged subitem: between another item's subitems (or its own), or onto another item's row. */
function resolveSubitem(root: HTMLElement, x: number, y: number, itemSelector: string, draggingId: string): SubitemTarget | null {
  const [fromParent, subId] = draggingId.split("/") as [string, string];
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>(itemSelector);
  clearCues(root);
  const rowId = row && root.contains(row) ? row.getAttribute("data-drag-id") : null;
  if (!row || !rowId) return null;
  if (isSubitem(rowId)) {
    const parentId = rowId.split("/")[0]!;
    const subs = [...root.querySelectorAll<HTMLElement>(itemSelector)].filter((r) => r.getAttribute("data-drag-id")?.startsWith(parentId + "/"));
    const at = subs.indexOf(row);
    const r = row.getBoundingClientRect();
    const after = y >= r.top + r.height / 2;
    const index = at + (after ? 1 : 0);
    const from = parentId === fromParent ? subs.findIndex((s) => s.getAttribute("data-drag-id") === draggingId) : -1;
    if (from >= 0 && (index === from || index === from + 1)) return null;
    row.classList.add(after ? "td-drop-after" : "td-drop-before");
    // Counted without the dragged subitem
    return { parentId, index: from >= 0 && index > from ? index - 1 : index };
  }
  if (rowId === fromParent || rowId === subId) return null;
  row.classList.add("td-drop-into");
  return { parentId: rowId, index: null };
}

/**
 * Bind to the view root. Cards and rows only need `draggable` + `data-drag-id`
 * (ItemCard / ListRow set both from `dragId`); subitems (ids with "/") drag only with `onDropSubitem`.
 */
export function useItemDnd(rootRef: RefObject<HTMLElement | null>, { itemSelector = "[data-drag-id]", listSelector, cardsSelector, onDrop, onDropSubitem, groups }: ItemDndOptions): ItemDnd {
  const draggingId = useRef<string | null>(null);
  const latestDrop = useRef(onDrop);
  const latestSubDrop = useRef(onDropSubitem);
  const latestGroups = useRef(groups);
  // Group mode: the group the row was lifted from, and the last target reported to the host
  const fromGroup = useRef<string | null>(null);
  const lastGroup = useRef<GroupTarget | null>(null);
  useEffect(() => {
    latestDrop.current = onDrop;
    latestSubDrop.current = onDropSubitem;
    latestGroups.current = groups;
  });
  const subitems = !!onDropSubitem;
  const groupSelector = groups?.selector ?? null;
  return useMemo(() => {
    const opts = { itemSelector, listSelector, cardsSelector };
    const groupCue = (t: GroupTarget | null) => {
      const prev = lastGroup.current;
      lastGroup.current = t;
      if (prev?.groupId !== t?.groupId || prev?.ok !== t?.ok) latestGroups.current?.onCue(t ? { groupId: t.groupId, state: t.ok ? "accept" : "refuse", note: t.reason ?? undefined } : null);
    };
    /** The group section under a point and whether it takes the row (another group only; a silent refusal is no target) */
    const resolveGroup = (root: HTMLElement, x: number, y: number, id: string, source?: Element | null): GroupTarget | null => {
      const g = latestGroups.current;
      if (!g || !groupSelector) return null;
      const from = source ? (source.closest(groupSelector)?.getAttribute("data-group-id") ?? null) : fromGroup.current;
      const sec = document.elementFromPoint(x, y)?.closest<HTMLElement>(groupSelector);
      const to = sec && root.contains(sec) ? sec.getAttribute("data-group-id") : null;
      let t: GroupTarget | null = null;
      if (to && to !== from) {
        const v = g.canDrop(id, from, to);
        if (v.ok) t = { groupId: to, fromGroupId: from, ok: true };
        else if (v.reason) t = { groupId: to, fromGroupId: from, ok: false, reason: v.reason };
      }
      groupCue(t);
      return t;
    };
    const cueAt = (x: number, y: number, id: string | null, source?: Element | null): AnyDropTarget | null => {
      const root = rootRef.current;
      if (!root) return null;
      if (groupSelector) return id && !isSubitem(id) ? resolveGroup(root, x, y, id, source) : null;
      return id && isSubitem(id) ? (subitems ? resolveSubitem(root, x, y, itemSelector, id) : null) : resolve(root, x, y, opts, id);
    };
    const drop = (id: string, t: AnyDropTarget) => {
      if (isGroupTarget(t)) {
        if (t.ok) latestGroups.current?.onDrop(id, t.fromGroupId, t.groupId);
        else if (t.reason) latestGroups.current?.onRefuse?.(t.reason);
      } else if (isSubitemTarget(t)) latestSubDrop.current?.(id.split("/")[1]!, t);
      else latestDrop.current(id, t);
    };
    const end = () => {
      const root = rootRef.current;
      if (root) {
        clearCues(root);
        root.querySelectorAll(".td-drag-src").forEach((n) => n.classList.remove("td-drag-src"));
      }
      draggingId.current = null;
      fromGroup.current = null;
      groupCue(null);
    };
    const rootProps: ItemDnd["rootProps"] = {
      onDragStart: (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(itemSelector);
        const id = el?.getAttribute("data-drag-id") ?? null;
        if (!el || !id || (isSubitem(id) && !subitems)) return;
        if (isReadOnly(el)) {
          e.preventDefault();
          return;
        }
        draggingId.current = id;
        if (groupSelector) fromGroup.current = el.closest(groupSelector)?.getAttribute("data-group-id") ?? null;
        e.dataTransfer.effectAllowed = "move";
        // A subitem is not an item the sidebar can file
        if (!isSubitem(id)) e.dataTransfer.setData(ITEM_DRAG_TYPE, id);
        e.dataTransfer.setData("text/plain", id);
        // After the browser has taken its drag image.
        setTimeout(() => el.classList.add("td-drag-src"), 0);
      },
      onDragOver: (e) => {
        if (!draggingId.current) return;
        const t = cueAt(e.clientX, e.clientY, draggingId.current);
        // Group mode: only a group that takes the row is a drop target; over the others the browser shows not-allowed
        if (groupSelector && !(t && isGroupTarget(t) && t.ok)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e) => {
        if (rootRef.current && !rootRef.current.contains(e.relatedTarget as Node | null)) {
          clearCues(rootRef.current);
          groupCue(null);
        }
      },
      onDrop: (e) => {
        const id = draggingId.current;
        if (!id) return;
        e.preventDefault();
        const t = cueAt(e.clientX, e.clientY, id);
        end();
        if (t) drop(id, t);
      },
      onDragEnd: () => {
        // A drag that ends over a group that refuses says why (no drop event fires there)
        const refused = lastGroup.current && !lastGroup.current.ok ? lastGroup.current.reason : null;
        end();
        if (refused) latestGroups.current?.onRefuse?.(refused);
      },
    };
    return { rootProps, cueAt, drop, end };
  }, [rootRef, itemSelector, listSelector, cardsSelector, subitems, groupSelector]);
}
