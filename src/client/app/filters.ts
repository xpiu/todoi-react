// Filters and sort for a project's views — pure functions over the API's Item shape so List, Board
// and Calendar share one model, and the URL (`f`, `s`) can reproduce it. Spec: DESIGN.md › Filtering.
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


/** Every filter the menu offers for this project. */
export function availableFilters(labels: Label[], people: Person[]): FilterOption[] {
  return [
    ...labels.map((l) => ({ type: "label", value: l.name, color: `var(--label-${l.color})` })),
    ...people.map((p) => ({ type: "assignee", value: p.name, icon: "user" as const })),
    { type: "assignee", value: "Unassigned", icon: "user-x" },
    { type: "due", value: "Overdue", icon: "clock" },
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
    } else if (type === "due") ok = !it.done && !!it.dueDate && it.dueDate < today;
    else if (type === "created") ok = vals.some((v) => (v === "Older" ? (ageDays(it.createdAt, today) ?? 0) > 30 : inWindow(it.createdAt, v === "Last 7 days" ? 7 : 30, today)));
    else if (type === "start") ok = vals.some((v) => (v === "No start date" ? !it.startDate : inWindow(it.startDate, v === "Last 7 days" ? 7 : 30, today)));
    else if (type === "priority") ok = vals.some((v) => (v === "None" ? !it.priority : !!it.priority && PRIORITY_LABEL[it.priority] === v));
    else if (type === "status") {
      const name = STATUSES.find((s) => s.id === (it.status ?? (it.done ? "DONE" : null)))?.name;
      ok = !!name && vals.includes(name);
    }
    if (!ok) return false;
  }
  return true;
}

/** Filter parent items once; their direct subitems stay with them in every view. */
export function filterViewItems(items: Item[], filters: ViewFilter[], ctx: FilterContext, showCompleted: boolean): Item[] {
  if (!filters.length && showCompleted) return items;
  const keep = new Set(items.filter((it) => !it.parentItemId && (showCompleted || !it.done) && matchesFilters(it, filters, ctx)).map((it) => it.id));
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
    { key: "title", label: "Title", icon: "arrow-down-a-z", dirs: { asc: "A–Z", desc: "Z–A" } },
  ],
};
const SORT_DEFAULT_DIR: Record<string, "asc" | "desc"> = { name: "asc", count: "desc", priority: "asc", due: "asc", created: "desc", title: "asc" };

export type SortState = { lists: SortSpec | null; items: SortSpec | null };

/** Picking the active key reverses it; "none" clears; a new key starts in its natural direction. */
export function nextSort(sort: SortState, dim: SortDim, key: string): SortState {
  const cur = sort[dim];
  if (key === "none") return { ...sort, [dim]: null };
  if (cur && cur.key === key) return { ...sort, [dim]: { key, dir: cur.dir === "asc" ? "desc" : "asc" } };
  return { ...sort, [dim]: { key, dir: SORT_DEFAULT_DIR[key] ?? "asc" } };
}

const PRIORITY_RANK: Record<ItemPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Comparator for items under a sort spec (null = board order). Empty dates sort last either way. */
export function itemComparator(spec: SortSpec | null): ((a: Item, b: Item) => number) | null {
  if (!spec) return null;
  const m = spec.dir === "desc" ? -1 : 1;
  if (spec.key === "title") return (a, b) => m * a.title.localeCompare(b.title);
  if (spec.key === "priority") return (a, b) => m * ((a.priority ? PRIORITY_RANK[a.priority] : 4) - (b.priority ? PRIORITY_RANK[b.priority] : 4));
  const field = spec.key === "due" ? "dueDate" : "createdAt";
  return (a, b) => {
    const va = a[field], vb = b[field];
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return m * va.localeCompare(vb);
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
