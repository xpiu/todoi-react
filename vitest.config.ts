import { defineConfig } from "vitest/config";

// The @storybook/addon-vitest UI discovers this file and sets VITEST_STORYBOOK.
// Keep ordinary Vitest runs limited to Node unit tests.
export default defineConfig(async () => {
  if (process.env.VITEST_STORYBOOK === "true") {
    return (await import("./vitest.storybook.config.ts")).default;
  }

  return {
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      exclude: ["src/**/*.integration.test.ts"],
      environment: "node",
    },
  };
});
