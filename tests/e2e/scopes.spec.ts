// The key screens in all four theme × mode scopes: the scope lands on <html>, axe finds no serious
// or critical violation, and the screen matches its visual baseline.
import { test } from "@playwright/test";
import { expect } from "@playwright/test";

import { checkA11y, expectScope, firstItemId, SCOPES, seedProjectId, settle, signIn, useScope } from "./helpers";

for (const scope of SCOPES) {
  test.describe(scope, () => {
    test.beforeEach(async ({ page }) => {
      await useScope(page, scope);
      await signIn(page);
    });
    test("list", async ({ page }) => {
      const pid = await seedProjectId(page);
      await page.goto(`/p/${pid}?v=list`);
      await expectScope(page, scope);
      await expect(page.locator(".td-lsec, .td-list").first()).toBeVisible();
      await settle(page);
      await checkA11y(page, `${scope} list`);
      await expect(page).toHaveScreenshot(`${scope}-list.png`);
    });
    test("board", async ({ page }) => {
      const pid = await seedProjectId(page);
      await page.goto(`/p/${pid}?v=board`);
      await expectScope(page, scope);
      await expect(page.locator(".td-board").first()).toBeVisible();
      await settle(page);
      await checkA11y(page, `${scope} board`);
      await expect(page).toHaveScreenshot(`${scope}-board.png`);
    });
    test("calendar", async ({ page }) => {
      const pid = await seedProjectId(page);
      await page.goto(`/p/${pid}?v=calendar`);
      await expectScope(page, scope);
      await expect(page.locator(".td-calview-grid, .td-calyear, .td-calday").first()).toBeVisible();
      await settle(page);
      await checkA11y(page, `${scope} calendar`);
      await expect(page).toHaveScreenshot(`${scope}-calendar.png`);
    });
    test("item overlay", async ({ page }) => {
      const pid = await seedProjectId(page);
      const item = await firstItemId(page, pid);
      await page.goto(`/p/${pid}?v=list&item=${item}`);
      await expectScope(page, scope);
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await settle(page);
      await checkA11y(page, `${scope} overlay`);
      await expect(page).toHaveScreenshot(`${scope}-overlay.png`);
    });
    test("settings", async ({ page }) => {
      await page.goto("/settings?s=appearance");
      await expectScope(page, scope);
      await expect(page.locator(".td-set-group").first()).toBeVisible();
      await settle(page);
      await checkA11y(page, `${scope} settings`);
      await expect(page).toHaveScreenshot(`${scope}-settings.png`);
    });
  });
}
