import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

// Below the desktop class the sidebar is a sheet. Phone: modal (WAI-ARIA modal dialog pattern): focus stays
// inside, Escape or the scrim closes it, focus returns to the toggle, and the page behind is inert.
// Tablet: it opens under the chrome rows, which stay usable.
const sheet = (page: Page) => page.getByRole("dialog", { name: "Sidebar" });

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the sidebar is a modal sheet for keyboard users", async ({ page }) => {
    await signIn(page);
    await page.goto("/projects");
    const toggle = page.getByRole("button", { name: "Show sidebar" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toBeVisible();
    // The page behind takes no pointer input (Base UI covers it while the sheet is modal).
    const hit = await page.evaluate(() => document.elementFromPoint(20, 400)?.closest("main") != null);
    expect(hit).toBe(false);

    // Tabbing (both ways) never leaves the sheet.
    for (const key of [...Array(25).fill("Tab"), ...Array(10).fill("Shift+Tab")]) {
      await page.keyboard.press(key);
      // Base UI's focus guards bounce focus back in a moment later; settle before checking.
      await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Sidebar"]')), { message: `focus after ${key}`, timeout: 1000 }).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("touch: the scrim closes without reaching the page, rows navigate, project menus open", async ({ page }) => {
    await signIn(page);
    await page.goto("/projects");
    const url = page.url();
    await page.getByRole("button", { name: "Show sidebar" }).tap();
    await expect(sheet(page)).toBeVisible();

    // The page behind does not scroll or take the tap.
    const before = await page.evaluate(() => document.scrollingElement!.scrollTop);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(before);
    await page.touchscreen.tap(40, 300);
    await expect(sheet(page)).toBeHidden();
    expect(page.url()).toBe(url);

    // Row menus are visible without hover, rows are comfortable targets, and long names stay inside.
    await page.getByRole("button", { name: "Show sidebar" }).tap();
    await expect.poll(() => sheet(page).evaluate((el) => el.getAnimations().length)).toBe(0);
    const more = sheet(page).getByRole("button", { name: /^Settings for / }).first();
    await expect(more).toBeVisible();
    expect(await more.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    const row = sheet(page).locator(".td-sidebar-rowwrap").first();
    const rowBox = (await row.boundingBox())!;
    const moreBox = (await more.boundingBox())!;
    expect(rowBox.height).toBeGreaterThanOrEqual(44);
    expect(moreBox.y).toBeGreaterThanOrEqual(rowBox.y);
    expect(moreBox.y + moreBox.height).toBeLessThanOrEqual(rowBox.y + rowBox.height);
    const sheetBox = (await sheet(page).boundingBox())!;
    expect(moreBox.x + moreBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width);

    // A menu inside the sheet: Escape closes the menu first, the sheet second. (Minimal, the default
    // theme, has no "Change icon" drill-in, since it shows no project icons.)
    await more.tap();
    await expect(page.getByRole("menuitem", { name: "Project settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Change icon" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Project settings" })).toBeHidden();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();

    // Choosing a destination navigates and closes the sheet.
    await page.getByRole("button", { name: "Show sidebar" }).tap();
    await sheet(page).getByRole("button", { name: /^Inbox/ }).first().tap();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(sheet(page)).toBeHidden();
  });
});

test.describe("tablet", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test("the sheet opens under the chrome rows, which stay usable", async ({ page }) => {
    await signIn(page);
    await page.goto("/projects");
    await page.getByRole("button", { name: "Show sidebar" }).tap();
    await expect(sheet(page)).toBeVisible();
    await expect.poll(() => sheet(page).evaluate((el) => el.getAnimations().length)).toBe(0);

    // Sheet and scrim start where the body row starts; the sheet has no close row of its own.
    const tops = await page.evaluate(() => [".td-app-body", ".td-sidebar-scrim", ".td-sidebar-sheet"].map((s) => document.querySelector(s)!.getBoundingClientRect().top));
    expect(tops[0]).toBeGreaterThan(0);
    expect(tops[1]).toBe(tops[0]);
    expect(tops[2]).toBe(tops[0]);
    await expect(sheet(page).getByRole("button", { name: "Hide sidebar" })).toHaveCount(0);

    // A top-bar menu opens above the sheet; neither the press nor the menu's Escape closes the sheet.
    await page.locator(".td-topnav-avatarbtn").tap();
    const menu = page.getByRole("menu", { name: "Account" });
    await expect(menu).toBeVisible();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(sheet(page)).toBeVisible();

    // The top-bar toggle closes it, and it stays closed.
    await page.getByRole("button", { name: "Hide sidebar" }).tap();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Show sidebar" })).toBeVisible();

    // The scrim closes it without the tap reaching the page.
    const url = page.url();
    await page.getByRole("button", { name: "Show sidebar" }).tap();
    await expect(sheet(page)).toBeVisible();
    await page.touchscreen.tap(40, 600);
    await expect(sheet(page)).toBeHidden();
    expect(page.url()).toBe(url);

    // Escape closes it and focus returns to the toggle.
    const toggle = page.getByRole("button", { name: "Show sidebar" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(toggle).toBeFocused();

    // Choosing a destination navigates and closes the sheet.
    await toggle.tap();
    await sheet(page).getByRole("button", { name: /^Inbox/ }).first().tap();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(sheet(page)).toBeHidden();
  });
});

test("desktop keeps the docked sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await page.goto("/projects");
  const aside = page.getByRole("complementary", { name: "Sidebar" });
  await expect(page.getByRole("button", { name: /(Show|Hide) sidebar/ })).toBeVisible();
  if (await page.getByRole("button", { name: "Show sidebar" }).isVisible()) await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(aside).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Sidebar" })).toHaveCount(0);
  expect(await page.locator("main").evaluate((el) => !!el.closest('[aria-hidden="true"], [inert]'))).toBe(false);
});
