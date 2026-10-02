// CommandPalette — Ctrl/Cmd+K: jump to any item by key, title or list. A Base UI Dialog with the
// palette look (560px, 12vh from the top). Spec: DESIGN.md › Command palette.
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useRef, useState } from "react";

import { Icon } from "../core/Icon";
import { useToastHost } from "../core/ToastPortal";
import "./CommandPalette.css";
import "../core/kbd.css";

export interface PaletteItem {
  id: string;
  /** Where the item lives (null = Inbox), carried back to `onSelect` */
  projectId?: string | null;
  title: string;
  itemId?: string;
  listName?: string;
  done?: boolean;
}

export interface CommandPaletteProps {
  open: boolean;
  items: PaletteItem[];
  onSelect?: (id: string, item: PaletteItem) => void;
  onClose: () => void;
  /** The query as typed — for items fetched per query */
  onQueryChange?: (query: string) => void;
  /** State of those per-query items: a "Searching…" or failure line instead of a false "No items" */
  status?: "idle" | "loading" | "offline" | "error" | "ready";
  /** Shown when there is no query and nothing to list */
  emptyHint?: string;
  /** @default "Jump to an item…" */
  placeholder?: string;
}

export function CommandPalette({ open, onClose, ...body }: CommandPaletteProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="td-pal-backdrop" />
        <BaseDialog.Viewport className="td-pal-viewport">
          {/* The popup unmounts on close, so the query and cursor start fresh every time */}
          <PaletteBody open={open} onClose={onClose} {...body} />
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

function PaletteBody({ open, items, onSelect, onClose, onQueryChange, status, emptyHint, placeholder = "Jump to an item…" }: CommandPaletteProps) {
  const [popupEl, setPopupEl] = useState<HTMLElement | null>(null);
  useToastHost(open ? popupEl : null);
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const needle = q.trim().toLowerCase();
  const hits = (needle ? items.filter((it) => it.title.toLowerCase().includes(needle) || it.itemId?.toLowerCase().includes(needle) || it.listName?.toLowerCase().includes(needle)) : items).slice(0, 50);
  const sel = Math.min(cur, Math.max(0, hits.length - 1));
  const move = (d: number) => {
    if (!hits.length) return;
    const n = (sel + d + hits.length) % hits.length;
    setCur(n);
    const l = listRef.current;
    const el = l?.children[n] as HTMLElement | undefined;
    if (el && l) {
      if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop;
      else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight;
    }
  };
  const pick = (it: PaletteItem) => {
    onSelect?.(it.id, it);
    onClose();
  };
  return (
    <BaseDialog.Popup ref={setPopupEl} className="td-pal" aria-label="Jump to item" initialFocus={inputRef}>
            <div className="td-pal-input">
              <Icon name="search" size={18} />
              <input
                ref={inputRef}
                value={q}
                placeholder={placeholder}
                onChange={(e) => {
                  setQ(e.target.value);
                  onQueryChange?.(e.target.value);
                  setCur(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(-1);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (hits[sel]) pick(hits[sel]);
                  }
                }}
                role="combobox"
                aria-expanded
                aria-controls="td-pal-listbox"
                aria-activedescendant={hits[sel] ? `td-pal-opt-${sel}` : undefined}
                spellCheck={false}
              />
            </div>
            {hits.length ? (
              <div className="td-pal-list" ref={listRef} id="td-pal-listbox" role="listbox">
                {hits.map((it, i) => (
                  <button key={it.id} id={`td-pal-opt-${i}`} type="button" className="td-pal-row" role="option" aria-selected={i === sel} onMouseEnter={() => setCur(i)} onClick={() => pick(it)}>
                    <span className="td-pal-title" data-done={it.done ? "true" : undefined}>
                      {it.title}
                    </span>
                    {it.listName ? <span className="td-pal-list-name">{it.listName}</span> : null}
                    {it.itemId ? <span className="td-pal-id">{it.itemId}</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="td-pal-empty" aria-live="polite" data-tone={needle && (status === "error" || status === "offline") ? "error" : undefined}>
                {!needle ? (emptyHint ?? "No items yet") : status === "loading" ? "Searching…" : status === "offline" ? "You’re offline. Item search needs a connection." : status === "error" ? "Couldn’t search items. Try again in a moment." : `No items match “${q.trim()}”`}
              </div>
            )}
            <div className="td-pal-foot">
              <span>
                <kbd className="td-kbd">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="td-kbd">↵</kbd> open
              </span>
              <span>
                <kbd className="td-kbd">esc</kbd> close
              </span>
            </div>
    </BaseDialog.Popup>
  );
}
