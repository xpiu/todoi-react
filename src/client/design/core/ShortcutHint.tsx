// ShortcutHint — the "Suggest shortcuts" nudge: one quiet pill bottom-right (the Toast owns
// bottom-left) with mono kbd chips, shown only after a POINTER action a key could have done, or when
// the pointer rests on an item. Never while typing, dismissed by any keypress, one at a time, gone
// after 6s, each situation at most 3 times ever (localStorage td-hint-seen; re-enabling resets).
// aria-hidden: a pointer-user nudge, not an announcement. Spec: DESIGN.md › Shortcut suggestions.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { isTyping, keyLabel } from "./shortcuts";
import "./ShortcutHint.css";
import "./kbd.css";

export type HintPart = [keys: string[], label: string];
export interface HintDef {
  parts: HintPart[];
}

/** id → parts. Keys mirror the SHORTCUTS registry; ids name the SITUATION that triggers the nudge. */
export const SHORTCUT_HINTS: Record<string, HintDef> = {
  item: { parts: [[["↵"], "open"], [["E"], "rename"], [["D"], "done"], [["⌫"], "delete"]] },
  "add-item": { parts: [[["N"], "adds an item to the list you’re in"]] },
  "add-list": { parts: [[["shift", "+", "N"], "adds another list"]] },
  filter: { parts: [[["F"], "opens the filter menu"]] },
  "clear-filters": { parts: [[["X"], "clears all filters"]] },
  "move-item": { parts: [[["ctrl", "+", "←", "→"], "moves the focused item to the next list"]] },
  "reorder-item": { parts: [[["ctrl", "+", "↑", "↓"], "moves the focused item within its list"]] },
  "view-board": { parts: [[["G", "then", "B"], "Board view"]] },
  "view-list": { parts: [[["G", "then", "L"], "List view"]] },
  "view-calendar": { parts: [[["G", "then", "C"], "Calendar view"]] },
  search: { parts: [[["/"], "focuses search"]] },
  description: { parts: [[["ctrl", "+", "↵"], "save"], [["esc"], "cancel"]] },
  overlay: { parts: [[["ctrl", "+", "↵"], "save and close"], [["esc"], "close"]] },
  help: { parts: [[["?"], "shows every shortcut"]] },
};

const STORE = "td-hint-seen";
const SEPS = new Set(["+", "or", "then", "–"]);

/** A shortcut as kbd chips — "ctrl + K", "G then B" — shared by the hint, the ? dialog and Settings › Keyboard. */
export function Keys({ keys, className }: { keys: ReadonlyArray<string>; className?: string }) {
  return (
    <span className={["td-keys", className ?? ""].join(" ").trim()}>
      {keys.map((k, j) =>
        SEPS.has(k) ? (
          <span key={j} className="td-keys-sep">
            {k}
          </span>
        ) : (
          <kbd key={j} className="td-kbd">
            {keyLabel(k)}
          </kbd>
        ),
      )}
    </span>
  );
}
const readSeen = (): Record<string, number> => {
  try {
    return (JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, number>) || {};
  } catch {
    return {};
  }
};
const writeSeen = (s: Record<string, number>) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

export interface UseShortcutHintsOptions {
  /** @default "[data-drag-id]" */
  hoverSelector?: string;
  /** ms the pointer rests on an item before the item hint @default 900 */
  hoverDelay?: number;
  /** ms a hint stays @default 6000 */
  duration?: number;
  /** Shows per situation, ever @default 3 */
  maxShows?: number;
}

export interface ActiveHint {
  id: string;
  parts: HintPart[];
}

export function useShortcutHints(enabled: boolean, { hoverSelector = "[data-drag-id]", hoverDelay = 900, duration = 6000, maxShows = 3 }: UseShortcutHintsOptions = {}) {
  const [hint, setHint] = useState<ActiveHint | null>(null);
  const showT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kb = useRef(false);
  const prevEnabled = useRef(enabled);
  const clear = useCallback(() => {
    if (showT.current) clearTimeout(showT.current);
    if (hideT.current) clearTimeout(hideT.current);
    setHint((h) => (h ? null : h));
  }, []);
  const suggest = useCallback(
    (id: string, delay = 0) => {
      if (!enabled || kb.current || isTyping()) return;
      const def = SHORTCUT_HINTS[id];
      if (!def || (readSeen()[id] ?? 0) >= maxShows) return;
      if (showT.current) clearTimeout(showT.current);
      showT.current = setTimeout(() => {
        if (kb.current || isTyping()) return;
        const s = readSeen();
        s[id] = (s[id] ?? 0) + 1;
        writeSeen(s);
        setHint({ id, parts: def.parts });
        if (hideT.current) clearTimeout(hideT.current);
        hideT.current = setTimeout(() => setHint(null), duration);
      }, delay);
    },
    [enabled, maxShows, duration],
  );
  const reset = useCallback(() => writeSeen({}), []);
  useEffect(() => {
    // Re-enabling starts the 3-show budget over.
    if (prevEnabled.current === false && enabled) reset();
    prevEnabled.current = enabled;
    if (!enabled) {
      // Disabled: drop pending timers; the returned hint is derived null below.
      if (showT.current) clearTimeout(showT.current);
      if (hideT.current) clearTimeout(hideT.current);
      return;
    }
    let hv: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (/^(Shift|Control|Meta|Alt)$/.test(e.key)) return;
      kb.current = true;
      if (hv) clearTimeout(hv);
      clear();
    };
    const onPointer = () => {
      kb.current = false;
    };
    const onOver = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.(hoverSelector);
      if (!t) return;
      if (hv) clearTimeout(hv);
      hv = setTimeout(() => suggest("item"), hoverDelay);
    };
    const onOut = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.(hoverSelector);
      if (t && !(e.relatedTarget && t.contains(e.relatedTarget as Node)) && hv) clearTimeout(hv);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("pointermove", onPointer, true);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      if (hv) clearTimeout(hv);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("pointermove", onPointer, true);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, [enabled, hoverSelector, hoverDelay, suggest, clear, reset]);
  useEffect(
    () => () => {
      if (showT.current) clearTimeout(showT.current);
      if (hideT.current) clearTimeout(hideT.current);
    },
    [],
  );
  return { hint: enabled ? hint : null, suggest, clear, reset };
}

export function ShortcutHint({ hint, style }: { hint: ActiveHint | null; style?: CSSProperties }) {
  if (!hint?.parts.length) return null;
  return (
    <div className="td-hint" aria-hidden style={style}>
      {hint.parts.map((p, i) => (
        <span key={i} className="td-hint-part">
          {i ? <span className="td-hint-dot" /> : null}
          <Keys keys={p[0]} />
          {p[1] ? <span>{p[1]}</span> : null}
        </span>
      ))}
    </div>
  );
}
