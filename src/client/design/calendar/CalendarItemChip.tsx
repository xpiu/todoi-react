// CalendarItemChip — one item on a day cell: label bars, title, mono key; green check when done,
// red clock when overdue. Draggable to another day (reschedule).
import type { CSSProperties, DragEvent } from "react";

import { Icon } from "../core/Icon";
import type { CalendarLabel } from "./calendar";
import "./CalendarItemChip.css";

export interface CalendarItemChipProps {
  title: string;
  itemId?: string;
  showId?: boolean;
  labels?: CalendarLabel[];
  done?: boolean;
  overdue?: boolean;
  onClick?: () => void;
  dragId?: string;
  /** The day the chip sits on, the drag's starting day */
  dragFrom?: string;
  onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
}

export function CalendarItemChip({ title, itemId, showId = true, labels = [], done, overdue, onClick, dragId, dragFrom, onDragStart, style }: CalendarItemChipProps) {
  const bars = labels.slice(0, 3).map((l) => l.color);
  return (
    <button type="button" className={"td-calchip" + (done ? " is-done" : "")} title={title} draggable={dragId ? true : undefined} data-drag-id={dragId} data-drag-from={dragId ? dragFrom : undefined} onDragStart={onDragStart} onClick={onClick} style={style}>
      {done ? <Icon name="circle-check" size={12} color="var(--success-icon)" className="td-calchip-ico" /> : !done && overdue ? <Icon name="clock" size={12} color="var(--danger)" className="td-calchip-ico" /> : null}
      {bars.length ? (
        <span className="td-calchip-bars" aria-hidden>
          {bars.map((c, i) => (
            <span key={i} className="td-calchip-bar" style={{ background: `var(--label-${c})` }} />
          ))}
        </span>
      ) : null}
      <span className="td-calchip-title">{title}</span>
      {itemId && showId ? <span className="td-calchip-key">{itemId}</span> : null}
    </button>
  );
}
