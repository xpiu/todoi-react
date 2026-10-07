// ItemPicker — search-and-pick one item (by key, title or list). Panel body only: mount it inside a
// Popover or a Dialog. Rows: status glyph · mono key · title (struck when done) · list name. Enter
// picks the highlighted match, ↑↓ move it from the field. Spec: DESIGN.md › Relations, Subitems.
import { useId, useState, type KeyboardEvent, type RefObject } from "react";

import { Icon, type IconName } from "./Icon";
import { STATUSES } from "./statuses";
import "./ItemPicker.css";

export interface PickableItem {
  id: string;
  title: string;
  itemId?: string;
  listName?: string;
  status?: string | null;
  done?: boolean;
}

export function statusGlyph(it: Pick<PickableItem, "status" | "done">): { icon: IconName; color?: string } {
  const s = STATUSES.find((x) => x.id === it.status || x.name === it.status);
  if (s) return { icon: s.icon, color: s.color };
  return it.done ? { icon: "circle-check", color: "var(--success-icon)" } : { icon: "circle-dashed", color: "var(--ink-300)" };
}

export interface ItemPickerProps {
  items: PickableItem[];
  exclude?: string[];
  onPick: (item: PickableItem) => void;
  placeholder?: string;
  emptyText?: string;
  autoFocus?: boolean;
  /** The search field, for a host Dialog's initialFocus */
  inputRef?: RefObject<HTMLInputElement | null>;
  limit?: number;
  "aria-label"?: string;
}

/** A picker's highlighted option, driven from the focused field (or the listbox itself) through
 *  aria-activedescendant: ↑↓ move it, Enter picks it, typed keys stay out of app shortcuts. Ids come
 *  from useId, so two pickers never collide. ItemPicker and ProjectPicker share it. */
export function usePickerCursor<T>(options: readonly T[], key: (o: T) => string, onPick: (o: T) => void) {
  const base = useId();
  const [cur, setCur] = useState(0);
  const sel = Math.min(cur, Math.max(0, options.length - 1));
  const listId = `${base}-list`;
  const optionId = (o: T) => `${base}-opt-${key(o)}`;
  const active = options[sel];
  const pick = () => {
    if (active) onPick(active);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCur(Math.min(sel + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCur(Math.max(sel - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick();
    } else if (e.key.length === 1) e.stopPropagation();
  };
  return {
    reset: () => setCur(0),
    pick,
    activeId: active ? optionId(active) : undefined,
    onKeyDown,
    /** For the search field; the listbox is rendered only while something matches */
    comboboxProps: { role: "combobox", "aria-autocomplete": "list", "aria-expanded": options.length > 0, "aria-controls": options.length ? listId : undefined, "aria-activedescendant": active ? optionId(active) : undefined, onKeyDown } as const,
    listboxProps: { id: listId, role: "listbox" } as const,
    optionProps: (o: T, i: number) => ({ id: optionId(o), role: "option", "aria-selected": i === sel, onMouseEnter: () => setCur(i), onClick: () => onPick(o) }) as const,
  };
}

export function ItemPicker({ items, exclude = [], onPick, placeholder = "Search items…", emptyText = "No items match", autoFocus = true, inputRef, limit = 30, ...rest }: ItemPickerProps) {
  const [q, setQ] = useState("");
  const ex = new Set(exclude);
  const ql = q.trim().toLowerCase();
  const list = items.filter((it) => !ex.has(it.id) && (!ql || [it.itemId, it.title, it.listName].filter(Boolean).some((s) => String(s).toLowerCase().includes(ql)))).slice(0, limit);
  const cursor = usePickerCursor(list, (it) => it.id, onPick);
  return (
    <div className="td-ip">
      <div className="td-ip-search">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          className="td-ip-input"
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          value={q}
          {...cursor.comboboxProps}
          onChange={(e) => {
            setQ(e.target.value);
            cursor.reset();
          }}
        />
      </div>
      {list.length ? (
        <div className="td-ip-list" {...cursor.listboxProps} aria-label={rest["aria-label"] ?? "Items"}>
          {list.map((it, i) => {
            const g = statusGlyph(it);
            return (
              <div key={it.id} className="td-ip-row" {...cursor.optionProps(it, i)}>
                <Icon name={g.icon} size={15} color={g.color} />
                {it.itemId ? <span className="td-ip-key">{it.itemId}</span> : null}
                <span className="td-ip-title" data-done={it.done ? "true" : undefined}>
                  {it.title}
                </span>
                {it.listName ? <span className="td-ip-list-name">{it.listName}</span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="td-menu-note">{emptyText}</div>
      )}
    </div>
  );
}
