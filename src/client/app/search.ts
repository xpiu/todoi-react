// Search wiring shared by the top-bar dropdown and the Ctrl+K palette: one debounced server search
// over the viewer's items, and one resolver from a result to its route (by ids, never by what the
// current view happens to render). Spec: DESIGN.md › Search dropdown, Command palette.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import type { SearchHit } from "../data/api";
import { searchQuery } from "../data/queries";

export type SearchStatus = "idle" | "loading" | "offline" | "error" | "ready";

const DEBOUNCE_MS = 150;

/** The server's hits for `query` (debounced); while a newer query is pending the last hits stay. */
export function useItemSearch(query: string, enabled = true): { hits: SearchHit[]; status: SearchStatus } {
  const q = query.trim();
  const [settled, setSettled] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setSettled(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);
  const res = useQuery({ ...searchQuery(settled), enabled: enabled && !!settled, placeholderData: keepPreviousData });
  if (!q || !enabled) return { hits: [], status: "idle" };
  // Offline, TanStack pauses the request rather than failing it: say so instead of "Searching…" forever.
  if (res.fetchStatus === "paused") return { hits: res.data ?? [], status: "offline" };
  const pending = settled !== q || res.isPlaceholderData || (res.isFetching && !res.data);
  return { hits: res.data ?? [], status: res.isError && !pending ? "error" : pending ? "loading" : "ready" };
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
  const match = useMatch({ from: "/app/p/$projectId", shouldThrow: false });
  return {
    project: (projectId: string) => void navigate({ to: "/p/$projectId", params: { projectId }, search: {} }),
    groups: () => void navigate({ to: "/groups" }),
    item: (it: { id: string; projectId: string | null }) => {
      if (!it.projectId) return void navigate({ to: "/inbox", search: { item: it.id } });
      // In the current project the view (filters, sort, saved view) stays; the overlay opens on top.
      const here = match?.params.projectId === it.projectId;
      void navigate({ to: "/p/$projectId", params: { projectId: it.projectId }, search: here ? { ...match.search, item: it.id, edit: undefined } : { item: it.id } });
    },
  };
}
