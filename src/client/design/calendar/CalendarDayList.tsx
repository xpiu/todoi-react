// CalendarDayList — the Day period: the day's items as ListRows in one card (done rows last),
// "Nothing lands on this day." when empty, and an "Add an item" row.
import type { CSSProperties } from "react";

import { Icon } from "../core/Icon";
import { ListRow } from "../list/ListRow";
import { toISO, type CalendarItem } from "./calendar";
import "./CalendarDayList.css";

export interface CalendarDayListProps {
  date: Date;
  items: CalendarItem[];
  onOpenItem?: (id: string) => void;
  onToggleDone?: (id: string, done: boolean) => void;
  onToggleSubitem?: (itemId: string, subitemId: string, done: boolean) => void;
  onAddItem?: (iso: string) => void;
  showItemIds?: boolean;
  showLabels?: boolean;
  style?: CSSProperties;
}

export function CalendarDayList({ date, items, onOpenItem, onToggleDone, onToggleSubitem, onAddItem, showItemIds = true, showLabels = true, style }: CalendarDayListProps) {
  const iso = toISO(date)!;
  const sorted = [...items].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  return (
    <div className="td-caldaylist" style={style}>
      <div className="td-caldaylist-meta">{items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : "No items"}</div>
      <div className="td-caldaylist-block">
        {sorted.length ? (
          <div className="td-caldaylist-rows" role="list" aria-label="Items on this day">
            {sorted.map((it) => (
              <ListRow
                key={it.id}
                dragId={it.id}
                itemId={it.itemId}
                showId={showItemIds}
                title={it.title}
                labels={showLabels && it.labels?.length ? it.labels : undefined}
                done={it.done}
                onDone={onToggleDone ? (v) => onToggleDone(it.id, v) : undefined}
                due={it.due ?? undefined}
                dueState={it.done ? "complete" : (it.dueState ?? "default")}
                attachments={it.attachments}
                priority={it.priority}
                assignees={it.assignees}
                subitems={it.subitems?.map((s) => ({ title: s.title, itemId: s.itemId, done: s.done, dragId: `${it.id}/${s.id}`, onDone: onToggleSubitem ? (v: boolean) => onToggleSubitem(it.id, s.id, v) : undefined, onClick: onOpenItem ? () => onOpenItem(it.id) : undefined }))}
                onClick={onOpenItem ? () => onOpenItem(it.id) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="td-caldaylist-empty">Nothing lands on this day.</div>
        )}
        {onAddItem ? (
          <button type="button" className="td-caldaylist-add" data-add-item={iso} onClick={() => onAddItem(iso)}>
            <Icon name="plus" size={16} />
            Add an item
          </button>
        ) : null}
      </div>
    </div>
  );
}
