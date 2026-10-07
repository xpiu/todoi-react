// TanStack Query hooks for the workspace: groups + projects (sidebar), one project with its lists,
// the items of a project or the Inbox, labels. Keys are grouped so a mutation can invalidate a scope.
import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, ApiError, unwrap, type GroupWithProjects, type Item, type ItemDetails, type ItemLocation, type Label, type ProjectDetail, type ActivityEntry, type SearchHit } from "./api";

export const keys = {
  groups: ["groups"] as const,
  project: (id: string) => ["project", id] as const,
  items: (scope: { projectId: string } | { listId: string }) => ["items", scope] as const,
  itemDetails: (id: string) => ["item", id, "details"] as const,
  itemLocation: (id: string) => ["item", id, "location"] as const,
  labels: (projectId: string) => ["labels", projectId] as const,
  inboxUnread: ["inbox", "unread"] as const,
  activity: (projectId: string) => ["activity", projectId] as const,
  search: (q: string) => ["search", q] as const,
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
    // "Doesn't exist" and "not yours" are answers, not hiccups.
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 1,
  });

export const activityQuery = (projectId: string) =>
  queryOptions({
    queryKey: keys.activity(projectId),
    queryFn: ({ signal }) => api.api.activity.$get({ query: { projectId } }, { init: { signal } }).then((r) => unwrap<ActivityEntry[]>(r)),
    enabled: !!projectId,
  });

export const inboxUnreadQuery = () =>
  queryOptions({
    queryKey: keys.inboxUnread,
    queryFn: ({ signal }) => api.api.inbox.unread.$get(undefined, { init: { signal } }).then((r) => unwrap<{ unread: number }>(r)),
  });

/** Items across the viewer's projects and Inbox by title or key (bounded by the server). */
export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: keys.search(q),
    queryFn: ({ signal }) => api.api.search.$get({ query: { q } }, { init: { signal } }).then((r) => unwrap<SearchHit[]>(r)),
    enabled: !!q,
    staleTime: 10_000,
  });

export const useGroups = () => useQuery(groupsQuery());
/** Every project in the sidebar order, each carrying its group's name. */
export const projectsOf = (groups: GroupWithProjects[] | undefined) => (groups ?? []).flatMap((g) => g.projects.map((p) => ({ ...p, groupName: g.name })));
export const useProject = (id: string) => useQuery(projectQuery(id));
export const useProjectItems = (projectId: string) => useQuery(projectItemsQuery(projectId));
export const useListItems = (listId?: string) => useQuery(listItemsQuery(listId));
export const useLabels = (projectId: string) => useQuery(labelsQuery(projectId));
export const useItemDetails = (id: string) => useQuery(itemDetailsQuery(id));
export const useInboxUnread = () => useQuery(inboxUnreadQuery());
export const useActivity = (projectId: string) => useQuery(activityQuery(projectId));
