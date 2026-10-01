// Touch drag layer beside native drag-and-drop: native DnD never fires on touch, so a long-press
// (350ms, ≤8px slop) lifts a raised clone that follows the finger, the source dims, edge zones
// auto-scroll the nearest scroller, release drops. It draws no slot cue of its own: the screen
// reuses the same cue logic it runs for dragover (`onMove` gets the point). Spec: DESIGN.md › Touch drag.
import { useEffect, useRef, type RefObject } from "react";

import "./touchDrag.css";

const IGNORE = 'button,input,textarea,select,label,a[href],[contenteditable="true"],[role^="menu"],.td-pop';

export interface TouchDragOptions {
  /** @default "[data-drag-id]" */
  selector?: string;
  ignore?: string;
  /** "coarse" lifts only for touch / pen; "any" also for the mouse (specimens) @default "coarse" */
  pointer?: "coarse" | "any";
  /** Long-press before the lift, ms @default 350 */
  delay?: number;
  /** Movement allowed during the press, px @default 8 */
  slop?: number;
  /** Auto-scroll zone at a scroller's edges, px @default 40 */
  edge?: number;
  /** Max auto-scroll per frame, px @default 14 */
  speed?: number;
  ghost?: boolean;
  /** Return false to refuse the lift */
  onLift?: (el: HTMLElement, p: { x: number; y: number }) => false | void;
  onMove?: (p: { x: number; y: number; target: Element | null }, drag: TouchDragState) => void;
  onDrop?: (p: { x: number; y: number; target: Element | null }, drag: TouchDragState) => void;
  onCancel?: (drag: TouchDragState) => void;
  disabled?: boolean;
}

export interface TouchDragState {
  el: HTMLElement;
  id: number;
  dragId: string | null;
  x: number;
  y: number;
}

export const TOUCH_DRAG_DEFAULTS = { selector: "[data-drag-id]", ignore: IGNORE, pointer: "coarse" as const, delay: 350, slop: 8, edge: 40, speed: 14, ghost: true };

interface Scroller {
  n: HTMLElement;
  sx: boolean;
  sy: boolean;
  win?: boolean;
}

