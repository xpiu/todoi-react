// Group by (List view) over the API's items — the app side of Design's ViewControls `groupItems` / `dueBucket`. Pure:
// the List view groups with it and the toolbar's Group menu counts its groups. Group ids are stable ids (Status,
// priority, member and label ids, Due buckets), never display names. Spec: DESIGN.md › Group by.
import type { GroupKey, ItemPriority } from "../../shared/enums";
import type { Item, Label } from "../data/api";
import type { IconName } from "../design/core/Icon";
import { PRIORITY_COLORS } from "../design/core/priorities";
import { STATUSES, statusById } from "../design/core/statuses";
import type { ItemGroup } from "../design/list/ListGroups";
import { itemStatusId, weekRange } from "./filters";
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
