// View state ↔ URL query: the same {view, filters, sort} definition a saved view stores, so a copied
// link reproduces filters, sort and view. The project lives in the path (/p/:id); the query keeps the
// spec's keys: `view` (a saved view id), `v`, `f` (type:value,…), `s` (lists.key.dir,items.key.dir).
// Spec: DESIGN.md › Saved views.
import type { ProjectView } from "../../../shared/enums";

export interface ViewFilter {
  type: string;
  value: string;
}
export interface SortSpec {
  key: string;
  dir: "asc" | "desc";
}
export interface ViewDefinition {
  view?: ProjectView;
  filters?: ViewFilter[];
  sort?: { lists?: SortSpec | null; items?: SortSpec | null };
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
  item?: string;
  edit?: boolean;
}

const isView = (v: unknown): v is ProjectView => v === "list" || v === "board" || v === "calendar";

export function encodeViewState({ view, filters = [], sort = {}, savedView, item, edit }: ViewState): ViewSearch {
  const extra: ViewSearch = item ? { item, ...(edit ? { edit: true } : {}) } : {};
  if (savedView) return { view: savedView, ...extra };
  const out: ViewSearch = { ...extra };
  if (view) out.v = view;
  if (filters.length) out.f = filters.map((f) => `${encodeURIComponent(f.type)}:${encodeURIComponent(f.value)}`).join(",");
  const s = (["lists", "items"] as const).filter((d) => sort[d]).map((d) => `${d}.${sort[d]!.key}.${sort[d]!.dir}`);
  if (s.length) out.s = s.join(",");
  return out;
}

export function decodeViewState(input: ViewSearch | Record<string, unknown>): ViewState & { filters: ViewFilter[]; sort: { lists: SortSpec | null; items: SortSpec | null } } {
  const out: ViewState & { filters: ViewFilter[]; sort: { lists: SortSpec | null; items: SortSpec | null } } = { filters: [], sort: { lists: null, items: null } };
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
  return out;
}

/** "?v=board&f=label:design&s=items.due.asc" from a definition (for Copy link). */
export function viewStateToQuery(state: ViewState): string {
  const q = encodeViewState(state);
  const parts = (Object.keys(q) as Array<keyof ViewSearch>).filter((k) => q[k]).map((k) => `${k}=${q[k]}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Human chips for a definition: view name, filter values, "Items by due ↑". */
export function summarizeView(def: ViewDefinition, viewLabels: Record<string, string> = { list: "List", board: "Board", calendar: "Calendar" }): string[] {
  const parts: string[] = [];
  if (def.view) parts.push(viewLabels[def.view] ?? def.view);
  for (const f of def.filters ?? []) parts.push(f.value);
  for (const d of ["lists", "items"] as const) {
    const s = def.sort?.[d];
    if (s) parts.push(`${d === "lists" ? "Lists by " : "Items by "}${s.key}${s.dir === "desc" ? " ↓" : " ↑"}`);
  }
  return parts;
}

export const sameDefinition = (a: ViewDefinition, b: ViewDefinition) => viewStateToQuery(a) === viewStateToQuery(b);
