import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The Hono API runs as its own process during development (see `npm run dev:api`).
      "/api": "http://localhost:3000",
    },
  },
});
