// Group by (List view) over the API's items — the app side of Design's ViewControls `groupItems` / `groupDrop` /
// `dueBucket`. Pure: the List view groups with it, the grouping controls in Sort counts its groups, and a drop or
// Ctrl/Cmd+Shift+↑↓ between groups asks `groupDrop` what changes. Group ids are stable ids (Status,
// priority, member and label ids, Due buckets), never display names. Spec: DESIGN.md › Group by.
import type { GroupKey, ItemPriority } from "../../shared/enums";
import type { ItemStatus } from "../../shared/item-status";
import type { Item, Label } from "../data/api";
import type { IconName } from "../design/core/Icon";
import { PRIORITY_COLORS } from "../design/core/priorities";
import { STATUSES, statusById } from "../design/core/statuses";
import type { ItemGroup } from "../design/list/ListGroups";
import { addedHiddenNotice, itemStatusId, weekRange } from "./filters";
import { avatarColorVar, PRIORITY_LABEL, type Person } from "./items";

/** The group for items without a value: No status, No priority, Unassigned, No label */
export const GROUP_NONE = "__none";

interface GroupDef {
  id: string;
  label: string;
  icon?: IconName;
  iconColor?: string;
  accepts: boolean;
  refuse?: string;
  /** Shown only while it holds items, even with "Show empty groups" */
  onlyWhenFilled?: boolean;
}

/** Due groups. A group takes a drop only when it stands for one value: Today sets the date, No date clears it. */
export const DUE_GROUPS: ReadonlyArray<GroupDef> = [
  { id: "overdue", label: "Overdue", icon: "clock", iconColor: "var(--danger)", accepts: false, refuse: "Overdue is not a date. Open the item to change its date." },
  { id: "today", label: "Today", icon: "calendar-check", accepts: true },
  { id: "week", label: "This week", icon: "calendar-range", accepts: false, refuse: "This week covers several days. Open the item to pick a date." },
  { id: "later", label: "Later", icon: "calendar", accepts: false, refuse: "Later covers many days. Open the item to pick a date." },
  { id: "none", label: "No date", icon: "calendar-off", accepts: true },
  { id: "earlier", label: "Earlier", icon: "circle-check", accepts: false, refuse: "Earlier holds done items. Open the item to change its date.", onlyWhenFilled: true },
];
const NO_STATUS_REFUSAL = "Every item needs a status. Drop it on a status instead.";

/** One Due bucket per item: overdue (before today, not done) · today · week (after today, up to Sunday) · later · none · earlier (before today, done) */
export function dueBucket(due: string | null, done: boolean, today: string): string {
  if (!due) return "none";
  if (due < today) return done ? "earlier" : "overdue";
  if (due === today) return "today";
  return due <= weekRange(today).end ? "week" : "later";
}

export interface GroupContext {
  /** ISO day (`useToday`: the person's time zone) */
  today: string;
  labels: Label[];
  /** The project's members, in roster order */
  people: Person[];
  /** Keep groups without items */
  showEmpty?: boolean;
}

/**
 * The groups for `key`, in display order, each holding its items in the order they came in (the host sorts first). An item
 * with two labels or two assignees sits in both groups. Groups without items show only with `showEmpty`.
 */
