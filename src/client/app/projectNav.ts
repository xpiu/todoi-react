// Going to a project, and knowing which one is on screen. A project's link is its slug (/epd5vjxy38, see
// shared/projectLinks.ts) while everything else in the app knows it by id, so the two meet here and nowhere else.
import { useQuery } from "@tanstack/react-query";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import type { ProjectDetail } from "../data/api";
import { groupsQuery, keys, projectLinkQuery, projectsOf, useGroups } from "../data/queries";
import { queryClient } from "../queryClient";
import type { ProjectSearch } from "../router";

// Slugs the lists on screen may not hold yet: a project made a moment ago.
const learned = new Map<string, string>();
/** A slug never changes, so one seen once is good for the session. */
export const rememberSlug = (project: { id: string; slug: string }) => void learned.set(project.id, project.slug);

/** The slug of a project this browser has seen: in the sidebar, opened, or just made. */
export function slugOf(projectId: string): string | undefined {
  return (
    learned.get(projectId) ??
    projectsOf(queryClient.getQueryData(groupsQuery().queryKey)).find((p) => p.id === projectId)?.slug ??
    queryClient.getQueryData<ProjectDetail>(keys.project(projectId))?.slug
  );
}

type Search = ProjectSearch | ((prev: ProjectSearch) => ProjectSearch);

/** Go to a project by id. One whose slug isn't known here yet goes through its id link, which finds it (OldProjectLink). */
export function useProjectNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (projectId: string, search: Search = {}, opts: { replace?: boolean } = {}) => {
      const slug = slugOf(projectId);
      // `search` as a function reads the query of the page being left, whichever route that is.
      const next = search as ProjectSearch;
      return slug ? navigate({ to: "/$projectSlug", params: { projectSlug: slug }, search: next, ...opts }) : navigate({ to: "/p/$projectId", params: { projectId }, search: next, ...opts });
    },
    [navigate],
  );
}

/** Go to a project as it opens by default: no filters, saved view or open item carried over. */
export function useOpenProject() {
  const go = useProjectNavigate();
  return useCallback((projectId: string) => void go(projectId), [go]);
}

/**
 * The project the address names, if any: its id as soon as it is known. The sidebar's projects answer at
 * once; any other link (a public or shared project, a first visit) asks the server once.
 */
export function useRouteProject() {
  const match = useMatch({ from: "/app/$projectSlug", shouldThrow: false });
  const slug = match?.params.projectSlug;
  const groups = useGroups();
  const known = useMemo(() => (slug ? projectsOf(groups.data).find((p) => p.slug === slug)?.id : undefined), [groups.data, slug]);
  const lookup = useQuery({ ...projectLinkQuery(slug ?? ""), enabled: !!slug && !known });
  return { match, slug, projectId: slug ? (known ?? lookup.data?.id) : undefined, lookup };
}
