// Item and list mutations with optimistic cache patches (README: "TanStack Query with optimistic
// mutations"). Each mutation knows the items scope it touches so the patch lands in the right cache.
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { nanoid } from "nanoid";

import type { CreateItemInput, DuplicateItemInput, MoveItemInput, UpdateItemInput } from "../../shared/items";
import type { CreateListInput, UpdateListInput } from "../../shared/projects";
import { applyCompletion, statusChange } from "../../shared/completion";
import type { ItemStatus } from "../../shared/item-status";
import { api, unwrap, type DuplicateResult, type Item, type MoveResult, type ProjectDetail, type UpdatedItem } from "./api";
import { keys } from "./queries";

export const newId = () => nanoid();

/** A call that reports its own failure (next to its draft, in an Undo toast, in a summary) passes `quiet`. */
export type Quiet = { quiet?: boolean };

export type ItemsScope = { projectId: string } | { listId: string };

/**
 * What any item change can leave stale besides the items cache it patched (DESIGN.md › Data freshness):
 * the sidebar and Projects counts, Archive and Trash, the Inbox badge, item details, activity and search.
 * Caches on screen refetch at once; the rest are only marked stale and refetch when shown.
 */
export const ITEM_DEPENDENTS: readonly QueryKey[] = [keys.groups, ["archive"], keys.inboxUnread, ["item"], ["activity"], ["search"]];

/** Optimistic helper: patch the scope's items cache before the request, roll back on error, refetch after. */
function useOptimistic<TVars, TResult>(scope: ItemsScope, mutationFn: (vars: TVars) => Promise<TResult>, patch: (items: Item[], vars: TVars) => Item[], extraKeys: QueryKey[] | ((vars: TVars) => QueryKey[]) = []) {
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
    // Roll back; the query client's mutation cache says why (src/client/queryClient.ts).
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: (_data, _err, vars) => {
      for (const k of [key, ...ITEM_DEPENDENTS, ...(typeof extraKeys === "function" ? extraKeys(vars) : extraKeys)]) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

/**
 * The item a create will produce, predicted by the API's own rules so nothing jumps when the refetch lands:
 * a Status from the list's role (and done in a Done list), and the place among the list's top-level
 * items (`placeAmongSiblings` on the server: top or end, siblings renumbered). Subitems go last.
 */
export function optimisticCreate(items: Item[], vars: CreateItemInput, dest: { listId: string; projectId: string | null; statusRole: ItemStatus | null }): Item[] {
  const now = new Date().toISOString();
  const state = statusChange({ status: null, done: false, priorStatus: null }, vars.status === undefined ? dest.statusRole : vars.status);
  const item: Item = {
    id: vars.id,
    title: vars.title,
    listId: dest.listId,
    projectId: dest.projectId,
    parentItemId: vars.parentItemId ?? null,
    keyNumber: null,
    description: vars.description ?? null,
    ...state,
    priority: vars.priority ?? null,
    startDate: vars.startDate ?? null,
    dueDate: vars.dueDate ?? null,
    dueTime: vars.dueTime ?? null,
    repeatRule: null,
    repeatCount: 0,
    cover: null,
    notification: null,
    unread: false,
    position: 0,
    createdBy: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    labelIds: vars.labelIds ?? [],
    assigneeIds: vars.assigneeIds ?? [],
    attachmentCount: 0,
  };
  if (vars.parentItemId) return [...items, { ...item, position: Math.max(-1, ...items.filter((it) => it.listId === dest.listId).map((it) => it.position)) + 1 }];
  const siblings = items.filter((it) => it.listId === dest.listId && !it.parentItemId).sort((x, y) => x.position - y.position || x.createdAt.localeCompare(y.createdAt));
  const at = vars.position === "top" ? 0 : siblings.length;
  const renumbered = new Map(siblings.map((it, i) => [it.id, i < at ? i : i + 1]));
  return [...items.map((it) => (renumbered.has(it.id) ? { ...it, position: renumbered.get(it.id)! } : it)), { ...item, position: at }];
}

export function useCreateItem(scope: ItemsScope) {
  const qc = useQueryClient();
  const projectId = "projectId" in scope ? scope.projectId : null;
  const destOf = (vars: CreateItemInput, cached: Item[]) => {
    // Without a list the API files the item in the caller's Inbox: the list the Inbox screen's items are in.
    const listId = vars.listId ?? cached[0]?.listId ?? ("listId" in scope ? scope.listId : "");
    const list = projectId ? qc.getQueryData<ProjectDetail>(keys.project(projectId))?.lists.find((l) => l.id === listId) : undefined;
    return { listId, projectId, statusRole: list?.statusRole ?? null };
  };
  return useOptimistic(
    scope,
    // The returned record replaces the prediction at once (its key, server timestamps); the refetch follows.
    (vars: CreateItemInput) =>
      api.api.items.$post({ json: vars }).then(async (r) => {
        const made = await unwrap<Item>(r);
        qc.setQueryData<Item[]>(keys.items(scope), (old) => old?.map((it) => (it.id === made.id ? made : it)));
        return made;
      }),
    (items, vars) => optimisticCreate(items, vars, destOf(vars, items)),
    projectId ? [keys.project(projectId)] : [],
  );
}

export function useUpdateItem(scope: ItemsScope) {
  return useOptimistic(
    scope,
    ({ quiet: _quiet, ...vars }: { id: string } & Quiet & UpdateItemInput) => api.api.items[":id"].$patch({ param: { id: vars.id }, json: vars }).then((r) => unwrap<UpdatedItem>(r)),
    // The API's own completion rules predict the result (a recurring item moves to its next due).
    (items, { id, quiet: _quiet, done, status, ifDue, ...changes }) =>
      items.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...changes };
        const stale = done === true && !!next.repeatRule && ifDue !== undefined && next.dueDate !== ifDue;
        return stale ? next : { ...next, ...applyCompletion(next, { done, status }).patch };
      }),
  );
}

