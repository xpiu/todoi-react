// TanStack Query hooks for the workspace: groups + projects (sidebar), one project with its lists,
// the items of a project or the Inbox, labels. Keys are grouped so a mutation can invalidate a scope.
import { infiniteQueryOptions, queryOptions, useQuery } from "@tanstack/react-query";

import type { ItemStatus } from "../../shared/item-status";
import { api, ApiError, unwrap, type GroupWithProjects, type Item, type ItemDetails, type ItemLocation, type Label, type ProjectDetail, type ActivityEntry, type FullSearchPage, type SearchHit, type SearchPerson } from "./api";

export const keys = {
  groups: ["groups"] as const,
  project: (id: string) => ["project", id] as const,
  projectLink: (slug: string) => ["project-link", slug] as const,
  itemByKey: (projectId: string, key: string) => ["item-key", projectId, key.toUpperCase()] as const,
  items: (scope: { projectId: string } | { listId: string }) => ["items", scope] as const,
  itemDetails: (id: string) => ["item", id, "details"] as const,
  itemLocation: (id: string) => ["item", id, "location"] as const,
  labels: (projectId: string) => ["labels", projectId] as const,
  activity: (projectId: string) => ["activity", projectId] as const,
  search: (q: string) => ["search", q] as const,
  // Under "search", so item changes refresh them too (ITEM_DEPENDENTS); not kept for offline use (sync.ts queryPath).
  fullSearch: (p: FullSearchParams) => ["search", { full: p }] as const,
  searchPeople: ["search", { people: true }] as const,
};

export const groupsQuery = () =>
  queryOptions({
    queryKey: keys.groups,
    queryFn: ({ signal }) => api.api.groups.$get(undefined, { init: { signal } }).then((r) => unwrap<GroupWithProjects[]>(r)),
  });

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: keys.project(id),
    queryFn: ({ signal }) => api.api.projects[":id"].$get({ param: { id } }, { init: { signal } }).then((r) => unwrap<ProjectDetail>(r)),
    enabled: !!id,
  });

// "Doesn't exist" and "not yours" are answers, not hiccups.
const retryUnlessAnswered = (n: number, err: unknown) => !(err instanceof ApiError && err.status < 500) && n < 1;

/** The project behind the short id in a link (/epd5vjxy38). A slug never changes, so the answer keeps. */
export const projectLinkQuery = (slug: string) =>
  queryOptions({
    queryKey: keys.projectLink(slug),
    queryFn: ({ signal }) => api.api.projects.$get({ query: { slug } }, { init: { signal } }).then((r) => unwrap<{ id: string; slug: string }>(r)),
    staleTime: Infinity,
    retry: retryUnlessAnswered,
  });

/** The id of the item a link names by key (?item=MP-102) when it is not among the project's live items. */
export const itemByKeyQuery = (projectId: string, key: string) =>
  queryOptions({
    queryKey: keys.itemByKey(projectId, key),
    queryFn: ({ signal }) => api.api.projects[":id"].items[":key"].$get({ param: { id: projectId, key } }, { init: { signal } }).then((r) => unwrap<{ id: string }>(r)),
    retry: retryUnlessAnswered,
  });

export const projectItemsQuery = (projectId: string) =>
  queryOptions({
    queryKey: keys.items({ projectId }),
    queryFn: ({ signal }) => api.api.items.$get({ query: { projectId } }, { init: { signal } }).then((r) => unwrap<Item[]>(r)),
    enabled: !!projectId,
  });

/** The caller's Inbox (no listId) or any one list. */
export const listItemsQuery = (listId?: string) =>
  queryOptions({
    queryKey: keys.items({ listId: listId ?? "inbox" }),
    queryFn: ({ signal }) => api.api.items.$get({ query: listId ? { listId } : {} }, { init: { signal } }).then((r) => unwrap<Item[]>(r)),
  });

export const labelsQuery = (projectId: string) =>
  queryOptions({
    queryKey: keys.labels(projectId),
    queryFn: ({ signal }) => api.api.labels.$get({ query: { projectId } }, { init: { signal } }).then((r) => unwrap<Label[]>(r)),
    enabled: !!projectId,
  });

export const itemDetailsQuery = (id: string) =>
  queryOptions({
    queryKey: keys.itemDetails(id),
    queryFn: ({ signal }) => api.api.items[":id"].details.$get({ param: { id } }, { init: { signal } }).then((r) => unwrap<ItemDetails>(r)),
  });

/** Where an item is and whether it is live, archived or in the Trash — for a link to an item not on screen. */
export const itemLocationQuery = (id: string) =>
  queryOptions({
    queryKey: keys.itemLocation(id),
    queryFn: ({ signal }) => api.api.items[":id"].$get({ param: { id } }, { init: { signal } }).then((r) => unwrap<ItemLocation>(r)),
    retry: retryUnlessAnswered,
  });

export const activityQuery = (projectId: string) =>
  queryOptions({
    queryKey: keys.activity(projectId),
    queryFn: ({ signal }) => api.api.activity.$get({ query: { projectId } }, { init: { signal } }).then((r) => unwrap<ActivityEntry[]>(r)),
    enabled: !!projectId,
  });

/** Items across the viewer's projects and Inbox by title or key (bounded by the server). */
export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: keys.search(q),
    queryFn: ({ signal }) => api.api.search.$get({ query: { q } }, { init: { signal } }).then((r) => unwrap<SearchHit[]>(r)),
    enabled: !!q,
    staleTime: 10_000,
  });

/** The Search page's request: the query plus its filters (`assignee: "none"` = unassigned). */
export interface FullSearchParams {
  q: string;
  projectId?: string;
  status?: ItemStatus;
  assignee?: string;
  archived?: boolean;
}
export const FULL_SEARCH_PAGE = 20;
/** The Search page: titles, descriptions and comments, a page of 20 at a time with the total. */
export const fullSearchQuery = (p: FullSearchParams) =>
  infiniteQueryOptions({
    queryKey: keys.fullSearch(p),
    queryFn: ({ pageParam, signal }) =>
      api.api.search.full
        .$get({ query: { q: p.q, projectId: p.projectId, status: p.status, assignee: p.assignee, archived: p.archived ? "true" : undefined, offset: String(pageParam), limit: String(FULL_SEARCH_PAGE) } }, { init: { signal } })
        .then((r) => unwrap<FullSearchPage>(r)),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, offset) => (offset + FULL_SEARCH_PAGE < last.total ? offset + FULL_SEARCH_PAGE : undefined),
    staleTime: 10_000,
  });

/** Whom the Search page's Assignee filter offers. */
export const searchPeopleQuery = () =>
  queryOptions({
    queryKey: keys.searchPeople,
    queryFn: ({ signal }) => api.api.search.people.$get(undefined, { init: { signal } }).then((r) => unwrap<SearchPerson[]>(r)),
    staleTime: 60_000,
  });

export const useGroups = () => useQuery(groupsQuery());
/** Every project in the sidebar order, each carrying its group's name. */
export const projectsOf = (groups: GroupWithProjects[] | undefined) => (groups ?? []).flatMap((g) => g.projects.map((p) => ({ ...p, groupName: g.name })));
export const useProject = (id: string) => useQuery(projectQuery(id));
export const useProjectItems = (projectId: string) => useQuery(projectItemsQuery(projectId));
export const useListItems = (listId?: string) => useQuery(listItemsQuery(listId));
export const useLabels = (projectId: string) => useQuery(labelsQuery(projectId));
export const useItemDetails = (id: string) => useQuery(itemDetailsQuery(id));
export const useActivity = (projectId: string) => useQuery(activityQuery(projectId));
