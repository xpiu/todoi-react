import { MutationCache, QueryClient } from "@tanstack/react-query";

import { notifyFailure } from "./app/feedback";
import { markSaved } from "./app/saveState";

export const queryClient = new QueryClient({
  // Every edit that reaches the server moves "Last saved" (ConnectionStatus, Settings › Storage & sync).
  // Every refused or failed edit says why once (a guest's or viewer's edit comes back 403 and would
  // otherwise just snap back). A call that shows the reason next to its own draft passes `quiet`.
  mutationCache: new MutationCache({
    onSuccess: () => markSaved(),
    onError: (err, vars) => {
      if (!(vars as { quiet?: boolean } | undefined)?.quiet) notifyFailure(err);
    },
  }),
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
});
