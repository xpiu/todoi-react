// ListRow — one item as a flat row: circle checkbox, wrapping title, then right-pinned labels,
// badges, due pill, repeat glyph, priority flag, avatar stack and the mono key (click copies).
// Subitems render beneath as indented rows. Spec: DESIGN.md › List view, Notifications.
import type { CSSProperties, MouseEvent, SyntheticEvent } from "react";

const stack = (n: number) => ({ "--td-z": n }) as CSSProperties;

import { DueDatePill, type DueState } from "../board/DueDatePill";
import { LabelChip } from "../board/LabelChip";
import { Avatar } from "../core/Avatar";
import { Checkbox } from "../core/Checkbox";
import { COPY_FAILED, copyIcon, useCopy } from "../core/clipboard";
import { Icon } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { Popover, PopoverClose, usePopover } from "../core/Popover";
import { PRIORITY_COLORS } from "../core/priorities";
import { StatusChip } from "../core/StatusChip";
import type { StatusLike } from "../core/statuses";
import "../core/text.css";
import "./ListRow.css";

export type RowLabel = string | { color: string; text?: string };
export type RowPerson = string | { name: string; src?: string; color?: string };
export type RowPriority = "Urgent" | "High" | "Medium" | "Low";

export interface ListRowProps {
  title: string;
  /** Short key, e.g. "MP-112" */
  itemId?: string;
  /** @default true */
  showId?: boolean;
  labels?: RowLabel[];
  done?: boolean;
  onDone?: (done: boolean) => void;
  /** Due date text, e.g. "Jan 10, 2020" */
  due?: string;
  dueState?: DueState;
  /** The recurrence as a sentence */
  repeat?: string;
  /** Checkbox holds the check for 650ms @default !!repeat */
  recurring?: boolean;
  /** Created-date text (Inbox rows) */
  created?: string;
  attachments?: number;
  priority?: RowPriority;
  assignees?: RowPerson[];
  status?: StatusLike;
  subitems?: Array<Omit<ListRowProps, "subitems" | "sub">>;
  selected?: boolean;
  /** Internal: renders the row as an indented subitem */
  sub?: boolean;
  /** Makes the row draggable (data-drag-id) */
  dragId?: string;
  /** Inbox: not opened yet */
  unread?: boolean;
  /** Notification: who it came from */
  from?: { name?: string; src?: string; color?: string };
  /** Notification: the item it is about — its key opens that item */
  about?: { key: string; title?: string; onOpen?: () => void };
  onClick?: (e: SyntheticEvent) => void;
  style?: CSSProperties;
}

function RowKey({ itemId }: { itemId: string }) {
  const [copied, doCopy] = useCopy();
  const copy = (e: MouseEvent) => {
    e.stopPropagation();
    void doCopy(itemId);
  };
  return (
    <button type="button" className={"td-lrow-key" + (copied !== "idle" ? " is-copied" : "")} title={copied === "failed" ? COPY_FAILED : `Click to copy ${itemId}`} aria-label={`Copy ${itemId}`} onClick={copy} onKeyDown={(e) => e.stopPropagation()}>
      <span className="td-lrow-key-txt">{itemId}</span>
      <span className="td-lrow-key-ico" aria-hidden>
        <Icon name={copyIcon(copied, "copy")} size={12} />
      </span>
    </button>
  );
}

