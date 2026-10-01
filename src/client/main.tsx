import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
// Design-system tokens, base styles and theme layers: imported once, here.
import "./design/index.css";
// Applies <html data-theme data-mode …> from the stored preference before the first render.
import "./design/core/appearance";
// Marks <html data-device data-touch> before the first render.
import "./design/core/viewport";
import "./styles.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
