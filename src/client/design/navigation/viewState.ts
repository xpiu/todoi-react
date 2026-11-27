// View state ↔ URL query. A saved view stores {filters, sort, group} only; the view type travels in the URL as
// `v`, also beside a saved view (`view=<id>&v=board`), so picking a saved view never switches List / Board /
// Calendar. The project lives in the path (/<slug>, shared/projectLinks.ts); the query keeps the spec's keys: `view` (a saved view
// id), `v`, `f` (type:value,…), `s` (lists.key.dir,items.key.dir), `g` (the Group by key).
// Spec: DESIGN.md › Saved views.
import { GROUP_KEYS, type GroupKey, type ProjectView } from "../../../shared/enums";
import type { IconName } from "../core/Icon";

export type { GroupKey };

/** The Group menu's rows (Design: ViewControls GROUP_OPTIONS): None, then the five keys */
export const GROUP_OPTIONS: ReadonlyArray<{ key: "none" | GroupKey; label: string; icon: IconName; hint?: string }> = [
  { key: "none", label: "None", icon: "circle-slash-2", hint: "Lists" },
  { key: "status", label: "Status", icon: "circle-dot" },
  { key: "priority", label: "Priority", icon: "flag" },
  { key: "assignee", label: "Assignee", icon: "user" },
  { key: "label", label: "Label", icon: "tag" },
  { key: "due", label: "Due", icon: "clock" },
];
export const isGroupKey = (v: unknown): v is GroupKey => (GROUP_KEYS as readonly unknown[]).includes(v);

export interface ViewFilter {
  type: string;
  value: string;
}
export interface SortSpec {
  key: string;
  dir: "asc" | "desc";
}
export interface ViewDefinition {
  /** URL state only: a saved view's definition leaves it out (older rows may still carry one) */
  view?: ProjectView;
  filters?: ViewFilter[];
  sort?: { lists?: SortSpec | null; items?: SortSpec | null };
  /** Group by (List view only; Board and Calendar keep it for the next List visit) */
  group?: GroupKey | null;
}
export interface ViewState extends ViewDefinition {
  savedView?: string;
  /** The open item overlay (rides along, never part of a saved definition) */
  item?: string;
  edit?: boolean;
}

/** The query-string shape the router validates (every key optional). */
export interface ViewSearch {
  view?: string;
  v?: ProjectView;
  f?: string;
  s?: string;
  g?: GroupKey;
  item?: string;
  edit?: boolean;
}

const isView = (v: unknown): v is ProjectView => v === "list" || v === "board" || v === "calendar";

export function encodeViewState({ view, filters = [], sort = {}, group, savedView, item, edit }: ViewState): ViewSearch {
  const extra: ViewSearch = item ? { item, ...(edit ? { edit: true } : {}) } : {};
  if (savedView) return { view: savedView, ...(view ? { v: view } : {}), ...extra };
  const out: ViewSearch = { ...extra };
  if (view) out.v = view;
  if (filters.length) out.f = filters.map((f) => `${encodeURIComponent(f.type)}:${encodeURIComponent(f.value)}`).join(",");
  const s = (["lists", "items"] as const).filter((d) => sort[d]).map((d) => `${d}.${sort[d]!.key}.${sort[d]!.dir}`);
  if (s.length) out.s = s.join(",");
  if (group) out.g = group;
  return out;
}

/** A decoded state always carries filters, both sort slots and the group (null when unset). */
export type DecodedViewState = ViewState & { filters: ViewFilter[]; sort: { lists: SortSpec | null; items: SortSpec | null }; group: GroupKey | null };

export function decodeViewState(input: ViewSearch | Record<string, unknown>): DecodedViewState {
  const out: DecodedViewState = { filters: [], sort: { lists: null, items: null }, group: null };
  const search = input as Record<string, unknown>;
  if (typeof search.view === "string" && search.view) out.savedView = search.view;
  if (typeof search.item === "string" && search.item) {
    out.item = search.item;
    if (search.edit === true) out.edit = true;
  }
  if (isView(search.v)) out.view = search.v;
  if (typeof search.f === "string" && search.f) {
    for (const x of search.f.split(",")) {
      const j = x.indexOf(":");
      if (j > 0) out.filters.push({ type: decodeURIComponent(x.slice(0, j)), value: decodeURIComponent(x.slice(j + 1)) });
    }
  }
  if (typeof search.s === "string" && search.s) {
    for (const x of search.s.split(",")) {
      const [d, key, dir] = x.split(".");
      if ((d === "lists" || d === "items") && key) out.sort[d] = { key, dir: dir === "desc" ? "desc" : "asc" };
    }
  }
  if (isGroupKey(search.g)) out.group = search.g;
  return out;
}

/** The query after a change: editing filters, sort or group leaves the saved view (the URL turns ad-hoc); opening an item or switching view type keeps it. */
export function nextViewSearch(state: ViewState, patch: Partial<ViewState>): ViewSearch {
  const leaves = "filters" in patch || "sort" in patch || "group" in patch;
  return encodeViewState({ ...state, ...patch, savedView: leaves ? undefined : (patch.savedView ?? state.savedView) });
}

/** "?v=board&f=label:design&s=items.due.asc&g=status" from a definition (for Copy link). */
export function viewStateToQuery(state: ViewState): string {
  const q = encodeViewState(state);
  const parts = (Object.keys(q) as Array<keyof ViewSearch>).filter((k) => q[k]).map((k) => `${k}=${q[k]}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Human chips for a definition: filter values, "Items by due ↑", "Grouped by Status" (plus the view name when `def.view` is set). */
export function summarizeView(def: ViewDefinition, viewLabels: Record<string, string> = { list: "List", board: "Board", calendar: "Calendar" }): string[] {
  const parts: string[] = [];
  if (def.view) parts.push(viewLabels[def.view] ?? def.view);
  for (const f of def.filters ?? []) parts.push(f.value);
  for (const d of ["lists", "items"] as const) {
    const s = def.sort?.[d];
    if (s) parts.push(`${d === "lists" ? "Lists by " : "Items by "}${s.key}${s.dir === "desc" ? " ↓" : " ↑"}`);
  }
  if (def.group) parts.push(`Grouped by ${GROUP_OPTIONS.find((o) => o.key === def.group)?.label ?? def.group}`);
  return parts;
}

/** Same filters, sort and group. The view type is not part of a saved view, so it never counts as a difference. */
export const sameDefinition = (a: ViewDefinition, b: ViewDefinition) => viewStateToQuery({ ...a, view: undefined }) === viewStateToQuery({ ...b, view: undefined });
