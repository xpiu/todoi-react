// ItemCard — a board item: optional cover, title (green check when done), compact labels, a badge row
// (description, due, repeat, subitems progress, attachments, priority, avatars) with the mono key
// pinned right, and a hover ⋯ menu. Spec: DESIGN.md › Board, Item keys.
import { Fragment, useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type SyntheticEvent } from "react";

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
import type { QuickField } from "../core/itemFields";
import { quickEditId } from "./CardQuickEdit";
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

/** The quick actions in the row the ⋯ menu expands under a card (Design: ItemCard): each opens that field's picker at the icon (CardQuickEdit) */
const QUICK_ACTIONS: ReadonlyArray<["clock" | "calendar" | "users" | "tag" | "flag" | "circle-dot", string, QuickField, "dialog" | "listbox"]> = [
  ["clock", "Due date", "due", "dialog"],
  ["calendar", "Start date", "start", "dialog"],
  ["users", "Assignees", "assignees", "dialog"],
  ["tag", "Labels", "labels", "dialog"],
  ["flag", "Priority", "priority", "listbox"],
  ["circle-dot", "Status", "status", "listbox"],
];
/** Badges that pop in once when their value changes during a quick edit */
type PopKey = "status" | "due" | "priority" | "assignees" | "labels";

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
  /** The item holds subitems (anywhere): "Make subitem of…" is then unavailable. Defaults to the checklist badge's total */
  hasSubitems?: boolean;
  /** "Aug 12": shown in the details row the ⋯ menu expands */
  created?: string;
  /**
   * A details-row quick action (Due date, Start date, Assignees, Labels, Priority, Status), or a click on the due pill
   * ("badge"): open that field's picker at `anchor`. Without it the row has no buttons and the pill is plain text.
   */
  onQuickAction?: (field: QuickField, anchor: HTMLElement, source: "icon" | "badge") => void;
  /** The field whose quick picker is open on this card: the card keeps its ring and that icon reads pressed */
  activeQuickAction?: QuickField | null;
  /** Where the open picker hangs: "badge" (the due pill) leaves the details row as it is and presses no icon @default "icon" */
  quickActionAnchor?: "icon" | "badge";
  /** Hold the details row open (the board keeps it after a pick, so the next icon is one Tab away) */
  detailsOpen?: boolean;
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

