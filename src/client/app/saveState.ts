// Durable workspace operations and transient mutations stay separate: only the latter need a
// leave-page warning. Server failures keep their draft in the sync queue until explicitly resolved.
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { create } from "zustand";

import { ApiError } from "../data/api";
import { retrySync, useSyncState } from "../data/sync";
import { useOnline } from "../design/core/ConnectionStatus";

/** When an edit last reached the server (set by the query client's mutation cache). */
export const useLastSaved = create<{ at: string | null }>(() => ({ at: null }));
export const markSaved = () => useLastSaved.setState({ at: new Date().toISOString() });

const SLOW_SAVE_MS = 700;

export function useSaveState() {
  const qc = useQueryClient();
  const online = useOnline();
  const mutations = useMutationState({ filters: { status: "pending" }, select: (m) => m.state.isPaused });
  const transientFailed = useMutationState({ filters: { status: "error", predicate: (m) => !(m.state.error instanceof ApiError && m.state.error.operationId) }, select: (m) => m.mutationId }).length;
  const operations = useSyncState((s) => s.operations);
  const syncing = useSyncState((s) => s.saving);
  const persisting = useSyncState((s) => s.persisting);
  const transientRequests = useSyncState((s) => s.transientRequests);
  const storageError = useSyncState((s) => s.storageError);
  const lastSynced = useSyncState((s) => s.lastSynced);
  const lastSaved = useLastSaved((s) => s.at);
  const transientWaiting = mutations.filter(Boolean).length;
  const transientSaving = transientRequests;
  const waiting = operations.filter((operation) => operation.state === "pending").length;
  const failed = operations.length - waiting;
  const saving = transientSaving + Number(syncing);
  // Ordinary edits land in a blink; show only saves taking a noticeable amount of time.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => setSlow(true), SLOW_SAVE_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [saving]);
  return {
    online,
    waiting,
    transientWaiting,
    transientFailed,
    saving,
    slowSaving: slow && saving > 0,
    failed,
    operations,
    storageError,
    lastSaved: lastSynced ?? lastSaved,
    // A durable operation is safe to leave, including during its network replay.
    unsafeToLeave: transientWaiting + transientSaving + persisting + Number(!!storageError),
    retry: () => {
      void qc.resumePausedMutations();
      void retrySync();
    },
  };
}

/** Durable queued edits survive closure; only work not yet saved locally asks before leaving. */
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
