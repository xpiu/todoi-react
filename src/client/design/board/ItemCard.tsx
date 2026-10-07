// ItemCard — a board item: optional cover, title (green check when done), compact labels, a badge row
// (description, due, repeat, subitems progress, attachments, priority, avatars) with the mono key
// pinned right, and a hover ⋯ menu. Spec: DESIGN.md › Board, Item keys.
import type { CSSProperties, DragEvent, MouseEvent, SyntheticEvent } from "react";

import { Avatar } from "../core/Avatar";
import { COPY_FAILED, copyIcon, useCopy } from "../core/clipboard";
import { Icon } from "../core/Icon";
import { MenuDivider, MenuItem, MenuPopover } from "../core/Menu";
import { PRIORITY_COLORS } from "../core/priorities";
import { StatusChip } from "../core/StatusChip";
import type { StatusLike } from "../core/statuses";
import { DueDatePill, type DueState } from "./DueDatePill";
import { LabelChip } from "./LabelChip";
import type { RowLabel, RowPerson, RowPriority } from "../list/ListRow";
import "../core/text.css";
import "./ItemCard.css";

export type CardMenuAction = "Rename" | "Move to" | "Duplicate" | "Convert to" | "Archive" | "Delete";
const MENU_ITEMS: ReadonlyArray<["pencil" | "arrow-right" | "copy" | "repeat" | "archive" | "trash-2", CardMenuAction]> = [
  ["pencil", "Rename"],
  ["arrow-right", "Move to"],
  ["copy", "Duplicate"],
  ["repeat", "Convert to"],
  ["archive", "Archive"],
  ["trash-2", "Delete"],
];

export interface ItemCardProps {
  title: string;
  itemId?: string;
  /** @default true */
  showId?: boolean;
  labels?: RowLabel[];
  done?: boolean;
  due?: string;
  dueState?: DueState;
  repeat?: string;
  badges?: { description?: boolean; checklist?: { done: number; total: number }; attachments?: number };
  cover?: { src?: string; color?: string; height?: number } | null;
  status?: StatusLike;
  priority?: RowPriority;
  assignees?: RowPerson[];
  selected?: boolean;
  /** Makes the card draggable (data-drag-id) */
  dragId?: string;
  onClick?: (e: SyntheticEvent) => void;
  onMenuAction?: (action: CardMenuAction, itemId: string) => void;
  style?: CSSProperties;
}

/** Chrome's native drag snapshot includes the hover controls; hand it a clean clone instead. */
function setCleanDragImage(e: DragEvent, card: HTMLElement) {
  if (!e.dataTransfer?.setDragImage) return;
  const r = card.getBoundingClientRect();
  const g = card.cloneNode(true) as HTMLElement;
  g.classList.remove("td-drag-src");
  g.classList.add("is-drag-ghost");
  g.querySelectorAll(".td-card-more").forEach((n) => n.remove());
  Object.assign(g.style, { position: "fixed", top: "-10000px", left: "0", width: `${r.width}px`, margin: "0", opacity: "1", transform: "none" });
  document.body.appendChild(g);
  e.dataTransfer.setDragImage(g, e.clientX - r.left, e.clientY - r.top);
  setTimeout(() => g.remove(), 0);
}

function ItemKey({ itemId }: { itemId: string }) {
  const [copy, doCopy] = useCopy();
  return (
    <span
      className={"td-card-id" + (copy !== "idle" ? " is-copied" : "")}
      title={copy === "failed" ? COPY_FAILED : `Click to copy ${itemId}`}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        void doCopy(itemId);
      }}
    >
      <span className="td-card-id-pop" aria-hidden>
        <Icon name={copyIcon(copy, "copy")} size={11} />
      </span>
      {itemId}
    </span>
  );
}

const personOf = (p: RowPerson) => (typeof p === "string" ? { name: p } : p);