function AboutKey({ about }: { about: NonNullable<ListRowProps["about"]> }) {
  return (
    <button
      type="button"
      className="td-lrow-key td-lrow-about"
      title={`Open ${about.key}${about.title ? `: ${about.title}` : ""}`}
      aria-label={`Open ${about.key}`}
      onClick={(e) => {
        e.stopPropagation();
        about.onOpen?.();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="td-lrow-key-txt">{about.key}</span>
      <span className="td-lrow-key-ico" aria-hidden>
        <Icon name="arrow-up-right" size={12} />
      </span>
    </button>
  );
}

function RowLabels({ labels, title }: { labels: RowLabel[]; title: string }) {
  const { open, setOpen } = usePopover();
  const values = labels.map((l) => (typeof l === "string" ? { color: l, text: l } : l));
  return (
    <span className="td-lrow-labels" title={values.map((l) => l.text ?? l.color).join(", ")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {values.map((l, i) => (
        <LabelChip key={i} color={l.color} text={l.text ?? l.color} size="sm" className={"td-lpill" + (i >= 3 ? " td-lpill-x" : "")} style={stack(values.length - i + 1)} />
      ))}
      {values.length > 3 ? (
        <Popover
          open={open}
          onOpenChange={setOpen}
          role="dialog"
          aria-label={`Labels for ${title}`}
          tier="detached"
          width={280}
          trigger={<button type="button" className="td-lpill td-lpill-n" aria-label={`${values.length - 3} more labels`}>+{values.length - 3}</button>}
        >
          <div className="td-row-label-panel">
            <div className="td-row-label-head">
              <strong>Labels</strong>
              <PopoverClose render={<IconButton name="x" label="Close labels" size={28} />} />
            </div>
            <div className="td-row-label-list">
              {values.map((l, i) => <LabelChip key={i} color={l.color} text={l.text ?? l.color} size="sm" />)}
            </div>
          </div>
        </Popover>
      ) : null}
    </span>
  );
}

const personOf = (p: RowPerson) => (typeof p === "string" ? { name: p } : p);

export function ListRow({ title, itemId, showId = true, labels = [], done, onDone, due, dueState = "default", repeat, recurring = !!repeat, created, attachments, priority, assignees = [], status, subitems, sub, selected, dragId, unread, from, about, onClick, style }: ListRowProps) {
  const hasSubs = !sub && !!subitems?.length;
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const row = (
    <div
      className={"td-lrow" + (sub ? " td-lrow-sub" : "") + (unread && !sub ? " is-unread" : "")}
      // The list / listitem pattern: the row is a focusable list item (roving tabindex via KeyNav) whose
      // controls — checkbox, key, ⋯ — stay real buttons; a widget role here would nest interactives.
      role={hasSubs ? undefined : "listitem"}
      tabIndex={0}
      data-selected={selected ? "true" : undefined}
      draggable={dragId ? true : undefined}
      data-drag-id={dragId}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick && e.target === e.currentTarget) {
          e.preventDefault();
          onClick(e);
        }
      }}
      style={sub ? style : undefined}
    >
      {selected ? <span className="td-sr-only">Selected</span> : null}
      <span className="td-lrow-check" onClick={stop}>
        <Checkbox checked={!!done} onChange={(v) => onDone?.(v)} shape="circle" recurring={recurring} aria-label={done ? "Mark not done" : "Mark done"} />
      </span>
      {from ? (
        <span className="td-lrow-from" title={from.name ? `From ${from.name}` : "From Todoi"}>
          {from.name ? (
            <Avatar name={from.name} src={from.src} color={from.color} size={20} />
          ) : (
            <span className="td-lrow-apptile">
              <Icon name="sparkle" size={12} />
            </span>
          )}
        </span>
      ) : null}
      <span className="td-lrow-title">{title}</span>
      <span className="td-lrow-end">
        {status ? (
          <span className="td-lrow-cell">
            <StatusChip status={status} />
          </span>
        ) : null}
        {labels.length ? <RowLabels labels={labels} title={title} /> : null}
        {attachments ? (
          <span className="td-lrow-badge" title="Attachments">
            <Icon name="paperclip" size={14} />
            {attachments}
          </span>
        ) : null}
        {created && !about?.key ? (
          <span className="td-lrow-badge" title={`Created ${created}`}>
            <Icon name="calendar-plus" size={14} />
            {created}
          </span>
        ) : null}
        {due ? (
          <span className="td-lrow-cell">
            <DueDatePill date={due} state={dueState} />
          </span>
        ) : null}
        {repeat ? (
          <span className="td-lrow-badge" title={`Repeats: ${repeat}`}>
            <Icon name="repeat" size={14} />
          </span>
        ) : null}
        {priority ? (
          <span className="td-lrow-badge" title={`Priority: ${priority}`}>
            <Icon name="flag" size={14} color={PRIORITY_COLORS[priority]} style={{ fill: PRIORITY_COLORS[priority] }} />
            <span className="td-prio-text">{priority}</span>
          </span>
        ) : null}
        {assignees.length ? (
          <span className="td-lrow-avs" title={assignees.map((a) => personOf(a).name).join(", ")}>
            {assignees.slice(0, 3).map((a, i) => {
              const o = personOf(a);
              return (
                <span key={i} className="td-lav" style={stack(assignees.length - i + 1)}>
                  <Avatar name={o.name} src={o.src} color={o.color} size={20} />
                </span>
              );
            })}
            {assignees.length > 3 ? (
              <span className="td-lav td-lav-n" aria-label={`${assignees.length - 3} more assignees`}>
                +{assignees.length - 3}
              </span>
            ) : null}
          </span>
        ) : null}
        {about?.key ? (
          <span className="td-lrow-cell td-lrow-aboutcell">
            {created ? (
              <span className="td-lrow-badge" title={`Created ${created}`}>
                <Icon name="calendar-plus" size={14} />
                {created}
              </span>
            ) : null}
            <AboutKey about={about} />
          </span>
        ) : null}
        {itemId && showId ? <RowKey itemId={itemId} /> : null}
      </span>
    </div>
  );
  if (!hasSubs) {
    return sub ? (
      row
    ) : (
      <div className={"td-lgroup" + (selected ? " is-selected" : "")} style={style}>
        {row}
      </div>
    );
  }
  return (
    <div className={"td-lgroup" + (selected ? " is-selected" : "")} role="listitem" style={style}>
      {row}
      <div className="td-lrow-subs" role="list" aria-label={`Subitems of ${title}`}>
        {subitems!.map((s, i) => (
          <ListRow key={s.itemId ?? i} {...s} sub showId={s.showId ?? showId} />
        ))}
      </div>
    </div>
  );
}
