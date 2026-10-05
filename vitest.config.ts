import { defineConfig } from "vitest/config";

// Node unit tests. Storybook browser tests use vitest.storybook.config.ts separately.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/*.integration.test.ts"],
    environment: "node",
  },
});
