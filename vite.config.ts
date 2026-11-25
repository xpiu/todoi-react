import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // The API's own PORT (.env, or the shell's, which wins), so both dev servers agree on it.
  const apiPort = loadEnv(mode, process.cwd(), "").PORT || "3000";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // The Hono API runs as its own process during development (see `npm run dev:api`).
        "/api": `http://localhost:${apiPort}`,
      },
    },
  };
});
