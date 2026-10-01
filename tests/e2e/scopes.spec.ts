// The key screens in all four theme × mode scopes: the scope lands on <html>, axe finds no serious
// or critical violation, and the screen matches its visual baseline.
import { test } from "@playwright/test";

import { firstItemId, gate, SCOPES, seedProjectId, signIn, useScope, type Screen } from "./helpers";

const SCREENS: Screen[] = [
  { name: "list", open: async (page) => void (await page.goto(`/p/${await seedProjectId(page)}?v=list`)), ready: (page) => page.getByRole("list", { name: / items$/ }).first() },
  { name: "board", open: async (page) => void (await page.goto(`/p/${await seedProjectId(page)}?v=board`)), ready: (page) => page.getByRole("list", { name: / cards$/ }).first() },
  { name: "calendar", open: async (page) => void (await page.goto(`/p/${await seedProjectId(page)}?v=calendar`)), ready: (page) => page.getByRole("grid", { name: "Calendar" }).first() },
  {
    name: "overlay",
    open: async (page) => {
      const pid = await seedProjectId(page);
      await page.goto(`/p/${pid}?v=list&item=${await firstItemId(page, pid)}`);
    },
    ready: (page) => page.getByRole("dialog").first(),
  },
  { name: "settings", open: async (page) => void (await page.goto("/settings?s=appearance")), ready: (page) => page.getByRole("heading", { level: 1, name: "Settings" }) },
];

for (const scope of SCOPES) {
  test.describe(scope, () => {
    test.beforeEach(async ({ page }) => {
      await useScope(page, scope);
      await signIn(page);
    });
    for (const screen of SCREENS) test(screen.name, ({ page }) => gate(page, scope, screen));
  });
}
