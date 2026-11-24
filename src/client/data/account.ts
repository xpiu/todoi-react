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
export type CalendarFeed = InferResponseType<(typeof api.api.me)["calendar-feed"]["$get"], 200>;
/** The person's private calendar feed link (the server makes it on first read). */
export const useCalendarFeed = (enabled = true) => useQuery({ queryKey: ["me", "calendar-feed"], queryFn: ({ signal }) => api.api.me["calendar-feed"].$get(undefined, { init: { signal } }).then((r) => unwrap<CalendarFeed>(r)), enabled });
/** The person's signed-in devices (Better Auth sessions). */
export const useSessions = (enabled = true) => useQuery({ queryKey: ["me", "sessions"], queryFn: async () => (await authClient.listSessions()).data ?? [], enabled });

export function useAccountMutations() {
  const qc = useQueryClient();
  const updateMe = useMutation({ mutationFn: (vars: { name?: string; nickname?: string | null; avatarColor?: LabelColor | null }) => api.api.me.$patch({ json: vars }).then((r) => unwrap<Me>(r)), onSettled: () => void qc.invalidateQueries({ queryKey: ["me"] }) });
  const updateAvatar = useMutation({
    mutationFn: async ({ file }: { file: File | null; quiet?: boolean }) => {
      if (!file) return api.api.me.avatar.$delete().then((r) => unwrap<Me>(r));
      const body = new FormData();
      body.set("file", file);
      return fetch("/api/me/avatar", { method: "POST", body }).then((r) => unwrap<Me>(r));
    },
    onSuccess: async () => {
      await authClient.getSession({ query: { disableCookieCache: true } });
      authClient.$store.notify("$sessionSignal");
      await Promise.all([qc.invalidateQueries({ queryKey: ["me"] }), qc.invalidateQueries({ queryKey: ["project"] }), qc.invalidateQueries({ queryKey: ["activity"] }), qc.invalidateQueries({ queryKey: ["item"] })]);
    },
  });
  const createToken = useMutation({ mutationFn: (vars: { name: string; days?: number }) => api.api.me.tokens.$post({ json: vars }).then((r) => unwrap<ApiToken & { secret: string }>(r)), onSettled: () => void qc.invalidateQueries({ queryKey: ["me", "tokens"] }) });
  const revokeToken = useMutation({ mutationFn: (vars: { id: string }) => api.api.me.tokens[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)), onSettled: () => void qc.invalidateQueries({ queryKey: ["me", "tokens"] }) });
  /** A new feed link; the old one stops at once, so the answer replaces the cached link. `quiet`: the caller shows a failure itself. */
  const resetCalendarFeed = useMutation({ mutationFn: (_: { quiet?: boolean }) => api.api.me["calendar-feed"].reset.$post().then((r) => unwrap<CalendarFeed>(r)), onSuccess: (feed) => qc.setQueryData(["me", "calendar-feed"], feed) });
  // A change of sign-in address: the server keeps it until the emailed link is opened (`pendingEmail` on /api/me).
  const refreshMe = () => qc.invalidateQueries({ queryKey: ["me"] });
  const requestEmailChange = useMutation({ mutationFn: (vars: { email: string; password: string; quiet?: boolean }) => api.api.me["email-change"].$post({ json: { email: vars.email, password: vars.password } }).then((r) => unwrap<{ pendingEmail: string }>(r)), onSuccess: refreshMe });
  const resendEmailChange = useMutation({ mutationFn: (_vars: { quiet?: boolean }) => api.api.me["email-change"].resend.$post().then((r) => unwrap<{ pendingEmail: string }>(r)), onSuccess: refreshMe });
  const cancelEmailChange = useMutation({ mutationFn: (_vars: { quiet?: boolean }) => api.api.me["email-change"].$delete().then((r) => unwrap<void>(r)), onSettled: refreshMe });
  return { updateMe, updateAvatar, createToken, revokeToken, resetCalendarFeed, requestEmailChange, resendEmailChange, cancelEmailChange };
}
