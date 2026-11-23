// The project the person was last in, in this tab: what "Current project" means for Create › New item and in
// Settings › General › Default destination ("Current project — <name>") while another page is open. Kept in
// sessionStorage, so a reload of the tab keeps it.
import { useSyncExternalStore } from "react";

const KEY = "td-last-project";
const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
let last: string | null = read();
const listeners = new Set<() => void>();

export function setLastProject(projectId: string) {
  if (last === projectId) return;
  last = projectId;
  try {
    sessionStorage.setItem(KEY, projectId);
  } catch {
    /* private mode: this page view only */
  }
  listeners.forEach((l) => l());
}

export const getLastProject = () => last;

export const useLastProject = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => last,
  );
