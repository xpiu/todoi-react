// The key screens in all four theme × mode scopes: the scope lands on <html>, axe finds no serious
// or critical violation, and the screen matches its visual baseline.
import { test } from "@playwright/test";

import { gate, seededItemId, SCOPES, seedProjectId, signIn, useScope, type Screen } from "./helpers";

const SCREENS: Screen[] = [
  { name: "list", open: async (page) => void (await page.goto(`/p/${await seedProjectId(page)}?v=list`)), ready: (page) => page.getByRole("list", { name: / items$/ }).first() },
  { name: "board", open: async (page) => void (await page.goto(`/p/${await seedProjectId(page)}?v=board`)), ready: (page) => page.getByRole("list", { name: / cards$/ }).first() },
  { name: "calendar", open: async (page) => void (await page.goto(`/p/${await seedProjectId(page)}?v=calendar`)), ready: (page) => page.getByRole("grid", { name: "Calendar" }).first() },
  {
    name: "overlay",
    open: async (page) => {
      const pid = await seedProjectId(page);
      await page.goto(`/p/${pid}?v=list&item=${await seededItemId(page, pid)}`);
    },
    ready: (page) => page.getByRole("dialog").first(),
  },
  { name: "settings", open: async (page) => void (await page.goto("/settings?s=appearance")), // Minimal titles the page with the section's name (Design 11-20), Rounded with "Settings"
    ready: (page) => page.getByRole("heading", { level: 1, name: /^(Settings|Appearance)$/ }) },
];

/** The seed's sample "today": its due dates cluster around 27 Aug 2026 (src/server/seed.ts). */
const SAMPLE_NOW = new Date("2026-08-27T10:00:00+02:00");

for (const scope of SCOPES) {
  test.describe(scope, () => {
    test.beforeEach(async ({ page }) => {
      // Pin "today" (Playwright Clock API) to the seed's sample date, so the calendar month, the Today
      // marks, the No date tray and relative dates match the baselines on any day the suite runs.
      await page.clock.setFixedTime(SAMPLE_NOW);
      await useScope(page, scope);
      await signIn(page);
    });
    for (const screen of SCREENS) test(screen.name, ({ page }) => gate(page, scope, screen));
  });
}
