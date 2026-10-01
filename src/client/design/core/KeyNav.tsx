// KeyNav — headless keyboard container for item collections (board cards, list rows). The whole
// collection is ONE Tab stop (roving tabindex); arrows / J / K move focus inside, Ctrl/Cmd+arrow emits
// onMoveItem, single keys emit onItemKey, S / shift+arrows / Ctrl+A emit onItemSelect. All matching
// goes through the SHORTCUTS registry. Items are located by itemSelector and identified by data-drag-id.
import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

import { SHORTCUTS, type FocusDir, type ItemAction } from "./shortcuts";

const FOCUSABLE = "button,input,select,textarea,a[href],[tabindex]";
const visible = (el: Element) => {
  const h = el as HTMLElement;
  return !!(h.offsetWidth || h.offsetHeight || h.getClientRects().length);
};

function demote(it: HTMLElement) {
  if (it.getAttribute("tabindex") !== "-1") it.setAttribute("tabindex", "-1");
  it.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((c) => {
    if (c.dataset.tdRove == null) c.dataset.tdRove = c.getAttribute("tabindex") == null ? "" : c.getAttribute("tabindex")!;
    if (c.getAttribute("tabindex") !== "-1") c.setAttribute("tabindex", "-1");
  });
}
function promote(it: HTMLElement) {
  if (it.getAttribute("tabindex") !== "0") it.setAttribute("tabindex", "0");
  it.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((c) => {
    const s = c.dataset.tdRove;
    if (s != null) {
      if (s === "") c.removeAttribute("tabindex");
      else if (c.getAttribute("tabindex") !== s) c.setAttribute("tabindex", s);
      delete c.dataset.tdRove;
    }
  });
}

export type SelectMode = "toggle" | "extend" | "all";

export interface KeyNavProps extends Omit<HTMLAttributes<HTMLDivElement>, "onKeyDown"> {
  /** CSS selector for focusable items @default ".td-card" */
  itemSelector?: string;
  /** Selector for column containers; when given, ←/→ move focus across columns and ↑/↓ stay within one */
  columnSelector?: string;
  /** Ctrl/Cmd+arrow on a focused item. Focus follows the item automatically */
  onMoveItem?: (id: string, dir: FocusDir) => void;
  /** Single-key item action */
  onItemKey?: (id: string, action: ItemAction) => void;
  /** Selection keys: S ("toggle"), shift+↑↓ ("extend", both ids), ctrl/cmd+A ("all") */
  onItemSelect?: (ids: string[], mode: SelectMode) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}

const isSubitemId = (id: string | null) => !id || id.includes("/");

export function KeyNav({ itemSelector = ".td-card", columnSelector, onMoveItem, onItemKey, onItemSelect, onKeyDown, children, ...rest }: KeyNavProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const assign = () => {
      const list = [...root.querySelectorAll<HTMLElement>(itemSelector)].filter(visible);
      if (!list.length) return;
      let act = activeRef.current && list.includes(activeRef.current) ? activeRef.current : null;
      if (!act) {
        act = list[0]!;
        activeRef.current = act;
      }
      list.forEach((el) => (el === act ? promote(el) : demote(el)));
    };
    assign();
    const mo = new MutationObserver(assign);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["tabindex"] });
    const onFocusIn = (e: FocusEvent) => {
      const it = (e.target as Element | null)?.closest?.(itemSelector) as HTMLElement | null;
      if (it && root.contains(it) && activeRef.current !== it) {
        activeRef.current = it;
        assign();
      }
    };
    root.addEventListener("focusin", onFocusIn);
    return () => {
      mo.disconnect();
      root.removeEventListener("focusin", onFocusIn);
    };
  }, [itemSelector]);

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (!t.closest || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
    const root = rootRef.current;
    const item = t.closest(itemSelector) as HTMLElement | null;
    if (!item || !root || !root.contains(item)) return;
    const id = item.getAttribute("data-drag-id");
    const q = (scope: Element) => [...scope.querySelectorAll<HTMLElement>(itemSelector)].filter(visible);
    const afterPaint = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

    const mv = SHORTCUTS.itemMove(e);
    if (mv) {
      if (onMoveItem && !isSubitemId(id)) {
        e.preventDefault();
        onMoveItem(id!, mv);
        afterPaint(() => {
          const el = root.querySelector<HTMLElement>(`${itemSelector}[data-drag-id="${CSS.escape(id!)}"]`);
          el?.focus();
        });
      }
      return;
    }
    if (onItemSelect && !isSubitemId(id)) {
      if (SHORTCUTS.is("select-all", e)) {
        e.preventDefault();
        const scope = columnSelector ? (item.closest(columnSelector) ?? root) : (item.closest(".td-lsec") ?? root);
        onItemSelect(
          q(scope)
            .map((el) => el.getAttribute("data-drag-id"))
            .filter((x): x is string => !isSubitemId(x)),
          "all",
        );
        return;
      }
      const sm = SHORTCUTS.selectMove(e);
      if (sm) {
        e.preventDefault();
        const scope = columnSelector ? (item.closest(columnSelector) ?? root) : root;
        const list = q(scope).filter((el) => !isSubitemId(el.getAttribute("data-drag-id")));
        const i = list.indexOf(item);
        const next = list[Math.max(0, Math.min(i + (sm === "up" ? -1 : 1), list.length - 1))];
        const ids = [id!];
        if (next && next !== item) {
          ids.push(next.getAttribute("data-drag-id")!);
          next.focus();
        }
        onItemSelect(ids, "extend");
        return;
      }
      if (SHORTCUTS.is("select", e)) {
        e.preventDefault();
        onItemSelect([id!], "toggle");
        return;
      }
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = SHORTCUTS.focusMove(e);
    const dv = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    if (dv) {
      e.preventDefault();
      const scope = columnSelector ? (item.closest(columnSelector) ?? root) : root;
      const list = q(scope);
      const i = list.indexOf(item);
      list[Math.max(0, Math.min(i + dv, list.length - 1))]?.focus();
      return;
    }
    if ((dir === "left" || dir === "right") && columnSelector) {
      e.preventDefault();
      const cols = [...root.querySelectorAll<HTMLElement>(columnSelector)].filter(visible);
      const col = item.closest(columnSelector);
      const ci = col ? cols.indexOf(col as HTMLElement) : -1;
      if (ci < 0) return;
      const ri = q(col!).indexOf(item);
      const step = dir === "left" ? -1 : 1;
      for (let n = ci + step; n >= 0 && n < cols.length; n += step) {
        const cands = q(cols[n]!);
        if (cands.length) {
          cands[Math.max(0, Math.min(ri, cands.length - 1))]!.focus();
          return;
        }
      }
      return;
    }
    if (!onItemKey || !id) return;
    const act = SHORTCUTS.itemAction(e);
    if (!act) return;
    e.preventDefault();
    if (act === "delete") {
      // Focus survives the removal: remember the position, refocus the nearest neighbour.
      const scope = columnSelector ? (item.closest(columnSelector) ?? root) : root;
      const i = q(scope).indexOf(item);
      onItemKey(id, act);
      afterPaint(() => {
        const fresh = q(scope.isConnected ? scope : root);
        fresh[Math.max(0, Math.min(i, fresh.length - 1))]?.focus();
      });
      return;
    }
    onItemKey(id, act);
  };

  // The root advertises its item selector so a QuickAdd input inside can hand arrow-key focus back to the rows.
  return (
    <div ref={rootRef} onKeyDown={handleKey} data-td-keynav="" data-td-items={itemSelector} {...rest}>
      {children}
    </div>
  );
}
