// Project and group mutations (create, settle, archive / restore / delete, members) and the archive listing.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MemberRole } from "../../shared/enums";
import type { ImportProjectInput } from "../../shared/import";
import type { CreateGroupInput, CreateProjectInput, UpdateGroupInput, UpdateProjectInput } from "../../shared/projects";
import { api, unwrap } from "./api";
import type { Quiet } from "./mutations";
import { keys } from "./queries";
import type { InferResponseType } from "hono/client";

export type ArchiveListing = InferResponseType<typeof api.api.archive.$get, 200>;
export const archiveQueryKey = (projectId?: string) => ["archive", projectId ?? "all"] as const;
export const useArchive = (projectId?: string, enabled = true) => useQuery({ queryKey: archiveQueryKey(projectId), queryFn: ({ signal }) => api.api.archive.$get({ query: projectId ? { projectId } : {} }, { init: { signal } }).then((r) => unwrap<ArchiveListing>(r)), enabled });

export function useProjectMutations() {
  const qc = useQueryClient();
  const refresh = (projectId?: string) => Promise.all([
    qc.invalidateQueries({ queryKey: keys.groups }),
    qc.invalidateQueries({ queryKey: ["archive"] }),
    qc.invalidateQueries({ queryKey: ["item"] }),
    qc.invalidateQueries({ queryKey: projectId ? keys.project(projectId) : ["project"] }),
    qc.invalidateQueries({ queryKey: projectId ? keys.items({ projectId }) : ["items"] }),
  ]);
  const createProject = useMutation({ mutationFn: ({ quiet: _quiet, ...input }: CreateProjectInput & Quiet) => api.api.projects.$post({ json: input }).then((r) => unwrap<{ project: { id: string; name: string }; lists: Array<{ name: string }> }>(r)), onSettled: () => refresh() });
  const importProject = useMutation({ mutationFn: ({ quiet: _quiet, ...input }: ImportProjectInput & Quiet) => api.api.projects.import.$post({ json: input }).then((r) => unwrap<{ project: { id: string; name: string }; items: number }>(r)), onSettled: () => refresh() });
  const createGroup = useMutation({ mutationFn: ({ quiet: _quiet, ...input }: CreateGroupInput & Quiet) => api.api.groups.$post({ json: input }).then((r) => unwrap<{ id: string; name: string }>(r)), onSettled: () => refresh() });
  const updateProject = useMutation({ mutationFn: (vars: { id: string } & UpdateProjectInput) => api.api.projects[":id"].$patch({ param: { id: vars.id }, json: vars }).then((r) => unwrap(r)), onSettled: (_d, _e, v) => refresh(v.id) });
  const updateGroup = useMutation({ mutationFn: (vars: { id: string } & UpdateGroupInput) => api.api.groups[":id"].$patch({ param: { id: vars.id }, json: vars }).then((r) => unwrap(r)), onSettled: () => refresh() });
  const archiveProject = useMutation({ mutationFn: ({ id }: { id: string } & Quiet) => api.api.projects[":id"].archive.$post({ param: { id } }).then((r) => unwrap(r)), onSettled: (_d, _e, v) => refresh(v.id) });
  const restoreProject = useMutation({ mutationFn: ({ id }: { id: string } & Quiet) => api.api.projects[":id"].restore.$post({ param: { id } }).then((r) => unwrap(r)), onSettled: (_d, _e, v) => refresh(v.id) });
  const deleteProject = useMutation({ mutationFn: ({ id }: { id: string } & Quiet) => api.api.projects[":id"].$delete({ param: { id } }).then((r) => unwrap<void>(r)), onSettled: (_d, _e, v) => refresh(v.id) });
  const deleteGroup = useMutation({ mutationFn: ({ id }: { id: string } & Quiet) => api.api.groups[":id"].$delete({ param: { id } }).then((r) => unwrap<void>(r)), onSettled: () => refresh() });
  const setMember = useMutation({ mutationFn: (vars: { projectId: string; userId: string; role: MemberRole } & Quiet) => api.api.projects[":id"].members[":userId"].$put({ param: { id: vars.projectId, userId: vars.userId }, json: { role: vars.role } }).then((r) => unwrap(r)), onSettled: (_d, _e, v) => refresh(v.projectId) });
  const removeMember = useMutation({ mutationFn: (vars: { projectId: string; userId: string } & Quiet) => api.api.projects[":id"].members[":userId"].$delete({ param: { id: vars.projectId, userId: vars.userId } }).then((r) => unwrap<void>(r)), onSettled: (_d, _e, v) => refresh(v.projectId) });
  const destroyItem = useMutation({ mutationFn: ({ id }: { id: string } & Quiet) => api.api.archive.items[":id"].$delete({ param: { id } }).then((r) => unwrap<void>(r)), onSettled: () => refresh() });
  const createInvite = useMutation({ mutationFn: ({ projectId, email, role }: { projectId: string; email: string; role: MemberRole } & Quiet) => api.api.projects[":id"].invites.$post({ param: { id: projectId }, json: { email, role } }).then((r) => unwrap<{ url: string }>(r)) });
  const destroyProject = useMutation({ mutationFn: ({ id }: { id: string } & Quiet) => api.api.archive.projects[":id"].$delete({ param: { id } }).then((r) => unwrap<void>(r)), onSettled: () => refresh() });
  return { createProject, importProject, createGroup, updateProject, updateGroup, archiveProject, restoreProject, deleteProject, deleteGroup, setMember, removeMember, createInvite, destroyItem, destroyProject, refresh };
}
