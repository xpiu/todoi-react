import { defineConfig } from "vitest/config";

// Engine tests: fixture repos and snapshots in tmp, never the real repo or .state
export default defineConfig({
  test: {
    include: ["tools/claude-design-sync/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
