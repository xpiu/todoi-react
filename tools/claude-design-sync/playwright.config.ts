// GUI tests against the fixture world and the fake harness (no network, no real repo writes).
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The web server bundles the GUI here, and servers that specs start themselves serve the same bundle,
// never the dist/ of a developer's running tool
process.env.CDS_DIST ??= join(tmpdir(), "cds-e2e", "dist");

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
