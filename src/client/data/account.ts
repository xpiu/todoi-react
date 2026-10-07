// The signed-in person's own data: profile, API tokens, the full export.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import type { LabelColor } from "../../shared/enums";
import { authClient } from "../auth";
import { api, unwrap } from "./api";

export type Me = InferResponseType<typeof api.api.me.$get, 200>;
export type ApiToken = InferResponseType<typeof api.api.me.tokens.$get, 200>[number];

export const useMe = (enabled = true) => useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api.api.me.$get(undefined, { init: { signal } }).then((r) => unwrap<Me>(r)), enabled });
export const useTokens = (enabled = true) => useQuery({ queryKey: ["me", "tokens"], queryFn: () => api.api.me.tokens.$get().then((r) => unwrap<ApiToken[]>(r)), enabled });
/** The person's signed-in devices (Better Auth sessions). */
export const useSessions = (enabled = true) => useQuery({ queryKey: ["me", "sessions"], queryFn: async () => (await authClient.listSessions()).data ?? [], enabled });

export function useAccountMutations() {
  const qc = useQueryClient();
  const updateMe = useMutation({ mutationFn: (vars: { name?: string; nickname?: string | null; avatarColor?: LabelColor | null }) => api.api.me.$patch({ json: vars }).then((r) => unwrap<Me>(r)), onSettled: () => void qc.invalidateQueries({ queryKey: ["me"] }) });
  const createToken = useMutation({ mutationFn: (vars: { name: string; days?: number }) => api.api.me.tokens.$post({ json: vars }).then((r) => unwrap<ApiToken & { secret: string }>(r)), onSettled: () => void qc.invalidateQueries({ queryKey: ["me", "tokens"] }) });
  const revokeToken = useMutation({ mutationFn: (vars: { id: string }) => api.api.me.tokens[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)), onSettled: () => void qc.invalidateQueries({ queryKey: ["me", "tokens"] }) });
  return { updateMe, createToken, revokeToken };
}
