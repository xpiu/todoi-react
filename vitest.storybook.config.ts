import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

import { MODES, THEMES } from "./src/client/design/core/themes.ts";

// The addon assigns one fixed project name in UI mode, so use a single project
// with preview globals there. CLI runs retain the complete theme/mode matrix.
const scopes = process.env.VITEST_STORYBOOK === "true"
  ? [{ name: "storybook", initialGlobals: {} }]
  : THEMES.flatMap((theme) => MODES.map((mode) => ({
    name: `storybook-${theme.id}-${mode.id}`,
    initialGlobals: { theme: theme.id, mode: mode.id },
  })));

// Separate from Node unit tests and database integration tests. No API or PostgreSQL needed.
export default defineConfig({
  test: {
    projects: scopes.map(({ name, initialGlobals }) => ({
      plugins: [storybookTest({
        configDir: fileURLToPath(new URL(".storybook", import.meta.url)),
        initialGlobals,
      })],
      test: {
        name,
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          instances: [{ browser: "chromium" as const }],
          viewport: { width: 1280, height: 800 },
        },
      },
    })),
  },
});
