import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

import { MODES, THEMES } from "./src/client/design/core/themes.ts";

// Separate from Node unit tests and database integration tests. No API or PostgreSQL needed.
export default defineConfig({
  test: {
    projects: THEMES.flatMap((theme) => MODES.map((mode) => ({
      plugins: [storybookTest({
        configDir: fileURLToPath(new URL(".storybook", import.meta.url)),
        initialGlobals: { theme: theme.id, mode: mode.id },
      })],
      test: {
        name: `storybook-${theme.id}-${mode.id}`,
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          instances: [{ browser: "chromium" as const }],
          viewport: { width: 1280, height: 800 },
        },
      },
    }))),
  },
});
