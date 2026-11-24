// The project the person was last in, in this tab, and how they were looking at it (the route's view search: `v`, `f`,
// `s`, `view`): what "Current project" means for Create › New item and in Settings › General › Default destination
// ("Current project — <name>") while another page is open, and where the top bar's Back returns to (that project in
// that view). Kept in sessionStorage, so a reload of the tab keeps it.
import { useSyncExternalStore } from "react";

import type { ProjectSearch } from "../router";

/** The parts of the project route's search that make up the view; an open item or rename is not kept */
export type LastProjectView = Pick<ProjectSearch, "view" | "v" | "f" | "s">;

const KEY = "td-last-project";
const VIEW_KEY = "td-last-project-view";
const read = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode: this page view only */
  }
};
const viewOf = (search: LastProjectView | undefined): LastProjectView => {
  const out: LastProjectView = {};
  if (search?.view) out.view = search.view;
  if (search?.v) out.v = search.v;
  if (search?.f) out.f = search.f;
  if (search?.s) out.s = search.s;
  return out;
};
const readView = (): LastProjectView => {
  try {
    return viewOf(JSON.parse(read(VIEW_KEY) ?? "{}") as LastProjectView);
  } catch {
    return {};
  }
};

let last: string | null = read(KEY);
let lastView: LastProjectView = readView();
const listeners = new Set<() => void>();

export function setLastProject(projectId: string, search?: LastProjectView) {
  const view = viewOf(search);
  const viewJson = JSON.stringify(view);
  if (last === projectId && JSON.stringify(lastView) === viewJson) return;
  last = projectId;
  lastView = view;
  write(KEY, projectId);
  write(VIEW_KEY, viewJson);
  listeners.forEach((l) => l());
}

export const getLastProject = () => last;
/** The view the last project was left in (empty: the project's default view) */
export const getLastProjectView = () => lastView;

export const useLastProject = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => last,
  );
