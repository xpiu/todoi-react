// The Priority and Status pickers' options and the "Status follows List" rule, shared by the item overlay's rail
// and the Board card's quick pickers (CardQuickEdit) so both edit an item the same way.
// Spec: DESIGN.md › Item editing · Statuses.
import type { ItemPriority } from "../../../shared/enums";
import type { ItemStatus } from "../../../shared/item-status";
import type { IconName } from "./Icon";
import type { SelectOption } from "./Select";
import { STATUSES } from "./statuses";

/** The fields a Board card's quick actions edit (its details row, CardQuickEdit) */
export type QuickField = "due" | "start" | "assignees" | "labels" | "priority" | "status";

/** The Select value for "no priority" / "no Status" */
export const NO_VALUE = "__none";

const PRIORITY_DEFS: ReadonlyArray<{ value: ItemPriority; label: string; color: string }> = [
  { value: "URGENT", label: "Urgent", color: "var(--label-red)" },
  { value: "HIGH", label: "High", color: "var(--label-orange)" },
  { value: "MEDIUM", label: "Medium", color: "var(--label-yellow)" },
  { value: "LOW", label: "Low", color: "var(--label-blue)" },
];

export const PRIORITY_OPTIONS: ReadonlyArray<SelectOption<string>> = [...PRIORITY_DEFS.map((p) => ({ value: p.value as string, label: p.label, icon: "flag" as IconName, iconColor: p.color })), { value: NO_VALUE, label: "No priority", icon: "flag-off" as IconName }];

export const STATUS_OPTIONS: ReadonlyArray<SelectOption<string>> = [{ value: NO_VALUE, label: "None", icon: "circle-off" as IconName }, ...STATUSES.map((s) => ({ value: s.id as string, label: s.name, icon: s.icon, iconColor: s.color }))];

/** The Priority Select's value for an item */
export const priorityValue = (p: ItemPriority | null | undefined) => p ?? NO_VALUE;
export const priorityOf = (v: string): ItemPriority | null => (v === NO_VALUE ? null : (v as ItemPriority));
/** The Status Select's value for an item: a done item without a Status reads Done */
export const statusValue = (status: ItemStatus | null | undefined, done: boolean) => status ?? (done ? "DONE" : NO_VALUE);

export interface StatusList {
  id: string;
  statusRole?: ItemStatus | null;
}

/**
 * "Status follows List" (DESIGN.md › Statuses): the list sets the Status, and a Status pick never moves an item.
 * "locked" when the project has it on, the item's list is offered (not a hidden list or the Inbox), has a role, and the
 * item's Status is that role: the picker opens, but only to point at the List field. "hidden" when, on top of that,
 * every offered list has a role: the List field stands for both. "free" otherwise — off, a list without a role, or a
 * Status that differs from the role (a checked item, a role changed with "Future moves only"): editable, the item stays.
 */
export type StatusLock = "free" | "locked" | "hidden";

export function statusLock(lists: ReadonlyArray<StatusList>, linkStatuses: boolean | undefined, item: { listId: string; status: ItemStatus | null }): StatusLock {
  const role = linkStatuses ? lists.find((l) => l.id === item.listId)?.statusRole : null;
  if (!role || item.status !== role) return "free";
  return lists.every((l) => l.statusRole) ? "hidden" : "locked";
}

/** A locked Status picker's options: the item's own Status, every other one disabled */
export const lockedStatusOptions = (value: string) => STATUS_OPTIONS.map((o) => (o.value === value ? o : { ...o, disabled: true }));

/** Whether a Status drop in Group by Status (or a quick-add in a Status group) is a move: on, and the item's list offered */
export function statusMovesItem(lists: ReadonlyArray<StatusList>, linkStatuses: boolean | undefined, listId: string) {
  return !!linkStatuses && lists.some((l) => l.id === listId);
}

/**
 * What a Status drop in Group by Status does: a drag is a move, so in a project with "Status follows List" on it moves
 * the item to the first list (board order) with that role; otherwise a Status edit. It stays a Status edit, and the item
 * stays, when its own list already has that role (two lists sharing one), when no list carries it, for None, and for
 * Done on a recurring item, which completes its occurrence instead. Pickers never move an item: see statusLock.
 */
export function statusPick(v: string, o: { lists: ReadonlyArray<StatusList>; movesItem: boolean; listId: string; recurring: boolean }): { moveTo: string } | { status: ItemStatus | null } {
  const here = o.lists.find((l) => l.id === o.listId)?.statusRole;
  const dest = o.movesItem && v !== NO_VALUE && here !== v ? o.lists.find((l) => l.statusRole === v) : null;
  if (dest && dest.id !== o.listId && !(v === "DONE" && o.recurring)) return { moveTo: dest.id };
  return { status: v === NO_VALUE ? null : (v as ItemStatus) };
}
