// Search wiring shared by the top-bar dropdown and the Ctrl+K palette: one debounced server search
// over the viewer's items, and one resolver from a result to its route (by ids, never by what the
// current view happens to render); the Search page's paged full-text search. Spec: DESIGN.md ›
// Search dropdown, Command palette, Search page.
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type { ItemStatus } from "../../shared/item-status";
import { errorMessage, type SearchHit } from "../data/api";
import { fullSearchQuery, searchQuery, type FullSearchParams } from "../data/queries";
import { SEARCH_MIN_QUERY, UNASSIGNED } from "../design/navigation/SearchResults";
import { useOpenProject } from "./useOpenProject";

export type SearchStatus = "idle" | "loading" | "offline" | "error" | "ready";

const DEBOUNCE_MS = 150;

/** `value` once it has stopped changing for the debounce time (an object must keep its identity while unchanged). */
function useSettled<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);
  return settled;
}

/** The server's hits for `query` (debounced); while a newer query is pending the last hits stay. */
export function useItemSearch(query: string, enabled = true): { hits: SearchHit[]; status: SearchStatus } {
  const q = query.trim();
  const settled = useSettled(q);
  const res = useQuery({ ...searchQuery(settled), enabled: enabled && !!settled, placeholderData: keepPreviousData });
  if (!q || !enabled) return { hits: [], status: "idle" };
  // Offline, TanStack pauses the request rather than failing it: say so instead of "Searching…" forever.
  if (res.fetchStatus === "paused") return { hits: res.data ?? [], status: "offline" };
  const pending = settled !== q || res.isPlaceholderData || (res.isFetching && !res.data);
  return { hits: res.data ?? [], status: res.isError && !pending ? "error" : pending ? "loading" : "ready" };
}

/** The Search page's filters, as SearchResults holds them. */
export interface PageSearchFilters {
  project: string | null;
  status: string | null;
  /** A user id, or UNASSIGNED */
  assignee: string | null;
  archived: boolean;
}

/**
 * The Search page's server search (debounced): pages of 20 with the total, the next page on demand. While a newer
 * query or filter is pending the last results stay, marked loading. Queries under SEARCH_MIN_QUERY aren't sent.
 */
export function useFullSearch(query: string, filters: PageSearchFilters) {
  const q = query.trim();
  const { project, status: statusFilter, assignee, archived } = filters;
  const params = useMemo<FullSearchParams>(
    () => ({ q, projectId: project ?? undefined, status: (statusFilter as ItemStatus | null) ?? undefined, assignee: assignee === UNASSIGNED ? "none" : (assignee ?? undefined), archived: archived || undefined }),
    [q, project, statusFilter, assignee, archived],
  );
  const settled = useSettled(params);
  const enabled = settled.q.length >= SEARCH_MIN_QUERY;
  const res = useInfiniteQuery({ ...fullSearchQuery(settled), enabled, placeholderData: keepPreviousData });
  const pages = res.data?.pages ?? [];
  const hits = pages.flatMap((p) => p.hits);
  const total = pages[0]?.total ?? 0;
  const pending = settled !== params || res.isPlaceholderData || (res.isFetching && !res.data);
  const offline = res.fetchStatus === "paused";
  const status: "idle" | "loading" | "ready" | "error" = q.length < SEARCH_MIN_QUERY ? "idle" : pending && !res.isFetchNextPageError ? "loading" : res.isError && !res.isFetchNextPageError ? "error" : "ready";
  return {
    hits: q.length < SEARCH_MIN_QUERY ? [] : hits,
    total,
    status,
    // Offline means no fresh answer for this query: the previous query's kept results don't count
    offline: offline && (!res.data || res.isPlaceholderData),
    error: res.isError && !res.isFetchNextPageError ? errorMessage(res.error) : undefined,
    retry: () => void res.refetch(),
    more: () => void res.fetchNextPage(),
    moreStatus: (res.isFetchingNextPage ? "loading" : res.isFetchNextPageError ? "error" : "idle") as "idle" | "loading" | "error",
  };
}

/** The item key ("MP-115") of a hit, when it has one. */
export const hitKey = (h: Pick<SearchHit, "keyPrefix" | "keyNumber">) => (h.keyPrefix && h.keyNumber != null ? `${h.keyPrefix}-${h.keyNumber}` : undefined);

/** Where a hit lives, in words: its parent for a subitem, else its list (and project when elsewhere). */
export function hitContext(h: SearchHit, currentProjectId?: string): string {
  if (h.parentTitle) return `Subitem of ${h.parentTitle}`;
  if (!h.projectId) return "Inbox";
  return h.projectId === currentProjectId ? h.listName : `${h.projectName ?? "Project"} · ${h.listName}`;
}

/** Open search results by id: projects, groups, project items (in the overlay) and Inbox items. */
export function useOpenResult() {
  const navigate = useNavigate();
  const openProject = useOpenProject();
  const match = useMatch({ from: "/app/p/$projectId", shouldThrow: false });
  return {
    project: openProject,
    groups: () => void navigate({ to: "/groups" }),
    item: (it: { id: string; projectId: string | null }) => {
      if (!it.projectId) return void navigate({ to: "/inbox", search: { item: it.id } });
      // In the current project the view (filters, sort, saved view) stays; the overlay opens on top.
      const here = match?.params.projectId === it.projectId;
      void navigate({ to: "/p/$projectId", params: { projectId: it.projectId }, search: here ? { ...match.search, item: it.id, edit: undefined } : { item: it.id } });
    },
  };
}
