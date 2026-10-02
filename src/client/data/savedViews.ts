// Saved views: named, shareable tabs capturing a project's view type + filters + sort.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import type { ViewDefinitionInput } from "../../shared/content";
import { api, unwrap } from "./api";
import { newId, type Quiet } from "./mutations";

export type SavedView = InferResponseType<typeof api.api["saved-views"]["$get"], 200>[number];
export const savedViewsKey = (projectId: string) => ["saved-views", projectId] as const;

export const useSavedViews = (projectId: string) => useQuery({ queryKey: savedViewsKey(projectId), queryFn: () => api.api["saved-views"].$get({ query: { projectId } }).then((r) => unwrap<SavedView[]>(r)), enabled: !!projectId });

export function useSavedViewMutations(projectId: string) {
  const qc = useQueryClient();
  const settle = () => void qc.invalidateQueries({ queryKey: savedViewsKey(projectId) });
  const create = useMutation({ mutationFn: (vars: { name: string; shared: boolean; definition: ViewDefinitionInput; id?: string } & Quiet) => api.api["saved-views"].$post({ json: { id: vars.id ?? newId(), projectId, name: vars.name, shared: vars.shared, definition: vars.definition } }).then((r) => unwrap<SavedView>(r)), onSettled: settle });
  const update = useMutation({ mutationFn: (vars: { id: string; name?: string; shared?: boolean; definition?: ViewDefinitionInput }) => api.api["saved-views"][":id"].$patch({ param: { id: vars.id }, json: { name: vars.name, shared: vars.shared, definition: vars.definition } }).then((r) => unwrap<SavedView>(r)), onSettled: settle });
  const remove = useMutation({ mutationFn: (vars: { id: string }) => api.api["saved-views"][":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)), onSettled: settle });
  return { create, update, remove };
}
