import { MutationCache, QueryClient } from "@tanstack/react-query";

import { markSaved } from "./app/saveState";

export const queryClient = new QueryClient({
  // Every edit that reaches the server moves "Last saved" (ConnectionStatus, Settings › Storage & sync).
  mutationCache: new MutationCache({ onSuccess: () => markSaved() }),
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
});