/** Imperative form. Returns detach(). */
export function attachTouchDrag(root: HTMLElement, opts: TouchDragOptions): () => void {
  const o = { ...TOUCH_DRAG_DEFAULTS, ...opts };
  let press: { el: HTMLElement; id: number; x: number; y: number; t: ReturnType<typeof setTimeout> } | null = null;
  let drag: (TouchDragState & { ox: number; oy: number; ghost: HTMLElement | null; target: Element | null }) | null = null;
  let raf = 0;
  let suppressClick = false;
  const edges: Record<string, HTMLDivElement> = {};
  root.setAttribute("data-tdrag-root", "");
  const ramp = (v: number) => Math.min(o.speed, Math.max(2, Math.ceil((v / o.edge) * o.speed)));
  const scrollers = (el: Element | null): Scroller[] => {
    const out: Scroller[] = [];
    let n: Element | null = el;
    while (n && n !== document.documentElement) {
      const h = n as HTMLElement;
      const cs = getComputedStyle(h);
      const sx = /(auto|scroll)/.test(cs.overflowX) && h.scrollWidth > h.clientWidth + 1;
      const sy = /(auto|scroll)/.test(cs.overflowY) && h.scrollHeight > h.clientHeight + 1;
      if (sx || sy) out.push({ n: h, sx, sy });
      n = n.parentElement;
    }
    const se = document.scrollingElement as HTMLElement | null;
    if (se && (se.scrollHeight > innerHeight + 1 || se.scrollWidth > innerWidth + 1)) out.push({ n: se, sx: se.scrollWidth > innerWidth + 1, sy: se.scrollHeight > innerHeight + 1, win: true });
    return out;
  };
  const edge = (k: string, st: Record<string, string> | null) => {
    let e = edges[k];
    if (!st) {
      if (e) e.style.display = "none";
      return;
    }
    if (!e) {
      e = edges[k] = document.createElement("div");
      e.className = "td-tdrag-edge";
      e.setAttribute("aria-hidden", "true");
      document.body.appendChild(e);
    }
    Object.assign(e.style, { display: "block", ...st });
  };
  const hideEdges = () => {
    edge("x", null);
    edge("y", null);
  };
  const cancelPress = () => {
    if (press) {
      clearTimeout(press.t);
      press.el.classList.remove("td-tdrag-press");
      press = null;
    }
  };
  const update = () => {
    const d = drag;
    if (!d) return;
    if (d.ghost) d.ghost.style.transform = `translate(${d.x - d.ox}px, ${d.y - d.oy}px)`;
    d.target = document.elementFromPoint(d.x, d.y);
    o.onMove?.({ x: d.x, y: d.y, target: d.target }, d);
  };
  const step = () => {
    const d = drag;
    if (!d) return;
    let moved = false;
    let ex: Record<string, string> | null = null;
    let ey: Record<string, string> | null = null;
    for (const s of scrollers(d.target ?? root)) {
      const r = s.win ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : s.n.getBoundingClientRect();
      if (s.sx && !ex) {
        let v = 0;
        if (d.x < r.left + o.edge && s.n.scrollLeft > 0) v = -ramp(r.left + o.edge - d.x);
        else if (d.x > r.right - o.edge && s.n.scrollLeft < s.n.scrollWidth - s.n.clientWidth - 1) v = ramp(d.x - (r.right - o.edge));
        if (v) {
          s.n.scrollLeft += v;
          moved = true;
          ex = { top: `${r.top}px`, height: `${r.bottom - r.top}px`, width: "3px", left: `${v < 0 ? r.left : r.right - 3}px` };
        }
      }
      if (s.sy && !ey) {
        let v = 0;
        if (d.y < r.top + o.edge && s.n.scrollTop > 0) v = -ramp(r.top + o.edge - d.y);
        else if (d.y > r.bottom - o.edge && s.n.scrollTop < s.n.scrollHeight - s.n.clientHeight - 1) v = ramp(d.y - (r.bottom - o.edge));
        if (v) {
          s.n.scrollTop += v;
          moved = true;
          ey = { left: `${r.left}px`, width: `${r.right - r.left}px`, height: "3px", top: `${v < 0 ? r.top : r.bottom - 3}px` };
        }
      }
    }
    edge("x", ex);
    edge("y", ey);
    if (moved) update();
    raf = requestAnimationFrame(step);
  };
  const lift = () => {
    const p = press;
    if (!p) return;
    press = null;
    p.el.classList.remove("td-tdrag-press");
    if (o.onLift?.(p.el, { x: p.x, y: p.y }) === false) return;
    const r = p.el.getBoundingClientRect();
    let ghost: HTMLElement | null = null;
    if (o.ghost) {
      ghost = p.el.cloneNode(true) as HTMLElement;
      ghost.classList.add("td-tdrag-ghost");
      ghost.classList.remove("td-drag-src", "td-tdrag-press");
      ghost.removeAttribute("id");
      Object.assign(ghost.style, { position: "fixed", top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, margin: "0", pointerEvents: "none", boxSizing: "border-box" });
      document.body.appendChild(ghost);
    }
    drag = { el: p.el, id: p.id, dragId: p.el.getAttribute("data-drag-id"), ox: p.x, oy: p.y, x: p.x, y: p.y, ghost, target: null };
    p.el.classList.add("td-drag-src");
    root.classList.add("is-touch-dragging");
    document.documentElement.classList.add("td-tdrag-active");
    try {
      navigator.vibrate?.(8);
    } catch {
      /* no haptics */
    }
    try {
      p.el.setPointerCapture(p.id);
    } catch {
      /* capture unsupported */
    }
    update();
    raf = requestAnimationFrame(step);
  };
  const finish = (d: NonNullable<typeof drag>, dropped: boolean) => {
    cancelAnimationFrame(raf);
    hideEdges();
    d.ghost?.remove();
    d.el.classList.remove("td-drag-src");
    root.classList.remove("is-touch-dragging");
    document.documentElement.classList.remove("td-tdrag-active");
    try {
      d.el.releasePointerCapture(d.id);
    } catch {
      /* already released */
    }
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 400);
    if (dropped) o.onDrop?.({ x: d.x, y: d.y, target: document.elementFromPoint(d.x, d.y) }, d);
    else o.onCancel?.(d);
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || press || drag) return;
    if (o.pointer !== "any" && e.pointerType === "mouse") return;
    const el = (e.target as HTMLElement).closest?.(o.selector) as HTMLElement | null;
    if (!el || !root.contains(el)) return;
    let n = e.target as HTMLElement | null;
    while (n && n !== el) {
      if (n.matches?.(o.ignore)) return;
      n = n.parentElement;
    }
    el.classList.add("td-tdrag-press");
    press = { el, id: e.pointerId, x: e.clientX, y: e.clientY, t: setTimeout(lift, o.delay) };
  };
  const onMove = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > o.slop) cancelPress();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    drag.x = e.clientX;
    drag.y = e.clientY;
    update();
  };
  const onUp = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) {
      cancelPress();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const d = drag;
    drag = null;
    finish(d, e.type === "pointerup");
  };
  const onTouchMove = (e: TouchEvent) => {
    if (drag) e.preventDefault();
  };
  const onContext = (e: Event) => {
    if (press || drag) e.preventDefault();
  };
  const onClick = (e: MouseEvent) => {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && drag) {
      const d = drag;
      drag = null;
      finish(d, false);
    }
  };
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);
  root.addEventListener("touchmove", onTouchMove, { passive: false });
  root.addEventListener("contextmenu", onContext);
  root.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  return () => {
    cancelPress();
    if (drag) {
      const d = drag;
      drag = null;
      finish(d, false);
    }
    Object.values(edges).forEach((e) => e.remove());
    root.removeAttribute("data-tdrag-root");
    root.removeEventListener("pointerdown", onDown);
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerup", onUp);
    root.removeEventListener("pointercancel", onUp);
    root.removeEventListener("touchmove", onTouchMove);
    root.removeEventListener("contextmenu", onContext);
    root.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
  };
}

/** Hook form: bind to a container ref; callbacks always see the latest render. */
export function useTouchDrag(rootRef: RefObject<HTMLElement | null>, opts: TouchDragOptions = {}) {
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  const { disabled, selector, pointer, delay, ignore } = opts;
  useEffect(() => {
    if (disabled || !rootRef.current) return;
    return attachTouchDrag(rootRef.current, {
      selector,
      pointer,
      delay,
      ignore,
      onLift: (el, p) => latest.current.onLift?.(el, p),
      onMove: (p, d) => latest.current.onMove?.(p, d),
      onDrop: (p, d) => latest.current.onDrop?.(p, d),
      onCancel: (d) => latest.current.onCancel?.(d),
    });
  }, [disabled, selector, pointer, delay, ignore, rootRef]);
}
