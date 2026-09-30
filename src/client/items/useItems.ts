import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { nanoid } from "nanoid";

import type { UpdateItemInput } from "../../shared/items";
import { api } from "../api";

export type Item = InferResponseType<typeof api.api.items.$get>[number];

const itemsKey = ["items"] as const;

function ensureOk(res: { ok: boolean; status: number; statusText: string }) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export function useItems() {
  return useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      const res = await api.api.items.$get();
      ensureOk(res);
      return res.json();
    },
  });
}

/**
 * Optimistic mutations: the cache is patched before the request is sent, rolled back on error,
 * and always re-fetched once the request settles (README: "TanStack Query with optimistic mutations").
 */
function useOptimisticItems<TVars>(
  mutationFn: (vars: TVars) => Promise<unknown>,
  patch: (items: Item[], vars: TVars) => Item[],
) {
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

export function useCreateItem() {
  return useOptimisticItems(
    (vars: { id: string; title: string }) => api.api.items.$post({ json: vars }).then(ensureOk),
    (items, vars) => {
      const now = new Date().toISOString();
      return [...items, { ...vars, status: "TODO", createdAt: now, updatedAt: now }];
    },
  );
}

export function useUpdateItem() {
  return useOptimisticItems(
    (vars: { id: string } & UpdateItemInput) =>
      api.api.items[":id"].$patch({ param: { id: vars.id }, json: vars }).then(ensureOk),
    (items, { id, ...changes }) => items.map((it) => (it.id === id ? { ...it, ...changes } : it)),
  );
}

export function useDeleteItem() {
  return useOptimisticItems(
    (vars: { id: string }) => api.api.items[":id"].$delete({ param: vars }).then(ensureOk),
    (items, { id }) => items.filter((it) => it.id !== id),
  );
}

export const newItemId = () => nanoid();
