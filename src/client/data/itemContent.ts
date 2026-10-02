// Mutations on one item's content (comments, reactions, watching, relations) and the project's
// labels. Each settles by refetching the item details (and the items list where it matters).
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { LabelColor } from "../../shared/enums";
import type { RelationType } from "../../shared/enums";
import { api, unwrap, type Label } from "./api";
import { newId, type Quiet } from "./mutations";
import { keys } from "./queries";

function useItemContentMutation<TVars>(itemId: string, fn: (vars: TVars) => Promise<unknown>, extra: ReadonlyArray<readonly unknown[]> = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.itemDetails(itemId) });
      for (const k of extra) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

/** `id` is the draft's: resending the same draft after a failure cannot post it twice. */
export function useAddComment(itemId: string) {
  return useItemContentMutation(itemId, ({ id = newId(), quiet: _quiet, ...vars }: { id?: string; body: string; replyToId?: string } & Quiet) => api.api.items[":id"].comments.$post({ param: { id: itemId }, json: { id, ...vars } }).then((r) => unwrap(r)));
}
export function useEditComment(itemId: string) {
  return useItemContentMutation(itemId, (vars: { id: string; body: string } & Quiet) => api.api.comments[":id"].$patch({ param: { id: vars.id }, json: { body: vars.body } }).then((r) => unwrap(r)));
}
export function useDeleteComment(itemId: string) {
  return useItemContentMutation(itemId, (vars: { id: string }) => api.api.comments[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)));
}
export function useReactComment(itemId: string) {
  return useItemContentMutation(itemId, (vars: { id: string; emoji: string }) => api.api.comments[":id"].reactions.$post({ param: { id: vars.id }, json: { emoji: vars.emoji } }).then((r) => unwrap(r)));
}
export function useSetWatching(itemId: string) {
  return useItemContentMutation(itemId, (vars: { watching: boolean }) => api.api.items[":id"].watch.$put({ param: { id: itemId }, json: vars }).then((r) => unwrap(r)));
}
export function useAddRelation(itemId: string) {
  return useItemContentMutation(itemId, (vars: { targetId: string; type: RelationType }) => api.api.items[":id"].relations.$post({ param: { id: itemId }, json: vars }).then((r) => unwrap(r)), [["item"]]);
}
export function useRemoveRelation(itemId: string) {
  return useItemContentMutation(itemId, (vars: { targetId: string; type: RelationType }) => api.api.items[":id"].relations.$delete({ param: { id: itemId }, json: vars }).then((r) => unwrap<void>(r)), [["item"]]);
}

/** Labels: create / rename or recolour / delete (removed from every item) / merge into another. */
export function useLabelMutations(projectId: string) {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: keys.labels(projectId) });
    void qc.invalidateQueries({ queryKey: keys.items({ projectId }) });
  };
  const create = useMutation({ mutationFn: (vars: { id?: string; name: string; color: LabelColor }) => api.api.labels.$post({ json: { id: vars.id ?? newId(), projectId, name: vars.name, color: vars.color } }).then((r) => unwrap<Label>(r)), onSettled: settle });
  const update = useMutation({ mutationFn: (vars: { id: string; name?: string; color?: LabelColor }) => api.api.labels[":id"].$patch({ param: { id: vars.id }, json: { name: vars.name, color: vars.color } }).then((r) => unwrap<Label>(r)), onSettled: settle });
  const remove = useMutation({ mutationFn: (vars: { id: string }) => api.api.labels[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)), onSettled: settle });
  const merge = useMutation({ mutationFn: (vars: { id: string; intoLabelId: string }) => api.api.labels[":id"].merge.$post({ param: { id: vars.id }, json: { intoLabelId: vars.intoLabelId } }).then((r) => unwrap<{ moved: number }>(r)), onSettled: settle });
  return { create, update, remove, merge };
}
