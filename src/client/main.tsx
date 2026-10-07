import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Design-system tokens, base styles and theme layers: imported once, here.
import "./design/index.css";
// Applies <html data-theme data-mode …> from the stored preference before the first render.
import "./design/core/appearance";
// Marks <html data-device data-touch> before the first render.
import "./design/core/viewport";
import "./app/app.css";
import { queryClient } from "./queryClient";
import { router } from "./router";
import { initializeSync } from "./data/sync";

initializeSync(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
