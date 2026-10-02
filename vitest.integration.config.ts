import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    hookTimeout: 30_000,
  },
});
