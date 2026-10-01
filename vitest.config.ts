import { defineConfig } from "vitest/config";

// Unit tests for pure functions run in Node; component tests (Storybook + browser mode) come later.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
