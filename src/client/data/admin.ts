// The operator console's data (/admin): an overview of Todoi's health and the account list.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { api, unwrap } from "./api";

export type AdminOverview = InferResponseType<typeof api.api.admin.overview.$get, 200>;
export type AdminAccount = InferResponseType<typeof api.api.admin.accounts.$get, 200>["accounts"][number];

export const useAdminOverview = () => useQuery({ queryKey: ["admin", "overview"], queryFn: ({ signal }) => api.api.admin.overview.$get(undefined, { init: { signal } }).then((r) => unwrap<AdminOverview>(r)), refetchInterval: 30_000 });
export const useAdminAccounts = (q: string) => useQuery({ queryKey: ["admin", "accounts", q], queryFn: ({ signal }) => api.api.admin.accounts.$get({ query: { q: q || undefined } }, { init: { signal } }).then((r) => unwrap<{ accounts: AdminAccount[] }>(r)).then((r) => r.accounts) });

export function useAdminMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  const resolveError = useMutation({ mutationFn: (fingerprint: string) => api.api.admin.errors[":fingerprint"].resolve.$post({ param: { fingerprint } }).then((r) => unwrap<void>(r)), onSettled: refresh });
  const retryJob = useMutation({ mutationFn: (id: string) => api.api.admin.jobs[":id"].retry.$post({ param: { id } }).then((r) => unwrap<void>(r)), onSettled: refresh });
  const confirmEmail = useMutation({ mutationFn: (id: string) => api.api.admin.accounts[":id"]["confirm-email"].$post({ param: { id } }).then((r) => unwrap<void>(r)), onSettled: () => qc.invalidateQueries({ queryKey: ["admin"] }) });
  return { resolveError, retryJob, confirmEmail };
}