export function ItemCard({ title, itemId, pendingId = false, showId = true, labels = [], done, due, dueState = "default", repeat, badges = {}, cover, status, priority, assignees = [], selected, dragId, onClick, onMenuAction, moveOptions, hasSubitems, created, onQuickAction, activeQuickAction, quickActionAnchor = "icon", detailsOpen, style }: ItemCardProps) {
  // The ⋯ menu's drill view (as the overlay ⋯ drills into Export): Move to › a list or another project
  const [menuView, setMenuView] = useState<"main" | "move">("main");
  // Opening the ⋯ menu also expands the details row under the card (Design: ItemCard). Closing the menu collapses it,
  // unless the press that closed it landed in the row (a quick action collapses it itself) or Tab left the menu: the
  // row's first quick action is then the next stop, and the row stays until focus leaves the card.
  const [expanded, setExpanded] = useState(false);
  // Controlled so the keyboard can open it: Shift+F10 or the menu key on the focused card (DESIGN › Keyboard)
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const menuOpen = useRef(false);
  const pressInRow = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
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
  /** One floating surface at a time: a quick action closes the ⋯ menu (the board holds the row open through activeQuickAction) */
  const quickAction = (field: QuickField, anchor: HTMLElement, source: "icon" | "badge") => {
    menuOpen.current = false;
    setMenuIsOpen(false);
    setMenuView("main");
    setExpanded(false);
    onQuickAction?.(field, anchor, source);
  };
  // A picker opened from the due pill hangs off the pill: no icon is pressed and the row stays as it is
  const fromBadge = quickActionAnchor === "badge" && activeQuickAction === "due";
  const pressed = fromBadge ? null : (activeQuickAction ?? null);
  const rowOpen = expanded || !!detailsOpen || !!pressed;
  const popupId = dragId ? quickEditId(dragId) : undefined;
  // A badge whose value changes during a quick edit pops in once (.td-card-pop)
  const sigKey = JSON.stringify({
    status: typeof status === "string" ? status : (status?.name ?? ""),
    due: due ?? "",
    priority: priority ?? "",
    assignees: assignees.map((a) => personOf(a).name).join("|"),
    labels: labels.map((l) => (typeof l === "string" ? l : (l.text ?? l.color))).join("|"),
  } satisfies Record<PopKey, string>);
  const seen = useRef<{ sig: Record<PopKey, string>; quick: boolean } | null>(null);
  const editing = !!activeQuickAction || !!detailsOpen;
  useEffect(() => {
    const sig = JSON.parse(sigKey) as Record<PopKey, string>;
    const prev = seen.current;
    seen.current = { sig, quick: editing };
    if (!prev || !(editing || prev.quick)) return;
    const card = cardRef.current;
    for (const k of Object.keys(sig) as PopKey[]) {
      if (prev.sig[k] === sig[k]) continue;
      const before = new Set(prev.sig[k].split("|"));
      const targets = k === "labels" ? [...(card?.querySelectorAll<HTMLElement>(".td-card-labels > [data-pop-label]") ?? [])].filter((el) => !before.has(el.dataset.popLabel!)) : [card?.querySelector<HTMLElement>(`[data-pop="${k}"]`)];
      for (const el of targets) {
        if (!el) continue;
        el.classList.remove("td-card-pop");
        void el.offsetWidth;
        el.classList.add("td-card-pop");
      }
    }
  }, [sigKey, editing]);
  // Items hold subitems, subitems hold nothing: an item with subitems can't become one (the row says why)
  const subitemBlocked = hasSubitems ?? !!badges.checklist?.total;
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
      className={"td-card" + (selected ? " is-selected" : "") + (activeQuickAction ? " is-quickedit" : "")}
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
        } else if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && itemId && onMenuAction && e.target === e.currentTarget) {
          e.preventDefault();
          setMenuIsOpen(true);
          if (hasDetails) onMenuOpenChange(true);
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
              <LabelChip key={l.text ?? i} color={l.color} text={l.text} size="sm" data-pop-label={l.text ?? l.color} />
            ))}
            {keyInLabels ? <ItemKey itemId={itemId} /> : null}
          </div>
        ) : null}
        {hasBadges ? (
          <div className="td-card-badges">
            {status ? <StatusChip status={status} data-pop="status" /> : null}
            {badges.description ? (
              <span className="td-card-badge" title="This item has a description">
                <Icon name="align-left" size={14} />
              </span>
            ) : null}
            {due ? (
              <DueDatePill
                date={due}
                state={dueState}
                className={"td-card-due" + (onQuickAction && itemId ? " is-action" : "")}
                data-pop="due"
                // One click on the date opens the dates picker right at the pill; the card body still opens the overlay.
                // The keyboard path is Shift+D on the card (a button inside a listitem would add a Tab stop per card).
                {...(onQuickAction && itemId
                  ? {
                      role: "button",
                      label: "Due date",
                      "aria-haspopup": "dialog" as const,
                      "aria-expanded": fromBadge,
                      "aria-controls": fromBadge ? popupId : undefined,
                      onClick: (e: MouseEvent<HTMLElement>) => {
                        e.stopPropagation();
                        quickAction("due", e.currentTarget, "badge");
                      },
                    }
                  : null)}
              />
            ) : null}
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
              <span className="td-card-badge" data-pop="priority" data-priority={priority.toLowerCase()} title={`Priority: ${priority}`}>
                <Icon name="flag" size={14} color={PRIORITY_COLORS[priority]} style={{ fill: PRIORITY_COLORS[priority] }} />
                <span className="td-prio-text">{priority}</span>
              </span>
            ) : null}
            {assignees.length ? (
              <span className="td-card-avatars" data-pop="assignees" title={assignees.map((a) => personOf(a).name).join(", ")}>
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
            width={menuView === "main" ? (subitemBlocked ? 252 : 184) : 224}
            open={menuIsOpen}
            onOpenChange={(open, reason) => {
              setMenuIsOpen(open);
              if (!open) setMenuView("main");
              if (hasDetails) onMenuOpenChange(open, reason);
            }}
            shouldClose={shouldClose}
            trigger={<button ref={moreRef} {...MORE_TIP} className={"td-card-more " + MORE_TIP.className} type="button" aria-label="Item options"><Icon name="ellipsis" size={14} /></button>}
          >
            <div className="td-card-menu-body" onKeyDown={onMenuKey}>
            {menuView === "move" && moveOptions ? (
              <MenuGroup>
                <MenuDrillHead title="Move to" onBack={() => setMenuView("main")} />
                {moveOptions.map((o, i) =>
                  o.divider ? (
                    <MenuDivider key={`d${i}`} />
                  ) : (
                    <MenuItem key={o.value ?? i} icon={o.icon} iconColor={o.iconColor} checked={o.checked} onSelect={() => o.value && !o.checked && onMenuAction("Move to", itemId, o.value)}>
                      {o.label}
                    </MenuItem>
                  ),
                )}
              </MenuGroup>
            ) : (
              MENU_ITEMS.map(([icon, label]) => {
                const drillTo = label === "Move to" && moveOptions ? "move" : null;
                const blocked = label === "Make subitem of" && subitemBlocked;
                return (
                  <Fragment key={label}>
                    {label === "Delete" ? <MenuDivider /> : null}
                    <MenuItem icon={icon} danger={label === "Delete"} drill={!!drillTo} disabled={blocked} trailing={blocked ? "has subitems" : undefined} onSelect={() => (drillTo ? setMenuView(drillTo) : onMenuAction(label, itemId))}>
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
        <div ref={rowRef} className="td-card-details" data-expanded={rowOpen ? "true" : undefined} inert={!rowOpen}>
          <div
            className="td-card-meta"
            role="group"
            aria-label="Item details"
            onPointerDown={() => (pressInRow.current = true)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                // The row turns inert as it collapses: hand focus to the ⋯ first
                moreRef.current?.focus();
                setExpanded(false);
              }
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
              ? QUICK_ACTIONS.map(([icon, label, field, popup]) => {
                  const on = pressed === field;
                  return (
                    <button
                      key={field}
                      type="button"
                      aria-label={label}
                      aria-haspopup={popup}
                      aria-expanded={on}
                      aria-controls={on ? popupId : undefined}
                      data-field={field}
                      {...tipProps(label)}
                      className={"td-card-qa " + tipProps(label).className}
                      onClick={(e) => quickAction(field, e.currentTarget, "icon")}
                    >
                      {/* Status shows the glyph of the list the item is in (the Move to list that is checked) */}
                      <Icon name={field === "status" ? (moveOptions?.find((o) => o.checked)?.icon ?? icon) : icon} size={14} />
                    </button>
                  );
                })
              : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
