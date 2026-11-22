// ItemCard — a board item: optional cover, title (green check when done), compact labels, a badge row
// (description, due, repeat, subitems progress, attachments, priority, avatars) with the mono key
// pinned right, and a hover ⋯ menu. Spec: DESIGN.md › Board, Item keys.
import { Fragment, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type SyntheticEvent } from "react";

import { Avatar } from "../core/Avatar";
import { COPY_FAILED, copyIcon, useCopy } from "../core/clipboard";
import { Icon } from "../core/Icon";
import type { BulkOption } from "../core/BulkBar";
import type { PopoverCloseReason } from "../core/Popover";
import { MenuDivider, MenuDrillHead, MenuGroup, MenuItem, MenuPopover } from "../core/Menu";
import { PRIORITY_COLORS } from "../core/priorities";
import { StatusChip } from "../core/StatusChip";
import { tipProps } from "../core/Tooltip";
import type { StatusLike } from "../core/statuses";
import { DueDatePill, type DueState } from "./DueDatePill";
import { LabelChip } from "./LabelChip";
import type { RowLabel, RowPerson, RowPriority } from "../list/ListRow";
import type { OverlayField } from "../overlay/ItemOverlay";
import "../core/text.css";
import "./ItemCard.css";

export type CardMenuAction = "Rename" | "Move to" | "Duplicate" | "Make subitem of" | "Archive" | "Delete";
const MENU_ITEMS: ReadonlyArray<["pencil" | "arrow-right" | "copy" | "corner-down-right" | "archive" | "trash-2", CardMenuAction]> = [
  ["pencil", "Rename"],
  ["arrow-right", "Move to"],
  ["copy", "Duplicate"],
  ["corner-down-right", "Make subitem of"],
  ["archive", "Archive"],
  ["trash-2", "Delete"],
];

/** The quick actions in the row the ⋯ menu expands under a card (Design: ItemCard): each opens that field's picker */
const QUICK_ACTIONS: ReadonlyArray<["clock" | "calendar" | "users" | "tag" | "flag" | "circle-dot", string, OverlayField]> = [
  ["clock", "Due date", "due"],
  ["calendar", "Start date", "start"],
  ["users", "Assignees", "assignees"],
  ["tag", "Labels", "labels"],
  ["flag", "Priority", "priority"],
  ["circle-dot", "Status", "status"],
];

export interface ItemCardProps {
  title: string;
  itemId?: string;
  /** Reserve the ID's metadata row while a new project item awaits its server number. */
  pendingId?: boolean;
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
  /** A menu choice. "Move to" carries the picked list id (or "__move" / "__copy" for another project) */
  onMenuAction?: (action: CardMenuAction, itemId: string, value?: string) => void;
  /** The Move to choices (the BulkBar's): with them, Move to drills into this list instead of firing at once */
  moveOptions?: BulkOption[];
  /** "Aug 12": shown in the details row the ⋯ menu expands */
  created?: string;
  /** A details-row quick action (Due date, Start date, Assignees, Labels, Priority, Status); without it the row has no buttons */
  onQuickAction?: (field: OverlayField, itemId: string) => void;
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

/** The ⋯ trigger carries the shared styled hint, never the browser's title balloon (DESIGN.md › Tooltips). */
const MORE_TIP = tipProps("Item options", "bottom-end");

function ItemKey({ itemId }: { itemId?: string }) {
  const [copy, doCopy] = useCopy();
  if (!itemId) return <span className="td-card-id is-pending" aria-label="Item ID pending">Pending</span>;
  return (
    <span
      className={"td-card-id" + (copy !== "idle" ? " is-copied" : "")}
      title={copy === "failed" ? COPY_FAILED : `Click to copy ${itemId}`}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        void doCopy(itemId);
      }}
    >
      <span className="td-card-id-popover" aria-hidden>
        <Icon name={copyIcon(copy, "copy")} size={11} />
      </span>
      {itemId}
    </span>
  );
}

