import { MutationCache, QueryClient } from "@tanstack/react-query";

import { notifyFailure } from "./app/feedback";
import { announceChange } from "./app/freshness";
import { markSaved } from "./app/saveState";
import { ApiError } from "./data/api";

export const queryClient = new QueryClient({
  // Every edit that reaches the server moves "Last saved" (ConnectionStatus, Settings › Storage & sync)
  // and tells this browser's other tabs to refresh (app/freshness.ts).
  // Every refused or failed edit says why once (a guest's or viewer's edit comes back 403 and would
  // otherwise just snap back). A call that shows the reason next to its own draft passes `quiet`.
  mutationCache: new MutationCache({
    onSuccess: () => {
      markSaved();
      announceChange();
    },
    onError: (err, vars) => {
      if (!(vars as { quiet?: boolean } | undefined)?.quiet) notifyFailure(err);
    },
  }),
  defaultOptions: {
    queries: { staleTime: 10_000, retry: (failures, error) => failures < 1 && !(error instanceof ApiError && [401, 403, 404].includes(error.status)), networkMode: "offlineFirst" },
    // The transport persists workspace writes before attempting the network, including offline.
    mutations: { networkMode: "always" },
  },
});
