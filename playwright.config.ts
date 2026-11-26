// Browser gates (DESIGN.md › Quality gates): every key screen in all four theme × mode scopes with
// axe, a reduced-motion check and visual-regression snapshots. Run against the dev servers
// (`npm run dev` is started for you when nothing listens on :5173). Every test is read-only against
// the seed (the saved-views case cleans up after itself), so they run in parallel. The screenshot gates
// sign in as GATE_USER, whose workspace the global setup puts back as seeded before each run.
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  // Two on CI while a few timing-sensitive specs are flaky on its slower runner (the large-board re-render
  // check, about 1 in 20 locally); a test that needed a retry is reported as flaky, so it stays visible.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: ".tmp/playwright-report" }]] : "list",
  outputDir: ".tmp/test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: { baseURL: BASE_URL, ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "dark", timezoneId: "Europe/Brussels", locale: "en-US" },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium" }],
});
