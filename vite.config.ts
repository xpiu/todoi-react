import { existsSync, readFileSync } from "node:fs";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * The commit being built: BUILD_SHA when set, otherwise read from .git without the git binary (the Docker
 * build stage has none; .dockerignore lets .git/HEAD and the refs into the context for this).
 */
function commitSha(): string {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA;
  try {
    const head = readFileSync(".git/HEAD", "utf8").trim();
    if (!head.startsWith("ref: ")) return head;
    const ref = head.slice(5);
    if (existsSync(`.git/${ref}`)) return readFileSync(`.git/${ref}`, "utf8").trim();
    const packed = readFileSync(".git/packed-refs", "utf8").split("\n").find((line) => line.endsWith(` ${ref}`));
    return packed?.split(" ")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export default defineConfig(({ mode }) => {
  // The API's own PORT (.env, or the shell's, which wins), so both dev servers agree on it.
  const apiPort = loadEnv(mode, process.cwd(), "").PORT || "3000";
  return {
    plugins: [react()],
    // src/shared/build.ts: one stamp for the client and the server bundle (`npm run build` runs both).
    define: { __TODOI_BUILD__: JSON.stringify({ sha: commitSha(), builtAt: new Date().toISOString() }) },
    server: {
      port: 5173,
      proxy: {
        // The Hono API runs as its own process during development (see `npm run dev:api`).
        "/api": `http://localhost:${apiPort}`,
      },
    },
  };
});
