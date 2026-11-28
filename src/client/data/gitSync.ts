// Git sync from the client: a project's connection to a file in a GitHub repository, and every connection
// in the person's projects (Settings › Storage & sync). Syncing is online-only — it talks to GitHub — so
// these calls never go through the offline queue. After a sync that changed todoi, project data refreshes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { GitCheckInput, GitConnectInput, GitConnectionView, GitHubLinkView, GitRunView } from "../../shared/gitSync";
import { api, unwrap } from "./api";
import { useProjectMutations } from "./projects";

export type { GitConnectionView, GitRunView };

export const useGitConnection = (projectId: string | null | undefined) =>
  useQuery({
    queryKey: ["git", projectId],
    queryFn: ({ signal }) => api.api.projects[":id"].git.$get({ param: { id: projectId! } }, { init: { signal } }).then((r) => unwrap<{ connection: GitConnectionView | null }>(r)).then((r) => r.connection),
    enabled: !!projectId,
  });

export const useGitConnections = (enabled = true) =>
  // Pushes to GitHub sync on the server by themselves: refresh what Settings shows while it is open.
  useQuery({ queryKey: ["git"], queryFn: ({ signal }) => api.api.git.$get(undefined, { init: { signal } }).then((r) => unwrap<{ connections: GitConnectionView[]; github?: Pick<GitHubLinkView, "app" | "login"> }>(r)), enabled, refetchInterval: 15_000 });

/**
 * The person's link to GitHub through the GitHub App, and the repositories they can pick. Asked only while
 * the connect dialog is open, and again when the window regains focus: that is how a repository added on
 * GitHub in another tab shows up.
 */
export const useGitHubLink = (enabled: boolean) =>
  useQuery({ queryKey: ["git", "github"], queryFn: ({ signal }) => api.api.git.github.$get(undefined, { init: { signal } }).then((r) => unwrap<GitHubLinkView>(r)), enabled, refetchOnWindowFocus: "always", retry: false });

/** Leave for GitHub to authorize (and install) the app; the server brings the browser back to `next`. A full navigation: the route redirects off-site. */
export const continueWithGitHub = (next: string) => window.location.assign(`/api/git/github/start?next=${encodeURIComponent(next)}`);

export function useGitMutations() {
  const qc = useQueryClient();
  const { refresh } = useProjectMutations();
  const settle = async (projectId: string, run?: GitRunView) => {
    await qc.invalidateQueries({ queryKey: ["git"] });
    // Pulled changes are project data: lists, items, labels, comments.
    if (!run || run.pulled || run.outcome === "undone") await refresh(projectId);
  };
  const check = useMutation({ mutationFn: ({ projectId, ...json }: GitCheckInput & { projectId: string }) => api.api.projects[":id"].git.check.$post({ param: { id: projectId }, json }).then((r) => unwrap<{ repo: { fullName: string; defaultBranch: string; private: boolean }; fileExists: boolean }>(r)) });
  const connect = useMutation({
    mutationFn: ({ projectId, ...json }: GitConnectInput & { projectId: string }) => api.api.projects[":id"].git.$post({ param: { id: projectId }, json }).then((r) => unwrap<{ connection: GitConnectionView }>(r)),
    onSuccess: (r, v) => settle(v.projectId, r.connection.runs[0]),
  });
  const update = useMutation({
    mutationFn: ({ projectId, ...json }: { projectId: string; conflictPolicy?: "ask" | "todoi" | "file"; autoSync?: boolean; token?: string }) => api.api.projects[":id"].git.$patch({ param: { id: projectId }, json }).then((r) => unwrap<{ connection: GitConnectionView }>(r)),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["git"] }).then(() => qc.invalidateQueries({ queryKey: ["git", v.projectId] })),
  });
  const sync = useMutation({
    mutationFn: ({ projectId, ...json }: { projectId: string; choices?: Record<string, "ours" | "theirs">; resolveAll?: "ours" | "theirs" }) => api.api.projects[":id"].git.sync.$post({ param: { id: projectId }, json }).then((r) => unwrap<{ run: GitRunView; connection: GitConnectionView }>(r)),
    onSuccess: (r, v) => settle(v.projectId, r.run),
  });
  const undo = useMutation({
    mutationFn: ({ projectId }: { projectId: string }) => api.api.projects[":id"].git.undo.$post({ param: { id: projectId } }).then((r) => unwrap<{ run: GitRunView; connection: GitConnectionView }>(r)),
    onSuccess: (_r, v) => settle(v.projectId),
  });
  const disconnect = useMutation({ mutationFn: ({ projectId }: { projectId: string }) => api.api.projects[":id"].git.$delete({ param: { id: projectId } }).then((r) => unwrap<void>(r)), onSuccess: () => qc.invalidateQueries({ queryKey: ["git"] }) });
  const unlinkGitHub = useMutation({ mutationFn: () => api.api.git.github.$delete().then((r) => unwrap<void>(r)), onSuccess: () => qc.invalidateQueries({ queryKey: ["git", "github"] }) });
  return { check, connect, update, sync, undo, disconnect, unlinkGitHub };
}
