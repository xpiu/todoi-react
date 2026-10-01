// ItemPicker — search-and-pick one item (by key, title or list). Panel body only: mount it inside a
// Popover or a Dialog. Rows: status glyph · mono key · title (struck when done) · list name. Enter
// picks the first match, ↑↓ rove from the field. Spec: DESIGN.md › Relations, Subitems.
import { useState, type KeyboardEvent } from "react";

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
  limit?: number;
  "aria-label"?: string;
}

export function ItemPicker({ items, exclude = [], onPick, placeholder = "Search items…", emptyText = "No items match", autoFocus = true, limit = 30, ...rest }: ItemPickerProps) {
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const ex = new Set(exclude);
  const ql = q.trim().toLowerCase();
  const list = items.filter((it) => !ex.has(it.id) && (!ql || [it.itemId, it.title, it.listName].filter(Boolean).some((s) => String(s).toLowerCase().includes(ql)))).slice(0, limit);
  const sel = Math.min(cur, Math.max(0, list.length - 1));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCur((c) => Math.min(c + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCur((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list[sel]) onPick(list[sel]);
    } else if (e.key.length === 1) e.stopPropagation();
  };
  return (
    <div className="td-ip">
      <div className="td-ip-search">
        <Icon name="search" size={14} />
        <input
          className="td-ip-input"
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          value={q}
          role="combobox"
          aria-expanded
          aria-controls="td-ip-list"
          aria-activedescendant={list[sel] ? `td-ip-opt-${list[sel].id}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setCur(0);
          }}
          onKeyDown={onKey}
        />
      </div>
      <div className="td-ip-list" id="td-ip-list" role="listbox" aria-label={rest["aria-label"] ?? "Items"}>
        {list.map((it, i) => {
          const g = statusGlyph(it);
          return (
            <div key={it.id} id={`td-ip-opt-${it.id}`} role="option" aria-selected={i === sel} className="td-ip-row" onMouseEnter={() => setCur(i)} onClick={() => onPick(it)}>
              <Icon name={g.icon} size={15} color={g.color} />
              {it.itemId ? <span className="td-ip-key">{it.itemId}</span> : null}
              <span className="td-ip-title" data-done={it.done ? "true" : undefined}>
                {it.title}
              </span>
              {it.listName ? <span className="td-ip-list-name">{it.listName}</span> : null}
            </div>
          );
        })}
        {!list.length ? <div className="td-menu-note">{emptyText}</div> : null}
      </div>
    </div>
  );
}
