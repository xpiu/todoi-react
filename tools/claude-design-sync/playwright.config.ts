// GUI tests against the fixture world and the fake harness (no network, no real repo writes).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  outputDir: "test-results",
  reporter: "list",
  use: { baseURL: "http://localhost:4478", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: {
    command: "node ../../node_modules/tsx/dist/cli.mjs test/e2e-server.ts",
    url: "http://localhost:4478/api/state",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
