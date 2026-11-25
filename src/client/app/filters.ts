// Filters and sort for a project's views — pure functions over the API's Item shape so List, Board
// and Calendar share one model, and the URL (`f`, `s`) can reproduce it. Spec: DESIGN.md › Filtering.
import { parseDateValue, shiftISO } from "../../shared/dates";
import type { ItemPriority } from "../../shared/enums";
import type { Item, Label } from "../data/api";
import type { IconName } from "../design/core/Icon";
import { PRIORITY_COLORS } from "../design/core/priorities";
import { STATUSES } from "../design/core/statuses";
import type { SortSpec, ViewFilter } from "../design/navigation/viewState";
import { PRIORITY_LABEL, type Person } from "./items";

export interface FilterOption extends ViewFilter {
  /** Label swatch */
  color?: string;
  icon?: IconName;
  iconColor?: string;
}

export const FILTER_SECTIONS: ReadonlyArray<[label: string, type: string]> = [
  ["Labels", "label"],
  ["Assignee", "assignee"],
  ["Due date", "due"],
  ["Created date", "created"],
  ["Start date", "start"],
  ["Priority", "priority"],
  ["Status", "status"],
];

/** Monday and Sunday (ISO days) of the week holding `today`. */
export function weekRange(today: string): { start: string; end: string } {
  const back = (parseDateValue(today)!.getDay() + 6) % 7;
  return { start: shiftISO(today, -back)!, end: shiftISO(today, 6 - back)! };
}

/** The Due filter's values (Design: ViewControls DUE_FILTERS); they OR together like every other type. `today` is the
 * person's day (Settings › General › Time zone, `useToday`). */
export const DUE_FILTERS: ReadonlyArray<{ value: string; icon: IconName; test: (due: string | null, done: boolean, today: string) => boolean }> = [
  { value: "Overdue", icon: "clock", test: (due, done, today) => !!due && !done && due < today },
  { value: "Today", icon: "calendar-check", test: (due, _done, today) => due === today },
  {
    value: "This week",
    icon: "calendar-range",
    test: (due, _done, today) => {
      if (!due) return false;
      const w = weekRange(today);
      return due >= w.start && due <= w.end;
    },
  },
  { value: "No date", icon: "calendar-off", test: (due) => !due },
];

/** Does an item's due date match any of the picked Due values? */
export const matchesDue = (values: string[], it: Pick<Item, "dueDate" | "done">, today: string) => values.some((v) => DUE_FILTERS.find((f) => f.value === v)?.test(it.dueDate, it.done, today) ?? false);

/** Every filter the menu offers for this project. */
export function availableFilters(labels: Label[], people: Person[]): FilterOption[] {
  return [
    ...labels.map((l) => ({ type: "label", value: l.name, color: `var(--label-${l.color})` })),
    ...people.map((p) => ({ type: "assignee", value: p.name, icon: "user" as const })),
    { type: "assignee", value: "Unassigned", icon: "user-x" },
    ...DUE_FILTERS.map((f) => ({ type: "due", value: f.value, icon: f.icon })),
    { type: "created", value: "Last 7 days", icon: "calendar" },
    { type: "created", value: "Last 30 days", icon: "calendar" },
    { type: "created", value: "Older", icon: "calendar" },
    { type: "start", value: "Last 7 days", icon: "calendar" },
    { type: "start", value: "Last 30 days", icon: "calendar" },
    { type: "start", value: "No start date", icon: "calendar-off" },
    ...(Object.keys(PRIORITY_LABEL) as ItemPriority[]).map((p) => ({ type: "priority", value: PRIORITY_LABEL[p], icon: "flag" as const, iconColor: PRIORITY_COLORS[PRIORITY_LABEL[p]] })),
    { type: "priority", value: "None", icon: "flag-off" },
    ...STATUSES.map((s) => ({ type: "status", value: s.name, icon: s.icon })),
  ];
}

export const filterKey = (f: ViewFilter) => `${f.type}:${f.value}`;
export const sameFilter = (a: ViewFilter, b: ViewFilter) => a.type === b.type && a.value === b.value;

