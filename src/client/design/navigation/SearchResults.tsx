// SearchResults — the Search page: the full search behind the top bar's quick dropdown ("See all results").
// It also matches descriptions and comments; every result says where it matched (Title / Description /
// Comment · author) and shows a one-line snippet with the match marked. Filters: project, status, assignee,
// include archived. The first 20 results show; "Show n more" adds the next page. Presentational: the host
// runs the search and passes results, total and status. Spec: DESIGN.md › Search page.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "../core/Button";
import { Checkbox } from "../core/Checkbox";
import { EmptyState } from "../core/EmptyState";
import { Icon, type IconName } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import { Select, type SelectOption } from "../core/Select";
import { Skeleton } from "../core/Skeleton";
import { STATUSES } from "../core/statuses";
import { searchSnippet } from "./searchSnippet";
import "./SearchResults.css";

export { searchSnippet };

export type SearchMatchField = "title" | "description" | "comment";
export interface SearchResult {
  id: string;
  /** "MP-112" */
  itemId?: string;
  title: string;
  projectName?: string;
  listName?: string;
  done?: boolean;
  /** Shows the Archived badge (only with "Include archived") */
  archived?: boolean;
  /** Where the query matched. `text` is the description or the comment body (the component cuts the one-line snippet); `author` names the commenter. */
  match: { field: SearchMatchField; text?: string; author?: string };
}
export interface SearchFilters {
  project: string | null;
  /** A Status id ("DOING") */
  status: string | null;
  /** A member's id, or UNASSIGNED */
  assignee: string | null;
  archived: boolean;
}

export const SEARCH_PAGE_SIZE = 20;
/** Shorter queries aren't searched */
export const SEARCH_MIN_QUERY = 2;
/** The Assignee filter's "Unassigned" value */
export const UNASSIGNED = "__none";
export const SEARCH_MATCH_FIELDS: Record<SearchMatchField, { label: string; icon: IconName }> = {
  title: { label: "Title", icon: "type" },
  description: { label: "Description", icon: "align-left" },
  comment: { label: "Comment", icon: "message-square" },
};
export const EMPTY_SEARCH_FILTERS: SearchFilters = { project: null, status: null, assignee: null, archived: false };
/** How many of the four filters are on */
export const searchFilterCount = (f?: SearchFilters | null) => (f ? (f.project ? 1 : 0) + (f.status ? 1 : 0) + (f.assignee ? 1 : 0) + (f.archived ? 1 : 0) : 0);

function Marked({ text, query, lead, max }: { text: string | undefined; query: string; lead?: number; max?: number }): ReactNode {
  const s = searchSnippet(text, query, { lead, max });
  if (!s) return null;
  return s.hit ? (
    <>
      {s.pre}
      <mark>{s.hit}</mark>
      {s.post}
    </>
  ) : (
    s.pre
  );
}

export interface SearchResultsProps {
  query?: string;
  onQueryChange?: (query: string) => void;
  /** The results loaded so far, in the order the search returned them */
  results?: SearchResult[];
  /** All matches, loaded or not; drives "Showing 20 of 38 results" and Show more @default results.length */
  total?: number;
  /** "idle": nothing asked yet. "loading" with no results: nothing for 150ms, then placeholder rows. @default "idle" */
  status?: "idle" | "loading" | "ready" | "error";
  /** Shown under "Couldn't search" */
  error?: string;
  onRetry?: () => void;
  /** No connection: "You're offline" replaces the results */
  offline?: boolean;
  filters?: SearchFilters;
  onFiltersChange?: (filters: SearchFilters) => void;
  projects?: ReadonlyArray<{ id: string; name: string; icon?: IconName; color?: string }>;
  /** @default STATUSES */
  statuses?: ReadonlyArray<{ id: string; name: string; icon?: IconName; color?: string }>;
  members?: ReadonlyArray<{ id: string; name: string }>;
  /** @default true */
  showItemIds?: boolean;
  /** "Show n more" was pressed: load the next page and append it to `results` */
  onShowMore?: () => void;
  /** "loading": the button reads "Loading…". "error": "Couldn't load more results." and the button reads Retry. */
  moreStatus?: "idle" | "loading" | "error";
  /** @default 20 */
  pageSize?: number;
  onOpen?: (result: SearchResult) => void;
  /** Focus the field on mount @default true */
  autoFocus?: boolean;
  style?: CSSProperties;
  className?: string;
}

const LOADING_DELAY_MS = 150;

