// Native HTML5 drag-and-drop for items across lists (board columns and list sections), with the
// spec's quiet cues: the source dims (td-drag-src), a 2px action-blue line marks the slot
// (td-drop-before / td-drop-after on the card or row under the pointer, td-drop-end on an empty tail).
// The touch layer (useTouchDrag) reuses the same cue logic through `cueAt`. Spec: DESIGN.md › Drag & drop.
import { useEffect, useMemo, useRef, type DragEvent, type RefObject } from "react";

import { ITEM_DRAG_TYPE } from "../navigation/Sidebar";

export interface DropTarget {
  listId: string;
  /** Index among the destination's top-level items */
  position: number;
}

export interface ItemDndOptions {
  /** Selector of a draggable item inside the view (carries data-drag-id) @default "[data-drag-id]" */
  itemSelector?: string;
  /** Selector of a list container (carries data-list-id) */
  listSelector: string;
  /** Selector of the container holding a list's items (an empty list's end cue lives here) */
  cardsSelector: string;
  onDrop: (itemId: string, target: DropTarget) => void;
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
  /** Paint the slot cue for a point and return the target it means (null off any list) */
  cueAt: (x: number, y: number, draggingId: string | null) => DropTarget | null;
  /** Clear every cue and the dimmed source */
  end: () => void;
}

const CUE_CLASSES = ["td-drop-before", "td-drop-after", "td-drop-end"];
const isSubitem = (id: string | null) => !id || id.includes("/");

export function clearCues(root: HTMLElement) {
  root.querySelectorAll(CUE_CLASSES.map((c) => "." + c).join(",")).forEach((n) => n.classList.remove(...CUE_CLASSES));
}

/** Resolve the drop target under a point and paint the cue. */
function resolve(root: HTMLElement, x: number, y: number, o: Required<Omit<ItemDndOptions, "onDrop">>, draggingId: string | null): DropTarget | null {
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

/**
 * Bind to the view root. Cards and rows only need `draggable` + `data-drag-id`
 * (ItemCard / ListRow set both from `dragId`); subitems (ids with "/") never drag.
 */
export function useItemDnd(rootRef: RefObject<HTMLElement | null>, { itemSelector = "[data-drag-id]", listSelector, cardsSelector, onDrop }: ItemDndOptions): ItemDnd {
  const draggingId = useRef<string | null>(null);
  const latestDrop = useRef(onDrop);
  useEffect(() => {
    latestDrop.current = onDrop;
  });
  return useMemo(() => {
    const opts = { itemSelector, listSelector, cardsSelector };
    const cueAt = (x: number, y: number, id: string | null) => (rootRef.current ? resolve(rootRef.current, x, y, opts, id) : null);
    const end = () => {
      const root = rootRef.current;
      if (root) {
        clearCues(root);
        root.querySelectorAll(".td-drag-src").forEach((n) => n.classList.remove("td-drag-src"));
      }
      draggingId.current = null;
    };
    const rootProps: ItemDnd["rootProps"] = {
      onDragStart: (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(itemSelector);
        const id = el?.getAttribute("data-drag-id") ?? null;
        if (!el || isSubitem(id)) return;
        draggingId.current = id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(ITEM_DRAG_TYPE, id!);
        e.dataTransfer.setData("text/plain", id!);
        // After the browser has taken its drag image.
        setTimeout(() => el.classList.add("td-drag-src"), 0);
      },
      onDragOver: (e) => {
        if (!draggingId.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        cueAt(e.clientX, e.clientY, draggingId.current);
      },
      onDragLeave: (e) => {
        if (rootRef.current && !rootRef.current.contains(e.relatedTarget as Node | null)) clearCues(rootRef.current);
      },
      onDrop: (e) => {
        const id = draggingId.current;
        if (!id) return;
        e.preventDefault();
        const t = cueAt(e.clientX, e.clientY, id);
        end();
        if (t) latestDrop.current(id, t);
      },
      onDragEnd: end,
    };
    return { rootProps, cueAt, end };
  }, [rootRef, itemSelector, listSelector, cardsSelector]);
}
