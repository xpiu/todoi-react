// Item and list mutations with optimistic cache patches (README: "TanStack Query with optimistic
// mutations"). Each mutation knows the items scope it touches so the patch lands in the right cache.
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { nanoid } from "nanoid";

import type { CreateItemInput, MoveItemInput, UpdateItemInput } from "../../shared/items";
import type { CreateListInput, UpdateListInput } from "../../shared/projects";
import { useFeedback } from "../app/feedback";
import { api, unwrap, type Item, type MoveResult } from "./api";
import { keys } from "./queries";

export const newId = () => nanoid();

export type ItemsScope = { projectId: string } | { listId: string };

/** Optimistic helper: patch the scope's items cache before the request, roll back on error, refetch after. */
function useOptimistic<TVars, TResult>(scope: ItemsScope, mutationFn: (vars: TVars) => Promise<TResult>, patch: (items: Item[], vars: TVars) => Item[], extraKeys: QueryKey[] = []) {
  const qc = useQueryClient();
  const key = keys.items(scope);
  return useMutation({
    mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Item[]>(key);
      qc.setQueryData<Item[]>(key, (old = []) => patch(old, vars));
      return { previous };
    },
    // Roll back and say why: a guest's or viewer's edit comes back 403 and would otherwise just snap back.
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      useFeedback.getState().notify({ message: err.message, icon: "circle-alert" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["activity"] });
      void qc.invalidateQueries({ queryKey: ["item"] });
      for (const k of extraKeys) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

function placeholder(vars: CreateItemInput, siblings: Item[], projectId: string | null): Item {
  const now = new Date().toISOString();
  return {
    id: vars.id,
    title: vars.title,
    listId: vars.listId ?? siblings[0]?.listId ?? "",
    projectId,
    parentItemId: vars.parentItemId ?? null,
    keyNumber: null,
    description: vars.description ?? null,
    status: vars.status ?? null,
    priorStatus: null,
    done: false,
    priority: vars.priority ?? null,
    startDate: vars.startDate ?? null,
    dueDate: vars.dueDate ?? null,
    dueTime: vars.dueTime ?? null,
    repeatRule: null,
    repeatCount: 0,
    cover: null,
    notification: null,
    unread: false,
    position: siblings.filter((s) => s.listId === vars.listId && !s.parentItemId).length,
    createdBy: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    labelIds: vars.labelIds ?? [],
    assigneeIds: vars.assigneeIds ?? [],
    attachmentCount: 0,
  };
}

export function useCreateItem(scope: ItemsScope) {
  const projectId = "projectId" in scope ? scope.projectId : null;
  return useOptimistic(
    scope,
    (vars: CreateItemInput & { position?: "top" | "bottom" }) => api.api.items.$post({ json: vars }).then((r) => unwrap<Item>(r)),
    (items, vars) => {
      const it = placeholder(vars, items, projectId);
      return vars.position === "top" ? [{ ...it, position: -1 }, ...items] : [...items, it];
    },
    projectId ? [keys.project(projectId)] : [],
  );
}

export function useUpdateItem(scope: ItemsScope) {
  return useOptimistic(
    scope,
    (vars: { id: string } & UpdateItemInput) => api.api.items[":id"].$patch({ param: { id: vars.id }, json: vars }).then((r) => unwrap<Item>(r)),
    (items, { id, ...changes }) =>
      items.map((it) => {
        if (it.id !== id) return it;
        const doneChange = changes.done === undefined ? {} : changes.done ? { done: true, status: "DONE" as const, priorStatus: it.status } : { done: false, status: it.priorStatus, priorStatus: null };
        return { ...it, ...changes, ...doneChange };
      }),
  );
}

export function useDeleteItem(scope: ItemsScope) {
  const projectId = "projectId" in scope ? scope.projectId : null;
  return useOptimistic(
    scope,
    (vars: { id: string }) => api.api.items[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)),
    (items, { id }) => items.filter((it) => it.id !== id && it.parentItemId !== id),
    projectId ? [keys.project(projectId)] : [],
  );
}

/** Restore the existing record, then fetch its complete relationships instead of reconstructing it. */
export function useRestoreItem(scope: ItemsScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.api.items[":id"].$patch({ param: { id }, json: { deleted: false } }).then((r) => unwrap(r)),
    onSuccess: async () => {
      const refresh: QueryKey[] = [keys.items(scope), keys.groups, ["archive"], ["item"]];
      if ("projectId" in scope) refresh.push(keys.project(scope.projectId));
      await Promise.all(refresh.map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
  });
}

export function useSetItemLabels(scope: ItemsScope) {
  return useOptimistic(
    scope,
    (vars: { id: string; labelIds: string[] }) => api.api.items[":id"].labels.$put({ param: { id: vars.id }, json: { labelIds: vars.labelIds } }).then((r) => unwrap<{ labelIds: string[] }>(r)),
    (items, { id, labelIds }) => items.map((it) => (it.id === id ? { ...it, labelIds } : it)),
  );
}

export function useSetItemAssignees(scope: ItemsScope) {
  return useOptimistic(
    scope,
    (vars: { id: string; userIds: string[] }) => api.api.items[":id"].assignees.$put({ param: { id: vars.id }, json: { userIds: vars.userIds } }).then((r) => unwrap<{ userIds: string[] }>(r)),
    (items, { id, userIds }) => items.map((it) => (it.id === id ? { ...it, assigneeIds: userIds } : it)),
  );
}

/** Move within or across lists; the server returns what changed (list, Status, key) for the toast. */
export function useMoveItem(scope: ItemsScope) {
  const projectId = "projectId" in scope ? scope.projectId : null;
  return useOptimistic(
    scope,
    (vars: { id: string } & MoveItemInput) => api.api.items[":id"].move.$post({ param: { id: vars.id }, json: { listId: vars.listId, position: vars.position } }).then((r) => unwrap<MoveResult>(r)),
    (items, { id, listId, position }) => {
      const moving = items.find((it) => it.id === id);
      if (!moving) return items;
      const rest = items.filter((it) => it.id !== id);
      const siblings = rest.filter((it) => it.listId === listId && !it.parentItemId).sort((a, b) => a.position - b.position);
      const at = position == null ? siblings.length : Math.max(0, Math.min(position, siblings.length));
      const order = [...siblings.slice(0, at), { ...moving, listId }, ...siblings.slice(at)];
      const pos = new Map(order.map((it, i) => [it.id, i]));
      return [...rest.map((it) => (pos.has(it.id) ? { ...it, position: pos.get(it.id)! } : it)), { ...moving, listId, position: pos.get(id)! }];
    },
    projectId ? [keys.project(projectId)] : [],
  );
}

// ── Lists ──────────────────────────────────────────────────────────────────────
export function useCreateList(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: Omit<CreateListInput, "projectId">) => api.api.lists.$post({ json: { ...vars, projectId } }).then((r) => unwrap<unknown>(r)),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.project(projectId) }),
  });
}

export function useUpdateList(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string } & UpdateListInput) => api.api.lists[":id"].$patch({ param: { id: vars.id }, json: vars }).then((r) => unwrap<unknown>(r)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.project(projectId) });
      void qc.invalidateQueries({ queryKey: keys.items({ projectId }) });
    },
  });
}

export function useDeleteList(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string }) => api.api.lists[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.project(projectId) }),
  });
}