export function SearchResults({
  query = "",
  onQueryChange,
  results = [],
  total,
  status = "idle",
  error,
  onRetry,
  offline = false,
  filters = EMPTY_SEARCH_FILTERS,
  onFiltersChange,
  projects = [],
  statuses = STATUSES,
  members = [],
  showItemIds = true,
  onShowMore,
  moreStatus = "idle",
  pageSize = SEARCH_PAGE_SIZE,
  onOpen,
  autoFocus = true,
  style,
  className,
}: SearchResultsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The roving result: the one Tab stop of the list. A new query starts at the top.
  const [cur, setCur] = useState({ query, index: 0 });
  const curIndex = cur.query === query ? Math.min(cur.index, Math.max(0, results.length - 1)) : 0;
  const grown = useRef<number | null>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  // After "Show more": focus the first result that was added.
  useEffect(() => {
    const from = grown.current;
    if (from == null || results.length <= from) return;
    grown.current = null;
    rowsOf(listRef.current)[from]?.focus();
  }, [results.length]);
  // Loading shows nothing for 150ms, then placeholder rows (as every view does).
  const [slow, setSlow] = useState(false);
  const loading = status === "loading";
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setSlow(true), LOADING_DELAY_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [loading]);
  const q = query.trim();
  const short = q.length > 0 && q.length < SEARCH_MIN_QUERY;
  const set = (patch: Partial<SearchFilters>) => onFiltersChange?.({ ...EMPTY_SEARCH_FILTERS, ...filters, ...patch });
  const clear = () => onFiltersChange?.({ ...EMPTY_SEARCH_FILTERS });
  const active = searchFilterCount(filters);
  const n = total ?? results.length;
  const more = Math.max(0, n - results.length);
  const focusRow = (i: number) => {
    const rows = rowsOf(listRef.current);
    const k = Math.max(0, Math.min(i, rows.length - 1));
    setCur({ query, index: k });
    rows[k]?.focus();
  };
  const onRowKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === "ArrowDown" || k === "j") {
      e.preventDefault();
      focusRow(i + 1);
    } else if (e.key === "ArrowUp" || k === "k") {
      e.preventDefault();
      if (i === 0) inputRef.current?.focus();
      else focusRow(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRow(Number.MAX_SAFE_INTEGER);
    }
  };
  const countLine = !q || short || offline || status === "error" ? "" : loading ? "Searching…" : n === 0 ? "No results" : more > 0 ? `Showing ${results.length} of ${n} results` : `${n} ${n === 1 ? "result" : "results"}`;

  let body: ReactNode;
  if (offline) body = <EmptyState surface="card" icon="cloud-off" title="You're offline" hint="Search needs a connection. Items you already have open still work." />;
  else if (!q || short) body = <EmptyState surface="card" icon="search" title="Search items" hint={short ? `Type at least ${SEARCH_MIN_QUERY} characters.` : "Finds words in titles, descriptions and comments, in every project you can open."} />;
  else if (status === "error") body = <EmptyState surface="card" tone="danger" icon="circle-alert" title="Couldn't search" hint={error || "Something went wrong. Your search is still here."} action={onRetry ? { label: "Retry", onClick: onRetry } : undefined} role="alert" />;
  else if (loading && !results.length)
    body = slow ? (
      <div className="td-search-list" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="td-search-skeleton">
            <Skeleton width={`${70 - i * 8}%`} height={12} />
            <Skeleton width={`${50 + i * 6}%`} height={10} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    ) : (
      <div className="td-search-list" aria-busy="true" style={{ minHeight: 120 }} />
    );
  else if (!results.length) {
    // The one way on: clear the filters, or else let archived items in.
    const onlyArchived = filters.archived && active === 1;
    body = (
      <EmptyState
        surface="card"
        icon="search-x"
        title={`No results for “${q}”`}
        hint={active ? (onlyArchived ? "Check the spelling, or try fewer words." : "Filters are on. Clear them to search everything.") : "Archived items are left out. Check the spelling, or try fewer words."}
        action={active && !onlyArchived ? { label: "Clear filters", onClick: clear } : !filters.archived ? { label: "Include archived", onClick: () => set({ archived: true }) } : undefined}
      />
    );
  } else
    body = (
      <>
        <div className="td-search-list" role="list" aria-label="Search results" aria-busy={loading || undefined} ref={listRef}>
          {results.map((r, i) => {
            const m = r.match ?? { field: "title" };
            const f = SEARCH_MATCH_FIELDS[m.field] ?? SEARCH_MATCH_FIELDS.title;
            return (
              <div key={r.id} role="listitem" className="td-search-item">
                <button type="button" className="td-search-row" tabIndex={i === curIndex ? 0 : -1} data-archived={r.archived ? "true" : undefined} data-done={r.done ? "true" : undefined} onFocus={() => setCur({ query, index: i })} onKeyDown={(e) => onRowKey(e, i)} onClick={() => {
                  // The opened result keeps the Tab stop (a click doesn't focus a button in every browser), so the host can return focus to it
                  setCur({ query, index: i });
                  onOpen?.(r);
                }}>
                  <span className="td-search-line">
                    {showItemIds && r.itemId ? <span className="td-search-key">{r.itemId}</span> : null}
                    <span className="td-search-title">{m.field === "title" ? <Marked text={r.title} query={q} lead={1e4} max={1e4} /> : r.title}</span>
                    {r.archived ? <span className="td-search-badge">Archived</span> : null}
                    <span className="td-search-meta">{[r.projectName, r.listName].filter(Boolean).join(" › ")}</span>
                  </span>
                  <span className="td-search-line td-search-match">
                    <span className="td-search-where">
                      <Icon name={f.icon} size={12} />
                      {f.label}
                      {m.field === "comment" && m.author ? ` · ${m.author}` : ""}
                    </span>
                    {m.field !== "title" && m.text ? (
                      <span className="td-search-snippet">
                        <Marked text={m.text} query={q} />
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {more > 0 && onShowMore ? (
          <div className="td-search-more">
            <Button
              variant="outline"
              disabled={moreStatus === "loading"}
              onClick={() => {
                grown.current = results.length;
                onShowMore();
              }}
            >
              {moreStatus === "loading" ? "Loading…" : moreStatus === "error" ? "Retry" : `Show ${Math.min(pageSize, more)} more`}
            </Button>
            <InlineError message={moreStatus === "error" ? "Couldn't load more results." : null} />
          </div>
        ) : null}
      </>
    );

  const projectOptions: SelectOption<string | null>[] = [{ value: null, label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name, icon: p.icon, iconColor: p.color }))];
  const statusOptions: SelectOption<string | null>[] = [{ value: null, label: "Any status" }, ...statuses.map((s) => ({ value: s.id, label: s.name, icon: s.icon, iconColor: s.color }))];
  const memberOptions: SelectOption<string | null>[] = [{ value: null, label: "Anyone" }, ...members.map((mb) => ({ value: mb.id, label: mb.name })), { value: UNASSIGNED, label: "Unassigned", icon: "user-x" }];
  return (
    <div className={["td-search-page", className ?? ""].join(" ").trim()} style={style}>
      <div className="td-search-inner">
        <div className="td-search-head" role="search">
          <div className="td-search-field">
            <Icon name="search" size={16} />
            <input
              ref={inputRef}
              type="text"
              className="td-search-input"
              value={query}
              placeholder="Search titles, descriptions and comments"
              aria-label="Search items"
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              onChange={(e) => onQueryChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && results.length && !short) {
                  e.preventDefault();
                  focusRow(0);
                } else if (e.key === "Escape" && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  onQueryChange?.("");
                }
              }}
            />
            {query ? (
              <button
                type="button"
                className="td-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  onQueryChange?.("");
                  inputRef.current?.focus();
                }}
              >
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
          <div className="td-search-filters" role="group" aria-label="Search filters">
            <Select aria-label="Project" value={filters.project} icon="folder" options={projectOptions} onChange={(v) => set({ project: v })} width={240} />
            <Select aria-label="Status" value={filters.status} icon="circle-dot" options={statusOptions} onChange={(v) => set({ status: v })} width={200} />
            <Select aria-label="Assignee" value={filters.assignee} icon="user" options={memberOptions} onChange={(v) => set({ assignee: v })} width={220} />
            <Checkbox checked={filters.archived} onChange={(v) => set({ archived: v })} label="Include archived" className="td-search-archived" />
            {active ? (
              <Button variant="ghost" onClick={clear}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
        <div className="td-search-count" role="status" aria-live="polite">
          {countLine}
        </div>
        <div className="td-search-body">{body}</div>
      </div>
    </div>
  );
}

const rowsOf = (list: HTMLElement | null) => (list ? [...list.querySelectorAll<HTMLButtonElement>(".td-search-row")] : []);
