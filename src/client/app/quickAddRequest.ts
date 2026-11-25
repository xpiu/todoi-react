// A one-shot "open quick-add in this project" request (Create › New item with a project destination). The project's
// List or Board view takes it once its lists are on screen, so a request made before navigating still lands there.
// `addTrigger` is where N and that request open quick-add.
import { useEffect, useSyncExternalStore } from "react";

/** The project asked for; a request expires after a few seconds (a Calendar default view has no quick-add to take it) */
let pending: { projectId: string; at: number } | null = null;
const TTL_MS = 5000;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function requestQuickAdd(projectId: string) {
  pending = { projectId, at: performance.now() };
  listeners.forEach((l) => l());
}

/** Opens quick-add (`open`) once a request for `projectId` is pending and the view is `ready` */
export function useQuickAddRequest(projectId: string, ready: boolean, open: () => void) {
  const want = useSyncExternalStore(subscribe, () => pending);
  useEffect(() => {
    // The live request, not the snapshot: a re-run effect (StrictMode) must not open it twice (the add button toggles)
    const req = pending;
    if (!ready || !want || req?.projectId !== projectId) return;
    pending = null;
    if (performance.now() - req.at < TTL_MS) open();
  }, [want, projectId, ready, open]);
}

/**
 * The add trigger quick-add opens from: the one in the list section, group or column `from` sits in (the focused item),
 * else the first one in `scope`. A group that can't take a value (Overdue, This week, No status…) has none, so the
 * first group that can takes it.
 */
export function addTrigger(scope: ParentNode, from: Element | null | undefined) {
  return from?.closest(".td-list-section, .td-list-column")?.querySelector<HTMLButtonElement>("[data-add-item]") ?? scope.querySelector<HTMLButtonElement>("[data-add-item]");
}
