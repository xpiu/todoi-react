// TanStack Query hooks for the workspace: groups + projects (sidebar), one project with its lists,
// the items of a project or the Inbox, labels. Keys are grouped so a mutation can invalidate a scope.
import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, unwrap, type GroupWithProjects, type Item, type ItemDetails, type Label, type ProjectDetail, type ActivityEntry } from "./api";

export const keys = {
  groups: ["groups"] as const,
  project: (id: string) => ["project", id] as const,
  items: (scope: { projectId: string } | { listId: string }) => ["items", scope] as const,
  itemDetails: (id: string) => ["item", id, "details"] as const,
  labels: (projectId: string) => ["labels", projectId] as const,
  inboxUnread: ["inbox", "unread"] as const,
  activity: (projectId: string) => ["activity", projectId] as const,
};

export const groupsQuery = () =>
  queryOptions({
    queryKey: keys.groups,
    queryFn: () => api.api.groups.$get().then((r) => unwrap<GroupWithProjects[]>(r)),
  });

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: keys.project(id),
    queryFn: () => api.api.projects[":id"].$get({ param: { id } }).then((r) => unwrap<ProjectDetail>(r)),
    enabled: !!id,
  });

export const projectItemsQuery = (projectId: string) =>
  queryOptions({
    queryKey: keys.items({ projectId }),
    queryFn: () => api.api.items.$get({ query: { projectId } }).then((r) => unwrap<Item[]>(r)),
    enabled: !!projectId,
  });

/** The caller's Inbox (no listId) or any one list. */
export const listItemsQuery = (listId?: string) =>
  queryOptions({
    queryKey: keys.items({ listId: listId ?? "inbox" }),
    queryFn: () => api.api.items.$get({ query: listId ? { listId } : {} }).then((r) => unwrap<Item[]>(r)),
  });

export const labelsQuery = (projectId: string) =>
  queryOptions({
    queryKey: keys.labels(projectId),
    queryFn: () => api.api.labels.$get({ query: { projectId } }).then((r) => unwrap<Label[]>(r)),
    enabled: !!projectId,
  });

export const itemDetailsQuery = (id: string) =>
  queryOptions({
    queryKey: keys.itemDetails(id),
    queryFn: () => api.api.items[":id"].details.$get({ param: { id } }).then((r) => unwrap<ItemDetails>(r)),
  });

export const activityQuery = (projectId: string) =>
  queryOptions({
    queryKey: keys.activity(projectId),
    queryFn: () => api.api.activity.$get({ query: { projectId } }).then((r) => unwrap<ActivityEntry[]>(r)),
    enabled: !!projectId,
  });

export const inboxUnreadQuery = () =>
  queryOptions({
    queryKey: keys.inboxUnread,
    queryFn: () => api.api.inbox.unread.$get().then((r) => unwrap<{ unread: number }>(r)),
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
