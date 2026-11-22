// CardQuickEdit — the Board's inline quick pickers: one per board, it mounts DatesPicker / MemberPicker /
// LabelPicker / Select in their triggerless form at a card's quick-action icon (or its due pill), so the
// board stays in view. Owns the labels / assignees session: every toggle saves at once, and ONE summary
// (before → after) goes out when the picker closes, for one Undo. Owns no data.
// Spec: DESIGN.md › Board › Quick edit (Design: board/CardQuickEdit).
import { useEffect, useRef, useState, type RefObject } from "react";

import type { ItemPriority } from "../../../shared/enums";
import type { ItemStatus } from "../../../shared/item-status";
import { DatesPicker, type DatesValue } from "../core/DatesPicker";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, priorityOf, priorityValue, statusMovesItem, statusPick, statusValue, type QuickField, type StatusList } from "../core/itemFields";
import { LabelPicker, type LabelDraft, type PickableLabel } from "../core/LabelPicker";
import { MemberPicker, type PickableMember } from "../core/MemberPicker";
import type { PopoverCloseReason } from "../core/Popover";
import { Select } from "../core/Select";

/** The id the open picker carries, so the pressed icon's aria-controls and the picker agree */
export const quickEditId = (id: string) => `td-cqe-${id.replace(/[^\w-]/g, "_")}`;

export const QUICK_FIELD_LABEL: Record<QuickField, string> = { due: "Due date", start: "Start date", assignees: "Assignees", labels: "Labels", priority: "Priority", status: "Status" };

export interface QuickEditItem {
  id: string;
  /** "TD-12": names the picker for assistive tech */
  itemId?: string;
  title: string;
  listId: string;
  start: string | null;
  due: string | null;
  time: string | null;
  labelIds: string[];
  assigneeIds: string[];
  priority: ItemPriority | null;
  status: ItemStatus | null;
  done: boolean;
  /** Repeats with a due date: Done completes the occurrence instead of moving the item */
  recurring: boolean;
}

export interface CardQuickEditProps {
  field: QuickField;
  /** The quick-action icon or due pill the picker hangs off */
  anchorRef: RefObject<HTMLElement | null>;
  item: QuickEditItem;
  labels: ReadonlyArray<PickableLabel>;
  members: ReadonlyArray<PickableMember>;
  /** The project's lists with their Status roles: in a linked project a Status pick is a move */
  lists: ReadonlyArray<StatusList>;
  linkStatuses?: boolean;
  today?: string;
  onClose: (reason?: PopoverCloseReason) => void;
  onSetDates: (id: string, next: DatesValue, prev: DatesValue) => void;
  onSetPriority: (id: string, next: ItemPriority | null, prev: ItemPriority | null) => void;
  onSetStatus: (id: string, next: ItemStatus | null, prev: ItemStatus | null) => void;
  onMoveToList: (id: string, listId: string) => void;
  /** Every toggle, saved at once */
  onSetLabels: (id: string, labelIds: string[]) => void;
  onSetAssignees: (id: string, userIds: string[]) => void;
  /** Once per labels / assignees session, when the picker closes, if the set changed */
  onSessionEnd: (id: string, field: "labels" | "assignees", before: string[], after: string[]) => void;
  onCreateLabel?: (draft: LabelDraft) => Promise<PickableLabel | void> | void;
  onEditLabel?: (label: PickableLabel, draft: LabelDraft) => void;
  onDeleteLabel?: (label: PickableLabel) => void;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function CardQuickEdit({ field, anchorRef, item, labels, members, lists, linkStatuses, today, onClose, onSetDates, onSetPriority, onSetStatus, onMoveToList, onSetLabels, onSetAssignees, onSessionEnd, onCreateLabel, onEditLabel, onDeleteLabel }: CardQuickEditProps) {
  const id = item.id;
  // The multi-select session: the set when the picker opened, and the set now (null: untouched).
  const [before] = useState(() => (field === "labels" ? item.labelIds : item.assigneeIds));
  const now = useRef<string[] | null>(null);
  const done = useRef(false);
  const end = useRef(onSessionEnd);
  useEffect(() => {
    end.current = onSessionEnd;
  });
  /** The summary, once, and only when the set changed (a no-change pass leaves it armed, as StrictMode's test unmount does) */
  const finish = () => {
    const after = now.current;
    if (done.current || !after || (field !== "labels" && field !== "assignees") || sameSet(before, after)) return;
    done.current = true;
    end.current(id, field, before, after);
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => () => finishRef.current(), []);
  const close = (reason?: PopoverCloseReason) => {
    finish();
    onClose(reason);
  };

  const common = {
    open: true,
    anchorRef,
    onOpenChange: (open: boolean, reason?: PopoverCloseReason) => {
      if (!open) close(reason);
    },
    placement: "bottom-start" as const,
    tier: "detached" as const,
    id: quickEditId(id),
    "aria-label": `${QUICK_FIELD_LABEL[field]} for ${item.itemId ?? item.title}`,
  };

  if (field === "due" || field === "start") {
    const prev: DatesValue = { start: item.start, due: item.due, time: item.time };
    return (
      <DatesPicker
        {...common}
        sheet="auto"
        defaultField={field}
        start={prev.start}
        due={prev.due}
        time={prev.time}
        today={today}
        onChange={(next) => {
          if (next.start !== prev.start || next.due !== prev.due || next.time !== prev.time) onSetDates(id, next, prev);
          close("select");
        }}
      />
    );
  }
  if (field === "priority") {
    return <Select {...common} value={priorityValue(item.priority)} width={184} placeholder="Priority" options={PRIORITY_OPTIONS} onChange={(v) => onSetPriority(id, priorityOf(v), item.priority)} />;
  }
  if (field === "status") {
    const movesItem = statusMovesItem(lists, linkStatuses, item.listId);
    return (
      <Select
        {...common}
        value={statusValue(item.status, item.done)}
        width={200}
        placeholder="Status"
        options={STATUS_OPTIONS}
        onChange={(v) => {
          const pick = statusPick(v, { lists, movesItem, listId: item.listId, recurring: item.recurring });
          if ("moveTo" in pick) onMoveToList(id, pick.moveTo);
          else onSetStatus(id, pick.status, item.status);
        }}
      />
    );
  }
  if (field === "labels") {
    return (
      <LabelPicker
        {...common}
        labels={labels}
        value={item.labelIds}
        onCreateLabel={onCreateLabel}
        onEditLabel={onEditLabel}
        onDeleteLabel={onDeleteLabel}
        onChange={(ids) => {
          now.current = ids;
          onSetLabels(id, ids);
        }}
      />
    );
  }
  return (
    <MemberPicker
      {...common}
      members={members}
      value={item.assigneeIds}
      onChange={(ids) => {
        now.current = ids;
        onSetAssignees(id, ids);
      }}
    />
  );
}
