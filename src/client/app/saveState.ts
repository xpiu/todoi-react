// What is and isn't saved, from TanStack Query's own mutation cache: edits waiting for the connection
// (paused — kept in this tab's memory only), edits on their way, and edits the server refused (each was
// rolled back on screen and explained in a message). Feeds ConnectionStatus, Settings › Storage & sync
// and the leave-page guard. Durable offline replay (surviving a reload) is not built; the copy says so.
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { create } from "zustand";

import { useOnline } from "../design/core/ConnectionStatus";

/** When an edit last reached the server (set by the query client's mutation cache). */
export const useLastSaved = create<{ at: string | null }>(() => ({ at: null }));
export const markSaved = () => useLastSaved.setState({ at: new Date().toISOString() });

const SLOW_SAVE_MS = 700;

export function useSaveState() {
  const qc = useQueryClient();
  const online = useOnline();
  const pending = useMutationState({ filters: { status: "pending" }, select: (m) => m.state.isPaused });
  const failed = useMutationState({ filters: { status: "error" }, select: (m) => m.mutationId }).length;
  const waiting = pending.filter(Boolean).length;
  const saving = pending.length - waiting;
  const lastSaved = useLastSaved((s) => s.at);
  // Ordinary edits land in a blink; only a save that takes a while (a slow link, a drained queue) shows.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => setSlow(true), SLOW_SAVE_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [saving]);
  const cache = qc.getMutationCache();
  return {
    online,
    /** Paused until the connection returns; lost if this tab reloads or closes first */
    waiting,
    saving,
    /** Saves under way for a noticeable time */
    slowSaving: slow && saving > 0,
    failed,
    lastSaved,
    /** Send what is waiting now (after a reconnect the browser has not announced yet) */
    retry: () => void qc.resumePausedMutations(),
    /** Forget the edits that never reached the server and show the server's state again */
    discardWaiting: () => {
      for (const m of cache.findAll({ status: "pending" })) if (m.state.isPaused) cache.remove(m);
      void qc.invalidateQueries();
    },
    /** The refusals were explained when they happened; this only clears the count */
    clearFailed: () => {
      for (const m of cache.findAll({ status: "error" })) cache.remove(m);
    },
  };
}

/** While edits are waiting or on their way, leaving the page asks first (the browser's own prompt). */
export function useLeaveGuard(unsaved: number) {
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);
}