export function ItemCard({ title, itemId, showId = true, labels = [], done, due, dueState = "default", repeat, badges = {}, cover, status, priority, assignees = [], selected, dragId, onClick, onMenuAction, style }: ItemCardProps) {
  const cl = badges.checklist;
  const clComplete = !!cl && cl.total > 0 && cl.done === cl.total;
  const hasOtherBadges = !!(due || repeat || badges.description || cl || badges.attachments || status || priority || assignees.length);
  const keyInLabels = !!(itemId && showId && labels.length && !hasOtherBadges);
  const hasBadges = hasOtherBadges || (itemId && showId && !keyInLabels);
  const labelObjs = labels.map((l) => (typeof l === "string" ? { color: l } : l));
  return (
    <div
      className={"td-card" + (selected ? " is-selected" : "")}
      // The list / listitem pattern (as ListRow): a focusable item whose ⋯ stays a real button.
      role="listitem"
      tabIndex={0}
      data-selected={selected ? "true" : undefined}
      draggable={dragId ? true : undefined}
      data-drag-id={dragId}
      onDragStart={dragId ? (e) => setCleanDragImage(e, e.currentTarget) : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick && e.target === e.currentTarget) {
          e.preventDefault();
          onClick(e);
        }
      }}
      style={style}
    >
      {selected ? <span className="td-sr-only">Selected</span> : null}
      {cover ? cover.src ? <img className="td-card-cover" src={cover.src} alt="" draggable={false} style={{ height: Math.min(cover.height ?? 82, 82) }} /> : <div className="td-card-cover-color" style={{ height: Math.min(cover.height ?? 36, 82), background: cover.color ?? "var(--surface-cover)" }} /> : null}
      <div className="td-card-body">
        <div className={"td-card-title" + (done ? " is-done" : "")}>
          {done ? <Icon name="circle-check" size={16} color="var(--success-icon)" className="td-card-done" /> : null}
          <span>{title}</span>
        </div>
        {labelObjs.length ? (
          <div className="td-card-labels">
            {labelObjs.map((l, i) => (
              <LabelChip key={i} color={l.color} text={l.text} size="sm" />
            ))}
            {keyInLabels ? <ItemKey itemId={itemId!} /> : null}
          </div>
        ) : null}
        {hasBadges ? (
          <div className="td-card-badges">
            {status ? <StatusChip status={status} /> : null}
            {badges.description ? (
              <span className="td-card-badge" title="This item has a description">
                <Icon name="align-left" size={14} />
              </span>
            ) : null}
            {due ? <DueDatePill date={due} state={dueState} className="td-card-due" /> : null}
            {repeat ? (
              <span className="td-card-badge" title={`Repeats: ${repeat}`}>
                <Icon name="repeat" size={14} />
              </span>
            ) : null}
            {cl ? (
              <span className="td-card-badge" data-complete={clComplete ? "true" : undefined} title={clComplete ? `Subitems: all ${cl.total} complete` : `Subitems: ${cl.done} of ${cl.total} complete`}>
                <Icon name="square-check-big" size={14} />
                <span className="td-meta-text">
                  {cl.done} of {cl.total}
                </span>
              </span>
            ) : null}
            {badges.attachments ? (
              <span className="td-card-badge" title={`Attachments: ${badges.attachments}`}>
                <Icon name="paperclip" size={14} />
                <span className="td-meta-text">{badges.attachments}</span>
              </span>
            ) : null}
            {priority ? (
              <span className="td-card-badge" title={`Priority: ${priority}`}>
                <Icon name="flag" size={14} color={PRIORITY_COLORS[priority]} style={{ fill: PRIORITY_COLORS[priority] }} />
                <span className="td-prio-text">{priority}</span>
              </span>
            ) : null}
            {assignees.length ? (
              <span className="td-card-avs" title={assignees.map((a) => personOf(a).name).join(", ")}>
                {assignees.slice(0, 3).map((a, i) => {
                  const o = personOf(a);
                  return (
                    <span key={i} className="td-cav" style={{ "--td-z": 3 - i } as CSSProperties}>
                      <Avatar name={o.name} src={o.src} color={o.color} size={20} />
                    </span>
                  );
                })}
                {assignees.length > 3 ? (
                  <span className="td-cav td-cav-n" aria-label={`${assignees.length - 3} more assignees`}>
                    +{assignees.length - 3}
                  </span>
                ) : null}
              </span>
            ) : null}
            {itemId && showId && !keyInLabels ? <ItemKey itemId={itemId} /> : null}
          </div>
        ) : null}
      </div>
      {itemId && onMenuAction ? (
        <span className="td-card-more-anchor" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <MenuPopover label="Item options" tier="detached" placement="bottom-end" width={184} trigger={<button className="td-card-more" type="button" title="Item options" aria-label="Item options"><Icon name="ellipsis" size={14} /></button>}>
            {MENU_ITEMS.map(([icon, label]) => (
              <span key={label}>
                {label === "Delete" ? <MenuDivider /> : null}
                <MenuItem icon={icon} danger={label === "Delete"} onSelect={() => onMenuAction(label, itemId)}>
                  {label}
                </MenuItem>
              </span>
            ))}
          </MenuPopover>
        </span>
      ) : null}
    </div>
  );
}