export function useDeleteItem(scope: ItemsScope) {
  const projectId = "projectId" in scope ? scope.projectId : null;
  return useOptimistic(
    scope,
    ({ id }: { id: string } & Quiet) => api.api.items[":id"].$delete({ param: { id } }).then((r) => unwrap<void>(r)),
    (items, { id }) => items.filter((it) => it.id !== id && it.parentItemId !== id),
    projectId ? [keys.project(projectId)] : [],
  );
}

/** Restore the existing record, then fetch its complete relationships instead of reconstructing it. */
export function useRestoreItem(scope: ItemsScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string } & Quiet) => api.api.items[":id"].$patch({ param: { id }, json: { deleted: false } }).then((r) => unwrap(r)),
    onSuccess: async () => {
      const refresh: QueryKey[] = [keys.items(scope), ...ITEM_DEPENDENTS];
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

/** The item and its descendants, as one id set. */
const familyIds = (items: Item[], id: string) => {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const it of items) {
      if (!it.parentItemId || !ids.has(it.parentItemId) || ids.has(it.id)) continue;
      ids.add(it.id);
      grew = true;
    }
  }
  return ids;
};

/**
 * Move within or across lists; the server returns what changed (list, Status, key, adjustments) for the toast.
 * `toProjectId` names another project (or null for an Inbox): the family leaves this cache, and both sides refresh.
 */
export function useMoveItem(scope: ItemsScope) {
  const projectId = "projectId" in scope ? scope.projectId : null;
  return useOptimistic(
    scope,
    (vars: { id: string; toProjectId?: string | null } & Quiet & MoveItemInput) => api.api.items[":id"].move.$post({ param: { id: vars.id }, json: { listId: vars.listId, position: vars.position, restore: vars.restore } }).then((r) => unwrap<MoveResult>(r)),
    (items, { id, listId, position, toProjectId }) => {
      if (toProjectId !== undefined && toProjectId !== projectId) {
        const family = familyIds(items, id);
        return items.filter((it) => !family.has(it.id));
      }
      const moving = items.find((it) => it.id === id);
      if (!moving) return items;
      const rest = items.filter((it) => it.id !== id);
      const siblings = rest.filter((it) => it.listId === listId && !it.parentItemId).sort((a, b) => a.position - b.position);
      const at = position == null ? siblings.length : Math.max(0, Math.min(position, siblings.length));
      const order = [...siblings.slice(0, at), { ...moving, listId }, ...siblings.slice(at)];
      const pos = new Map(order.map((it, i) => [it.id, i]));
      return [...rest.map((it) => (pos.has(it.id) ? { ...it, position: pos.get(it.id)! } : it)), { ...moving, listId, position: pos.get(id)! }];
    },
    // Across projects both sides change (items, keys, labels, counts); inactive caches only go stale.
    ({ toProjectId }) => (toProjectId === undefined ? (projectId ? [keys.project(projectId)] : []) : [["items"], ["project"], ["labels"]]),
  );
}

/**
 * Copy an item (with its subitems) into a list. The API decides keys, labels and placement, so nothing is
 * predicted: a copy in this scope lands from the response; a copy elsewhere only refreshes that destination.
 */
export function useDuplicateItem(scope: ItemsScope) {
  const qc = useQueryClient();
  const projectId = "projectId" in scope ? scope.projectId : null;
  return useOptimistic(
    scope,
    (vars: { sourceId: string; toProjectId: string | null } & DuplicateItemInput) =>
      api.api.items[":id"].duplicate.$post({ param: { id: vars.sourceId }, json: { id: vars.id, listId: vars.listId } }).then(async (r) => {
        const made = await unwrap<DuplicateResult>(r);
        // The Inbox scope has no project: a copy lands here when it stays in the same project (or Inbox).
        if (vars.toProjectId === projectId) qc.setQueryData<Item[]>(keys.items(scope), (old) => (old ? [...old.filter((it) => !made.items.some((m) => m.id === it.id)), ...made.items] : old));
        return made;
      }),
    (items) => items,
    ({ toProjectId }) => (toProjectId ? [keys.project(toProjectId), keys.items({ projectId: toProjectId }), ["labels"]] : [["items"]]),
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
    // `rewritten`: how many items an applyToExisting role change updated.
    mutationFn: ({ quiet: _quiet, ...vars }: { id: string } & Quiet & UpdateListInput) => api.api.lists[":id"].$patch({ param: { id: vars.id }, json: vars }).then((r) => unwrap<{ rewritten: number }>(r)),
    // A role applied to existing items changes their Status and done, so counts and activity too.
    onSettled: () => {
      for (const k of [keys.project(projectId), keys.items({ projectId }), ...ITEM_DEPENDENTS]) void qc.invalidateQueries({ queryKey: k });
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