export interface FilterContext {
  labels: Label[];
  people: Person[];
  /** ISO date (`useToday`) */
  today: string;
}

const DAY = 864e5;
const ageDays = (iso: string | null | undefined, today: string) => (iso ? Math.floor((Date.parse(today) - Date.parse(iso.slice(0, 10))) / DAY) : null);
const inWindow = (iso: string | null | undefined, days: number, today: string) => {
  const age = ageDays(iso, today);
  return age != null && age >= 0 && age <= days;
};

/** Filters of one type OR together; types AND. */
export function matchesFilters(it: Item, filters: ViewFilter[], ctx: FilterContext): boolean {
  if (!filters.length) return true;
  const { today } = ctx;
  const by = new Map<string, string[]>();
  for (const f of filters) by.set(f.type, [...(by.get(f.type) ?? []), f.value]);
  for (const [type, vals] of by) {
    let ok = true;
    if (type === "label") {
      const names = it.labelIds.map((id) => ctx.labels.find((l) => l.id === id)?.name).filter(Boolean);
      ok = names.some((n) => vals.includes(n!));
    } else if (type === "assignee") {
      const names = it.assigneeIds.map((id) => ctx.people.find((p) => p.id === id)?.name).filter(Boolean) as string[];
      ok = names.length ? names.some((n) => vals.includes(n)) : vals.includes("Unassigned");
    } else if (type === "due") ok = matchesDue(vals, it, today);
    else if (type === "created") ok = vals.some((v) => (v === "Older" ? (ageDays(it.createdAt, today) ?? 0) > 30 : inWindow(it.createdAt, v === "Last 7 days" ? 7 : 30, today)));
    else if (type === "start") ok = vals.some((v) => (v === "No start date" ? !it.startDate : inWindow(it.startDate, v === "Last 7 days" ? 7 : 30, today)));
    else if (type === "priority") ok = vals.some((v) => (v === "None" ? !it.priority : !!it.priority && PRIORITY_LABEL[it.priority] === v));
    else if (type === "status") {
      const name = STATUSES.find((s) => s.id === itemStatusId(it))?.name;
      ok = !!name && vals.includes(name);
    }
    if (!ok) return false;
  }
  return true;
}

/** Why the view leaves out a top-level item ("hidden by the current filters"), or null when it shows it. */
export function hiddenReason(it: Item, filters: ViewFilter[], ctx: FilterContext, showCompleted: boolean): string | null {
  if (!showCompleted && it.done) return "completed items are hidden";
  return matchesFilters(it, filters, ctx) ? null : "hidden by the current filters";
}

/**
 * What a quick add says when the view won't show the new item (decision R3, as Linear and Todoist do):
 * "Added · hidden by the current filters", or null when nothing hides it (no toast: it shows where it was typed).
 */
export const addedHiddenNotice = (hidden: string | null) => (hidden ? `Added · ${hidden}` : null);

/** Filter parent items once; their direct subitems stay with them in every view. */
export function filterViewItems(items: Item[], filters: ViewFilter[], ctx: FilterContext, showCompleted: boolean): Item[] {
  if (!filters.length && showCompleted) return items;
  const keep = new Set(items.filter((it) => !it.parentItemId && !hiddenReason(it, filters, ctx, showCompleted)).map((it) => it.id));
  return items.filter((it) => keep.has(it.parentItemId ?? it.id));
}

