// CalendarTray — the "No date" tray beside the month and week grids: open items without a due date, as
// a list. Drag a row onto a day to set its due date; drag a chip from the grid onto the tray to clear it.
// Keyboard and touch twin: the "Set due date" button on every row (and shift+D on a focused row or chip)
// opens the due-date picker — CalendarView owns that, and the touch drag of the rows.
// Spec: DESIGN.md › Views › Calendar (Design: calendar/CalendarTray).
import { useState, type CSSProperties, type DragEvent, type Ref } from "react";

import { Button } from "../core/Button";
import { Icon } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { Skeleton } from "../core/Skeleton";
import { tipProps } from "../core/Tooltip";
import { CHIP_DRAG_TYPE, TRAY_DRAG_TYPE } from "./calendar";
import "../core/text.css";
import "./CalendarTray.css";

export interface CalendarTrayItem {
  id: string;
  title: string;
  /** "MP-131" */
  itemId?: string;
  /** The item's list, shown after the key */
  listName?: string;
}

export type CalendarTrayState = "ready" | "loading" | { error?: string; onRetry?: () => void };

export interface CalendarTrayProps {
  items?: CalendarTrayItem[];
  /** Shown in the head instead of items.length, e.g. "5 of 12" while filters are on */
  count?: number | string;
  /** "loading": three placeholder rows. {error, onRetry}: the failure with Retry. @default "ready" */
  state?: CalendarTrayState;
  /** @default true */
  showItemIds?: boolean;
  /** Viewers: rows open the item but do not drag, no Set due date button, the tray takes no drop @default false */
  readOnly?: boolean;
  /** Force the drop cue (the touch layer: a chip is held over the tray) */
  dropActive?: boolean;
  /** The row whose "Set due date" picker is open (its button reads expanded) */
  pickingId?: string | null;
  /** The open picker's id, for that button's aria-controls */
  pickerId?: string;
  onOpenItem?: (id: string) => void;
  /** "Set due date" on a row; `anchor` is the row element to hang the date picker on */
  onSetDate?: (id: string, anchor: HTMLElement) => void;
  /** A grid chip was dropped on the tray: clear that item's due date */
  onDropItem?: (id: string) => void;
  /** Renders × in the head */
  onClose?: () => void;
  id?: string;
  /** The tray's root (CalendarView binds the rows' touch drag to it) */
  ref?: Ref<HTMLElement>;
  style?: CSSProperties;
  className?: string;
}

export function CalendarTray({ items = [], count, state = "ready", showItemIds = true, readOnly = false, dropActive = false, pickingId, pickerId, onOpenItem, onSetDate, onDropItem, onClose, id, ref, style, className }: CalendarTrayProps) {
  const [over, setOver] = useState(false);
  // Only a grid chip drops here: never the tray's own rows, files or text.
  const fromGrid = (e: DragEvent) => e.dataTransfer.types.includes(CHIP_DRAG_TYPE);
  const canDrop = !readOnly && !!onDropItem;
  const dropping = canDrop && (over || dropActive);
  const err = state && typeof state === "object" ? state : null;
  const n = count ?? items.length;
  const tip = tipProps("Set due date", "left");
  let body;
  if (state === "loading")
    body = (
      <div className="td-calendar-tray-list" aria-busy="true">
        <span className="td-sr-only">Loading items without a date</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="td-calendar-tray-skeleton">
            <Skeleton width={i === 1 ? "60%" : "85%"} height={12} />
            <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
    );
  else if (err)
    body = (
      <div className="td-calendar-tray-note" role="alert">
        <b>Couldn't load items without a date</b>
        {err.error ? <span>{err.error}</span> : null}
        {err.onRetry ? (
          <Button onClick={err.onRetry} className="td-calendar-tray-retry">
            Retry
          </Button>
        ) : null}
      </div>
    );
  else if (!items.length)
    body = (
      <div className="td-calendar-tray-note">
        <b>No items without a date</b>
        {readOnly ? null : <span>Drag an item here to clear its due date.</span>}
      </div>
    );
  else
    body = (
      <div className="td-calendar-tray-list" role="list">
        {items.map((it) => (
          // The item is one button (it opens the item and is what drags); "Set due date" is its sibling, never inside it.
          <div key={it.id} className="td-calendar-tray-row" role="listitem">
            <button
              type="button"
              className="td-calendar-tray-item"
              draggable={readOnly ? undefined : true}
              data-drag-id={readOnly ? undefined : it.id}
              title={it.title}
              onDragStart={
                readOnly
                  ? undefined
                  : (e) => {
                      e.dataTransfer.setData("text/plain", it.id);
                      e.dataTransfer.setData(TRAY_DRAG_TYPE, it.id);
                      e.dataTransfer.effectAllowed = "move";
                    }
              }
              onClick={() => onOpenItem?.(it.id)}
            >
              <span className="td-calendar-tray-name">{it.title}</span>
              {(showItemIds && it.itemId) || it.listName ? (
                <span className="td-calendar-tray-meta">
                  {showItemIds && it.itemId ? <span className="td-calendar-tray-key">{it.itemId}</span> : null}
                  {it.listName ? <span>{it.listName}</span> : null}
                </span>
              ) : null}
            </button>
            {!readOnly && onSetDate ? (
              <button
                type="button"
                {...tip}
                className={"td-calendar-tray-date " + tip.className}
                aria-label={`Set due date for ${it.title}`}
                aria-haspopup="dialog"
                aria-expanded={pickingId === it.id}
                aria-controls={pickingId === it.id ? pickerId : undefined}
                onClick={(e) => onSetDate(it.id, e.currentTarget.parentElement!)}
              >
                <Icon name="calendar-plus" size={16} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  return (
    <aside
      ref={ref}
      id={id}
      className={["td-calendar-tray", className ?? ""].join(" ").trim()}
      aria-label="Items without a due date"
      data-drop={dropping ? "true" : undefined}
      data-read-only={readOnly ? "true" : undefined}
      style={style}
      onDragOver={
        canDrop
          ? (e) => {
              if (!fromGrid(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(true);
            }
          : undefined
      }
      onDragLeave={canDrop ? (e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false) : undefined}
      onDrop={
        canDrop
          ? (e) => {
              if (!fromGrid(e)) return;
              e.preventDefault();
              setOver(false);
              const dropped = e.dataTransfer.getData(CHIP_DRAG_TYPE);
              if (dropped) onDropItem!(dropped);
            }
          : undefined
      }
    >
      <div className="td-calendar-tray-head">
        <Icon name="calendar-off" size={16} />
        <h3 className="td-calendar-tray-title">No date</h3>
        <span className="td-calendar-tray-count">{n}</span>
        {onClose ? <IconButton name="x" label="Hide items without a date" size={24} iconSize={16} className="td-calendar-tray-close" onClick={onClose} /> : null}
      </div>
      {dropping ? <div className="td-calendar-tray-hint">Drop to clear the due date</div> : null}
      {body}
    </aside>
  );
}
