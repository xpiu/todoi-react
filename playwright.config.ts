// Browser gates (DESIGN.md › Quality gates): every key screen in all four theme × mode scopes with
// axe, a reduced-motion check and visual-regression snapshots. Run against the dev servers
// (`npm run dev` is started for you when nothing listens on :5173).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: ".tmp/playwright-report" }]] : "list",
  outputDir: ".tmp/test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: { baseURL: "http://localhost:5173", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "dark", timezoneId: "Europe/Brussels", locale: "en-US" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium" }],
});
