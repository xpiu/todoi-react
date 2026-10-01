import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { nanoid } from "nanoid";

import type { CreateItemInput, UpdateItemInput } from "../../shared/items";
import { api } from "../api";

export type Item = InferResponseType<typeof api.api.items.$get, 200>[number];

const itemsKey = ["items"] as const;

function ensureOk(res: { ok: boolean; status: number; statusText: string }) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

/** The caller's Inbox until views exist (Phase 4); then keyed by list / project. */
export function useItems() {
  return useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      const res = await api.api.items.$get({ query: {} });
      ensureOk(res);
      return (await res.json()) as Item[];
    },
  });
}

/**
 * Optimistic mutations: the cache is patched before the request is sent, rolled back on error,
 * and always re-fetched once the request settles (README: "TanStack Query with optimistic mutations").
 */
function useOptimisticItems<TVars>(mutationFn: (vars: TVars) => Promise<unknown>, patch: (items: Item[], vars: TVars) => Item[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: itemsKey });
      const previous = qc.getQueryData<Item[]>(itemsKey);
      qc.setQueryData<Item[]>(itemsKey, (old = []) => patch(old, vars));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(itemsKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: itemsKey }),
  });
}

/** The optimistic shape of a just-created item (the server fills in the rest). */
function placeholderItem(vars: CreateItemInput, siblings: Item[]): Item {
  const now = new Date().toISOString();
  return {
    id: vars.id,
    title: vars.title,
    listId: vars.listId ?? siblings[0]?.listId ?? "",
    projectId: siblings[0]?.projectId ?? null,
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
    position: siblings.length,
    createdBy: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function useCreateItem() {
  return useOptimisticItems(
    (vars: CreateItemInput) => api.api.items.$post({ json: vars }).then(ensureOk),
    (items, vars) => [...items, placeholderItem(vars, items)],
  );
}

export function useUpdateItem() {
  return useOptimisticItems(
    (vars: { id: string } & UpdateItemInput) => api.api.items[":id"].$patch({ param: { id: vars.id }, json: vars }).then(ensureOk),
    (items, { id, ...changes }) =>
      items.map((it) => {
        if (it.id !== id) return it;
        // Mirror the server's checkbox semantics so the row settles where it will land.
        const doneChange = changes.done === undefined ? {} : changes.done ? { done: true, status: "DONE" as const, priorStatus: it.status } : { done: false, status: it.priorStatus, priorStatus: null };
        return { ...it, ...changes, ...doneChange };
      }),
  );
}

export function useDeleteItem() {
  return useOptimisticItems(
    (vars: { id: string }) => api.api.items[":id"].$delete({ param: vars }).then(ensureOk),
    (items, { id }) => items.filter((it) => it.id !== id),
  );
}

export const newItemId = () => nanoid();