export interface SortOption {
  key: string;
  label: string;
  icon: IconName;
  /** Direction labels; absent on "none" */
  dirs?: { asc: string; desc: string };
  hint?: string;
}
export type SortDim = "lists" | "items";
export const SORT_OPTS: Record<SortDim, SortOption[]> = {
  lists: [
    { key: "none", label: "None", icon: "circle-slash-2", hint: "Manual order" },
    { key: "name", label: "Name", icon: "arrow-down-a-z", dirs: { asc: "A–Z", desc: "Z–A" } },
    { key: "count", label: "Item count", icon: "hash", dirs: { desc: "Most first", asc: "Fewest first" } },
  ],
  items: [
    { key: "none", label: "None", icon: "circle-slash-2", hint: "Board order" },
    { key: "priority", label: "Priority", icon: "flag", dirs: { asc: "Urgent first", desc: "Low first" } },
    { key: "due", label: "Due date", icon: "clock", dirs: { asc: "Soonest first", desc: "Latest first" } },
    { key: "created", label: "Created date", icon: "calendar", dirs: { desc: "Newest first", asc: "Oldest first" } },
    { key: "updated", label: "Updated date", icon: "history", dirs: { desc: "Newest first", asc: "Oldest first" } },
    { key: "title", label: "Title", icon: "arrow-down-a-z", dirs: { asc: "A–Z", desc: "Z–A" } },
    { key: "assignee", label: "Assignee", icon: "user", dirs: { asc: "A–Z", desc: "Z–A" } },
    { key: "status", label: "Status", icon: "circle-dot", dirs: { asc: "New first", desc: "Done first" } },
  ],
};
const SORT_DEFAULT_DIR: Record<string, "asc" | "desc"> = { name: "asc", count: "desc", priority: "asc", due: "asc", created: "desc", updated: "desc", title: "asc", assignee: "asc", status: "asc" };

export type SortState = { lists: SortSpec | null; items: SortSpec | null };

/** Picking the active key reverses it; "none" clears; a new key starts in its natural direction. */
export function nextSort(sort: SortState, dim: SortDim, key: string): SortState {
  const cur = sort[dim];
  if (key === "none") return { ...sort, [dim]: null };
  if (cur && cur.key === key) return { ...sort, [dim]: { key, dir: cur.dir === "asc" ? "desc" : "asc" } };
  return { ...sort, [dim]: { key, dir: SORT_DEFAULT_DIR[key] ?? "asc" } };
}

const PRIORITY_RANK: Record<ItemPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** An item's Status id; a done item without one reads as Done (filters, sort and Group by agree). */
export const itemStatusId = (it: Pick<Item, "status" | "done">) => it.status ?? (it.done ? "DONE" : null);

/** Comparator for items under a sort spec (null = board order). Items without a value (no date, priority, assignee or
 * Status) sort last in both directions; Assignee reads the first assignee's name, Status the STATUSES order. */
export function itemComparator(spec: SortSpec | null, ctx?: { people: ReadonlyArray<Pick<Person, "id" | "name">> }): ((a: Item, b: Item) => number) | null {
  if (!spec) return null;
  const m = spec.dir === "desc" ? -1 : 1;
  const key = spec.key;
  const nameOf = (id: string | undefined) => (id ? (ctx?.people.find((p) => p.id === id)?.name ?? null) : null);
  const value = (it: Item): string | number | null => {
    if (key === "title") return it.title;
    if (key === "priority") return it.priority ? PRIORITY_RANK[it.priority] : null;
    if (key === "status") {
      const i = STATUSES.findIndex((s) => s.id === itemStatusId(it));
      return i < 0 ? null : i;
    }
    if (key === "assignee") return nameOf(it.assigneeIds[0]);
    return (key === "due" ? it.dueDate : key === "updated" ? it.updatedAt : key === "created" ? it.createdAt : null) || null;
  };
  return (a, b) => {
    const va = value(a), vb = value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return m * (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb)));
  };
}

export function sortLists<T extends { name: string; count: number }>(lists: T[], spec: SortSpec | null): T[] {
  if (!spec) return lists;
  const m = spec.dir === "desc" ? -1 : 1;
  return [...lists].sort((a, b) => (spec.key === "name" ? m * a.name.localeCompare(b.name) : m * (a.count - b.count)));
}

/** "Items by Due date ↑" for chips and saved-view summaries. */
export function describeSort(dim: SortDim, spec: SortSpec): string {
  const opt = SORT_OPTS[dim].find((o) => o.key === spec.key);
  return `${dim === "lists" ? "Lists" : "Items"} by ${opt?.label ?? spec.key}${opt?.dirs ? ` · ${opt.dirs[spec.dir]}` : ""}`;
}
