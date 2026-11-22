// The Priority and Status pickers' options and the linked-Status rule, shared by the item overlay's rail
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

/** Linked project: every list carries its own Status role, so Status stands in for the List field (a pick moves the item). */
export function statusMovesItem(lists: ReadonlyArray<StatusList>, linkStatuses: boolean | undefined, listId: string) {
  const roles = lists.map((l) => l.statusRole ?? null);
  return !!linkStatuses && roles.length > 0 && roles.every(Boolean) && new Set(roles).size === roles.length && lists.some((l) => l.id === listId);
}

/**
 * What a Status pick does: a move to the list with that role (linked projects), or a Status edit.
 * A recurring item set to Done completes its occurrence instead, and stays in its list.
 */
export function statusPick(v: string, o: { lists: ReadonlyArray<StatusList>; movesItem: boolean; listId: string; recurring: boolean }): { moveTo: string } | { status: ItemStatus | null } {
  const dest = o.movesItem && v !== NO_VALUE ? o.lists.find((l) => l.statusRole === v) : null;
  if (dest && dest.id !== o.listId && !(v === "DONE" && o.recurring)) return { moveTo: dest.id };
  return { status: v === NO_VALUE ? null : (v as ItemStatus) };
}