export function groupItems<T extends Item>(items: T[], key: GroupKey, ctx: GroupContext): Array<ItemGroup<T>> {
  const defs: Array<ItemGroup<T> & { onlyWhenFilled?: boolean }> = [];
  const add = (d: Omit<ItemGroup<T>, "items" | "accepts"> & { accepts?: boolean; refuse?: string; onlyWhenFilled?: boolean }) => defs.push({ accepts: true, ...d, items: [] });
  if (key === "status") {
    for (const s of STATUSES) add({ id: s.id, label: s.name, icon: s.icon, iconColor: s.color });
    add({ id: GROUP_NONE, label: "No status", icon: "circle", accepts: false, refuse: NO_STATUS_REFUSAL, onlyWhenFilled: true });
  } else if (key === "priority") {
    for (const p of Object.keys(PRIORITY_LABEL) as ItemPriority[]) add({ id: p, label: PRIORITY_LABEL[p], icon: "flag", iconColor: PRIORITY_COLORS[PRIORITY_LABEL[p]] });
    add({ id: GROUP_NONE, label: "No priority", icon: "flag-off" });
  } else if (key === "assignee") {
    for (const p of ctx.people) add({ id: p.id, label: p.name, avatar: { name: p.name, src: p.image ?? undefined, color: avatarColorVar(p.avatarColor) } });
    add({ id: GROUP_NONE, label: "Unassigned", icon: "user-x" });
  } else if (key === "label") {
    for (const l of ctx.labels) add({ id: l.id, label: l.name, color: `var(--label-${l.color})` });
    add({ id: GROUP_NONE, label: "No label", icon: "tag" });
  } else for (const g of DUE_GROUPS) add({ ...g });
  const byId = new Map(defs.map((d) => [d.id, d]));
  // A value outside the roster (a former member, a label id the cache doesn't know yet) still gets its group, before the "none" one.
  const at = (id: string, label: () => string) => {
    let g = byId.get(id);
    if (!g) {
      g = { id, label: label(), icon: key === "assignee" ? "user" : key === "label" ? "tag" : "circle", accepts: true, items: [] };
      const none = defs.findIndex((d) => d.id === GROUP_NONE);
      defs.splice(none < 0 ? defs.length : none, 0, g);
      byId.set(id, g);
    }
    return g;
  };
  for (const it of items) {
    if (key === "status") {
      const s = itemStatusId(it);
      at(s ?? GROUP_NONE, () => statusById(s)?.name ?? String(s)).items.push(it);
    } else if (key === "priority") at(it.priority ?? GROUP_NONE, () => String(it.priority)).items.push(it);
    else if (key === "assignee") for (const id of it.assigneeIds.length ? it.assigneeIds : [GROUP_NONE]) at(id, () => "Former member").items.push(it);
    else if (key === "label") for (const id of it.labelIds.length ? it.labelIds : [GROUP_NONE]) at(id, () => "Unknown label").items.push(it);
    else at(dueBucket(it.dueDate, it.done, ctx.today), () => "").items.push(it);
  }
  return defs.filter((d) => d.items.length || (ctx.showEmpty && !d.onlyWhenFilled)).map(({ onlyWhenFilled: _only, ...g }) => g);
}

/** The one field a move between groups changes */
export type GroupPatch = { status: ItemStatus } | { priority: ItemPriority | null } | { assigneeIds: string[] } | { labelIds: string[] } | { dueDate: string | null };
export type GroupDropResult = { ok: true; patch: GroupPatch; message: string } | { ok: false; reason: string | null };

/**
 * What moving `item` from one group to another does (Design: ViewControls groupDrop). Status sets the status (No status
 * refuses); Priority sets it, No priority clears it; Assignee and Label swap the source group's value for the target's
 * and keep the item's other values (Unassigned / No label remove the source value); Due: Today sets today, No date
 * clears the date, the range groups refuse with their reason.
 */
