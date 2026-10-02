// Seeing changes made elsewhere without a reload (DESIGN.md › Data freshness). Another tab of this browser
// says when it saved something (BroadcastChannel), and this tab refreshes what is on screen within a
// moment; other people's changes arrive by a modest poll every 30 seconds while the tab is visible, and
// on focus (TanStack's refetch of stale queries). Never while this tab has edits in flight or waiting
// offline: a refetch then would overwrite their optimistic state. No sync engine (DESIGN.md defers one).
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

import { invalidate, ITEM_DEPENDENTS } from "../data/mutations";

export const POLL_MS = 30_000;
/** Retry a deferred refresh this often until this tab's edits settle. */
const SETTLE_MS = 1_000;
/** Shared data a screen may show: items, projects, labels and what item changes affect. */
const SHARED: readonly QueryKey[] = [["items"], ["project"], ["labels"], ...ITEM_DEPENDENTS];

const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("todoi-changes");

/** Tell this browser's other tabs that the server confirmed a change (the MutationCache calls it). */
export function announceChange() {
  channel?.postMessage("changed");
}

export function useFreshness(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(deferred);
      if (!navigator.onLine) return;
      if (qc.isMutating()) {
        deferred = setTimeout(refresh, SETTLE_MS);
        return;
      }
      void invalidate(qc, SHARED);
    };
    // Another tab saved: refresh even while hidden, so switching to this tab shows it at once.
    let burst: ReturnType<typeof setTimeout> | undefined;
    const onMessage = () => {
      clearTimeout(burst);
      burst = setTimeout(refresh, 200);
    };
    channel?.addEventListener("message", onMessage);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(deferred);
      clearTimeout(burst);
      clearInterval(poll);
      channel?.removeEventListener("message", onMessage);
    };
  }, [enabled, qc]);
}
