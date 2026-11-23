// ItemPicker — search-and-pick one item (by key, title or list). Panel body only: mount it inside a
// Popover, or as a menu drill view (ItemPickerDrill). Rows: status glyph · mono key · title (struck
// when done) · list name. Enter picks the highlighted match, ↑↓ move it from the field.
// Spec: DESIGN.md › Relations, Subitems.
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { STATUSES } from "./statuses";
import "./ItemPicker.css";
import "./ProjectPicker.css";

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
  limit?: number;
  "aria-label"?: string;
}

/** A picker's highlighted option, driven from the focused field (or the listbox itself) through
 *  aria-activedescendant: ↑↓ move it, Enter picks it, typed keys stay out of app shortcuts. Ids come
 *  from useId, so two pickers never collide. ItemPicker and ProjectPicker share it. */
export function usePickerCursor<T>(options: readonly T[], key: (o: T) => string, onPick: (o: T) => void) {
  const base = useId();
  const [cur, setCur] = useState(0);
  // Quiet until the person moves it (as Select, and as in Design): the first option stays the active descendant, so
  // Enter and screen readers have it, but its row is painted only after ↑↓, a hover or a typed query
  const [moved, setMoved] = useState(false);
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
      setMoved(true);
      setCur(Math.min(sel + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMoved(true);
      setCur(Math.max(sel - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick();
    } else if (e.key.length === 1) e.stopPropagation();
  };
  return {
    /** Back to the first option: shown after a new query, quiet again after a view change (`show` false) */
    reset: (show = true) => {
      setCur(0);
      setMoved(show);
    },
    pick,
    activeId: active ? optionId(active) : undefined,
    onKeyDown,
    /** For the search field; the listbox is rendered only while something matches */
    comboboxProps: { role: "combobox", "aria-autocomplete": "list", "aria-expanded": options.length > 0, "aria-controls": options.length ? listId : undefined, "aria-activedescendant": active ? optionId(active) : undefined, onKeyDown } as const,
    listboxProps: { id: listId, role: "listbox", "data-quiet": moved ? undefined : "true" } as const,
    optionProps: (o: T, i: number) =>
      ({
        id: optionId(o),
        role: "option",
        "aria-selected": i === sel,
        onMouseEnter: () => {
          setMoved(true);
          setCur(i);
        },
        onClick: () => onPick(o),
      }) as const,
  };
}

export function ItemPicker({ items, exclude = [], onPick, placeholder = "Search items…", emptyText = "No items match", autoFocus = true, limit = 30, ...rest }: ItemPickerProps) {
  const [q, setQ] = useState("");
  const ex = new Set(exclude);
  const ql = q.trim().toLowerCase();
  const matches = items.filter((it) => !ex.has(it.id) && (!ql || [it.itemId, it.title, it.listName].filter(Boolean).some((s) => String(s).toLowerCase().includes(ql))));
  const list = matches.slice(0, limit);
  const cursor = usePickerCursor(list, (it) => it.id, onPick);
  return (
    <div className="td-item-picker">
      <div className="td-item-picker-search">
        <Icon name="search" size={14} />
        <input
          className="td-item-picker-input"
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
        <div className="td-item-picker-list" {...cursor.listboxProps} aria-label={rest["aria-label"] ?? "Items"}>
          {list.map((it, i) => {
            const g = statusGlyph(it);
            return (
              <div key={it.id} className="td-item-picker-row" {...cursor.optionProps(it, i)}>
                <Icon name={g.icon} size={15} color={g.color} />
                {it.itemId ? <span className="td-item-picker-key">{it.itemId}</span> : null}
                <span className="td-item-picker-title" data-done={it.done ? "true" : undefined}>
                  {it.title}
                </span>
                {it.listName ? <span className="td-item-picker-list-name">{it.listName}</span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="td-menu-note">{emptyText}</div>
      )}
      {/* The list stops at `limit`: say so, and how to reach the rest */}
      {matches.length > list.length ? <div className="td-menu-note">Showing {list.length} of {matches.length}. Type a key or title to find the rest.</div> : null}
    </div>
  );
}

/** A picker's drill-view head: Back arrow + title (ItemPickerDrill, ProjectPicker). The arrow is a plain button, not a
 *  menu row, so ↑↓ stay with the picker's field. */
export function PickerHead({ title, onBack }: { title: ReactNode; onBack?: () => void }) {
  return (
    <div className="td-project-picker-head">
      {onBack ? <IconButton name="arrow-left" label="Back" size={22} iconSize={14} onClick={onBack} /> : null}
      <span className="td-project-picker-head-title">{title}</span>
    </div>
  );
}

/** ItemPicker as a ⋯ menu drill view (Design: ItemOverlay › Make subitem of…, Checklist › Move to another item…):
 *  Back + title, the picker, an optional note. Escape steps back through the menu's useMenuDrill. */
export function ItemPickerDrill({ title, onBack, note, ...picker }: ItemPickerProps & { title: string; onBack: () => void; note?: ReactNode }) {
  return (
    <>
      <PickerHead title={title} onBack={onBack} />
      <ItemPicker aria-label={title} {...picker} />
      {note ? <div className="td-menu-note">{note}</div> : null}
    </>
  );
}

/** "Make subitem of…" (the overlay ⋯ and a board card's ⋯): the parent picker as a drill view. */
export function MakeSubitemDrill(props: Omit<ItemPickerProps, "placeholder"> & { onBack: () => void }) {
  return <ItemPickerDrill title="Make subitem of" note="This item moves under the picked item as a subitem; its key stays." {...props} />;
}