export function groupDrop(key: GroupKey, item: Pick<Item, "assigneeIds" | "labelIds">, fromId: string | null, toId: string | null, ctx: Pick<GroupContext, "today" | "labels" | "people">): GroupDropResult {
  if (!toId || fromId === toId) return { ok: false, reason: null };
  const none = toId === GROUP_NONE;
  if (key === "status") {
    const s = statusById(toId);
    return none || !s ? { ok: false, reason: NO_STATUS_REFUSAL } : { ok: true, patch: { status: s.id }, message: `Status set to ${s.name}` };
  }
  if (key === "priority") {
    if (none) return { ok: true, patch: { priority: null }, message: "Priority cleared" };
    const p = toId as ItemPriority;
    return PRIORITY_LABEL[p] ? { ok: true, patch: { priority: p }, message: `Priority set to ${PRIORITY_LABEL[p]}` } : { ok: false, reason: null };
  }
  if (key === "assignee" || key === "label") {
    const cur = key === "assignee" ? item.assigneeIds : item.labelIds;
    const rest = cur.filter((v) => v !== fromId && v !== toId);
    const next = none ? rest : [...rest, toId];
    const nameOf = (id: string | null) => (key === "assignee" ? ctx.people.find((p) => p.id === id)?.name : ctx.labels.find((l) => l.id === id)?.name) ?? "";
    const message = none ? (next.length ? `Removed ${key === "label" ? "label " : ""}${nameOf(fromId)}` : key === "assignee" ? "Unassigned" : "Labels removed") : key === "assignee" ? `Assigned to ${nameOf(toId)}` : `Label set to ${nameOf(toId)}`;
    return { ok: true, patch: key === "assignee" ? { assigneeIds: next } : { labelIds: next }, message };
  }
  const g = DUE_GROUPS.find((x) => x.id === toId);
  if (!g || !g.accepts) return { ok: false, reason: g?.refuse ?? "Can't drop here." };
  return toId === "today" ? { ok: true, patch: { dueDate: ctx.today }, message: "Due date set to today" } : { ok: true, patch: { dueDate: null }, message: "Due date cleared" };
}

/**
 * What an item added in a group starts with (Group by quick-add): the group's one value — a Status, a priority, the member
 * or label, today as the due date. The No-value groups add plain (No priority also keeps Settings › Default priority off,
 * so the item lands where it was added). Null when the group can't take a value: the range Due groups, No status, and a
 * former member's or unknown label's group. The same rules as a drop onto the group, from an item with no value.
 */
export function groupPreset(key: GroupKey, groupId: string, ctx: Pick<GroupContext, "today" | "labels" | "people">): GroupPatch | null {
  const known = groupId === GROUP_NONE || (key === "assignee" ? ctx.people.some((p) => p.id === groupId) : key === "label" ? ctx.labels.some((l) => l.id === groupId) : true);
  const r = known ? groupDrop(key, { assigneeIds: [], labelIds: [] }, null, groupId, ctx) : null;
  return r?.ok ? r.patch : null;
}

/**
 * What to say after a quick-add in a group (decision R3, the inline-creation convention of Notion, Asana and Linear):
 * nothing (null) when the new item shows in the group it was typed in, open. Otherwise one toast-worthy line: `hidden`
 * (why the view leaves it out: filters, completed items, a hidden list), or "Added to <group>" when a typed token put it
 * in another group, or its group is collapsed.
 */
export function groupAddNotice(item: Item, key: GroupKey, typedIn: string, view: { ctx: GroupContext; collapsed: readonly string[]; hidden: string | null }): string | null {
  if (view.hidden) return addedHiddenNotice(view.hidden);
  const landed = groupItems([item], key, { ...view.ctx, showEmpty: false });
  if (landed.some((g) => g.id === typedIn && !view.collapsed.includes(g.id))) return null;
  return `Added to ${(landed.find((g) => g.id === typedIn) ?? landed[0])?.label ?? "the project"}`;
}

/** The fields a quick-add sends besides its title and list */
export interface AddedFields {
  priority?: ItemPriority | null;
  dueDate?: string;
  labelIds: string[];
  assigneeIds: string[];
}

/**
 * A quick-add's fields with its group's preset: what was typed wins for one value (`!priority` — `typedPriority` — and a
 * due date), labels and assignees add up. The Status preset is the caller's (it can pick the list).
 */
export function withPreset(fields: AddedFields, preset: GroupPatch | null | undefined, typedPriority: boolean): AddedFields {
  if (!preset) return fields;
  if ("priority" in preset) return typedPriority ? fields : { ...fields, priority: preset.priority };
  if ("dueDate" in preset) return { ...fields, dueDate: fields.dueDate ?? preset.dueDate ?? undefined };
  if ("labelIds" in preset) return { ...fields, labelIds: [...new Set([...preset.labelIds, ...fields.labelIds])] };
  if ("assigneeIds" in preset) return { ...fields, assigneeIds: [...new Set([...preset.assigneeIds, ...fields.assigneeIds])] };
  return fields;
}