const personOf = (p: RowPerson) => (typeof p === "string" ? { name: p } : p);

export function ItemCard({ title, itemId, pendingId = false, showId = true, labels = [], done, due, dueState = "default", repeat, badges = {}, cover, status, priority, assignees = [], selected, dragId, onClick, onMenuAction, moveOptions, created, onQuickAction, style }: ItemCardProps) {
  // The ⋯ menu's drill view (as the overlay ⋯ drills into Export): Move to › a list or another project
  const [menuView, setMenuView] = useState<"main" | "move">("main");
  // Opening the ⋯ menu also expands the details row under the card (Design: ItemCard). Closing the menu collapses it,
  // unless the press that closed it landed in the row (a quick action collapses it itself) or Tab left the menu: the
  // row's first quick action is then the next stop, and the row stays until focus leaves the card.
  const [expanded, setExpanded] = useState(false);
  const menuOpen = useRef(false);
  const pressInRow = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const onMenuOpenChange = (open: boolean, reason?: PopoverCloseReason) => {
    menuOpen.current = open;
    if (open) return setExpanded(true);
    if (reason === "focus-out") {
      setTimeout(() => {
        const at = document.activeElement;
        if (!at || at === document.body) rowRef.current?.querySelector<HTMLElement>(".td-card-qa")?.focus();
      });
      return;
    }
    setTimeout(() => {
      if (!pressInRow.current) setExpanded(false);
      pressInRow.current = false;
    });
  };
  // Escape or ← in the drill view steps back to the main rows instead of closing; → on Move to drills in
  const shouldClose = (reason: PopoverCloseReason) => {
    if (reason !== "escape" || menuView === "main") return true;
    setMenuView("main");
    return false;
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && menuView !== "main") {
      e.preventDefault();
      setMenuView("main");
    } else if (e.key === "ArrowRight" && menuView === "main" && moveOptions && (e.target as HTMLElement).closest("[data-drill]")) {
      e.preventDefault();
      setMenuView("move");
    }
  };
  const hasDetails = !!itemId && !!onMenuAction && (!!created || !!onQuickAction);
  const cl = badges.checklist;
  const clComplete = !!cl && cl.total > 0 && cl.done === cl.total;
  const hasOtherBadges = !!(due || repeat || badges.description || cl || badges.attachments || status || priority || assignees.length);
  const hasKey = showId && !!(itemId || pendingId);
  const keyInLabels = !!(hasKey && labels.length && !hasOtherBadges);
  const hasBadges = hasOtherBadges || (hasKey && !keyInLabels);
  const labelObjs = labels.map((l) => (typeof l === "string" ? { color: l } : l));
  return (
    <div
      ref={cardRef}
      className={"td-card" + (selected ? " is-selected" : "")}
      onBlur={(e) => {
        if (expanded && !menuOpen.current && !e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false);
      }}
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
      // Minimal reserves a slot for the key at the end of the meta words; its width is the key length in mono characters
      style={itemId && showId ? ({ "--td-key-ch": itemId.length, ...style } as CSSProperties) : style}
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
            {keyInLabels ? <ItemKey itemId={itemId} /> : null}
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
              <span className="td-card-badge" data-priority={priority.toLowerCase()} title={`Priority: ${priority}`}>
                <Icon name="flag" size={14} color={PRIORITY_COLORS[priority]} style={{ fill: PRIORITY_COLORS[priority] }} />
                <span className="td-prio-text">{priority}</span>
              </span>
            ) : null}
            {assignees.length ? (
              <span className="td-card-avatars" title={assignees.map((a) => personOf(a).name).join(", ")}>
                {assignees.slice(0, 3).map((a, i) => {
                  const o = personOf(a);
                  return (
                    <span key={i} className={"td-card-avatar" + (i >= 2 ? " td-card-avatar-extra" : "")}>
                      <Avatar name={o.name} src={o.src} color={o.color} size={20} />
                    </span>
                  );
                })}
                {assignees.length > 2 ? (
                  <span className="td-card-avatar td-card-avatar-more" aria-label={`${assignees.length - 2} more assignees`}>
                    +{assignees.length - 2}
                  </span>
                ) : null}
              </span>
            ) : null}
            {hasKey && !keyInLabels ? <ItemKey itemId={itemId} /> : null}
          </div>
        ) : null}
      </div>
      {itemId && onMenuAction ? (
        <span className="td-card-more-anchor" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <MenuPopover
            label="Item options"
            tier="detached"
            placement={hasDetails ? "right-start" : "bottom-end"}
            width={menuView === "main" ? 184 : 224}
            onOpenChange={(open, reason) => {
              if (!open) setMenuView("main");
              if (hasDetails) onMenuOpenChange(open, reason);
            }}
            shouldClose={shouldClose}
            trigger={<button {...MORE_TIP} className={"td-card-more " + MORE_TIP.className} type="button" aria-label="Item options"><Icon name="ellipsis" size={14} /></button>}
          >
            <div className="td-card-menu-body" onKeyDown={onMenuKey}>
            {menuView === "move" && moveOptions ? (
              <MenuGroup>
                <MenuDrillHead title="Move to" onBack={() => setMenuView("main")} />
                {moveOptions.map((o, i) =>
                  o.divider ? (
                    <MenuDivider key={`d${i}`} />
                  ) : (
                    <MenuItem key={o.value ?? i} icon={o.icon} iconColor={o.iconColor} checked={o.checked} disabled={o.checked} onSelect={() => o.value && onMenuAction("Move to", itemId, o.value)}>
                      {o.label}
                    </MenuItem>
                  ),
                )}
              </MenuGroup>
            ) : (
              MENU_ITEMS.map(([icon, label]) => {
                const drillTo = label === "Move to" && moveOptions ? "move" : null;
                // Items hold subitems, subitems hold nothing: an item with subitems can't become one
                const blocked = label === "Make subitem of" && !!cl?.total;
                return (
                  <Fragment key={label}>
                    {label === "Delete" ? <MenuDivider /> : null}
                    <MenuItem icon={icon} danger={label === "Delete"} drill={!!drillTo} disabled={blocked} title={blocked ? "It has its own subitems, so it can't become a subitem" : undefined} onSelect={() => (drillTo ? setMenuView(drillTo) : onMenuAction(label, itemId))}>
                      {label === "Make subitem of" ? "Make subitem of…" : label}
                    </MenuItem>
                  </Fragment>
                );
              })
            )}
            </div>
          </MenuPopover>
        </span>
      ) : null}
      {hasDetails ? (
        <div ref={rowRef} className="td-card-details" data-expanded={expanded ? "true" : undefined} inert={!expanded}>
          <div
            className="td-card-meta"
            role="group"
            aria-label="Item details"
            onPointerDown={() => (pressInRow.current = true)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setExpanded(false);
            }}
          >
            <span className="td-card-meta-created" title={created ? `Created ${created}` : undefined}>
              {created ? (
                <>
                  <span className="td-card-meta-word">Created </span>
                  {created}
                </>
              ) : null}
            </span>
            {onQuickAction
              ? QUICK_ACTIONS.map(([icon, label, field]) => (
                  <button
                    key={field}
                    type="button"
                    aria-label={label}
                    {...tipProps(label)}
                    className={"td-card-qa " + tipProps(label).className}
                    onClick={() => {
                      setExpanded(false);
                      onQuickAction(field, itemId!);
                    }}
                  >
                    {/* Status shows the glyph of the list the item is in (the Move to list that is checked) */}
                    <Icon name={field === "status" ? (moveOptions?.find((o) => o.checked)?.icon ?? icon) : icon} size={14} />
                  </button>
                ))
              : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
