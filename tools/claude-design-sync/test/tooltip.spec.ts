import { expect, test, type Page } from "@playwright/test";

const tip = (page: Page) => page.locator("#cds-tip");

/** Every visible control on the page explains itself, on the control or the label around it */
const untipped = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, a[href], select, input, summary")]
      .filter((el) => el.checkVisibility() && !el.closest("[data-tip]")?.dataset.tip)
      .map((el) => el.outerHTML.slice(0, 120)),
  );

test("every control on the plan explains itself", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cds-row-title").first()).toBeVisible();
  await page.locator(".cds-row-toggle").first().click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.locator(".cds-plan-toggle").click();
  expect(await untipped(page)).toEqual([]);
  await page.getByRole("button", { name: "Mark synced" }).click();
  expect(await untipped(page)).toEqual([]);
});

test("every control on the mapping explains itself", async ({ page }) => {
  await page.goto("/mapping");
  await expect(page.locator(".cds-map-lane").first()).toBeVisible();
  await page.locator(".cds-map-lane .cds-row-toggle").first().click();
  expect(await untipped(page)).toEqual([]);
});

test("shows a tip on hover after a rest, places it in view, and hides it on leave and press", async ({ page }) => {
  await page.goto("/");
  const run = page.getByRole("button", { name: "Run plan" });
  await run.hover();
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toHaveText("Review exactly what the run will write and where, then start it");
  // the plan bar sits at the bottom of the window, so the tip opens above the button
  const [b, t] = await Promise.all([run.boundingBox(), tip(page).boundingBox()]);
  expect(t!.y + t!.height).toBeLessThanOrEqual(b!.y);
  expect(t!.x).toBeGreaterThanOrEqual(0);
  expect(t!.x + t!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.mouse.move(5, 300);
  await expect(tip(page)).toBeHidden();

  // the bar along the top has no room above, so its tips open below
  const recompare = page.getByRole("button", { name: "Recompare" });
  await recompare.hover();
  await expect(tip(page)).toBeVisible();
  const [r, rt] = await Promise.all([recompare.boundingBox(), tip(page).boundingBox()]);
  expect(rt!.y).toBeGreaterThanOrEqual(r!.y + r!.height);
  await page.mouse.down();
  await expect(tip(page)).toBeHidden();
  await page.mouse.up();
});

test("shows a tip on keyboard focus, describes the control with it, and closes on Escape", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cds-row-title").first()).toBeVisible();
  const toggle = page.locator(".cds-mode-toggle");
  await toggle.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  await expect(tip(page)).toBeVisible();
  // the tip repeats the toggle's name, so it isn't announced twice
  await expect(toggle).not.toHaveAttribute("aria-describedby", /cds-tip/);

  await page.keyboard.press("Shift+Tab");
  const pages = page.getByRole("link", { name: "Mapping" });
  await expect(pages).toBeFocused();
  await expect(tip(page)).toHaveText("How App files pair with Design files, lane by lane, and what moved lately");
  await expect(pages).toHaveAttribute("aria-describedby", "cds-tip");
  await expect(page.getByRole("link", { name: "Mapping" })).toHaveAccessibleDescription(/pair with Design files/);

  await page.keyboard.press("Escape");
  await expect(tip(page)).toBeHidden();
  await expect(pages).not.toHaveAttribute("aria-describedby", /cds-tip/);
});

test("a disabled control still says why", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cds-row-title").first()).toBeVisible();
  // skipping every feature leaves nothing to run
  for (const key of await page.locator(".cds-row .cds-key[data-d=skip]").all()) await key.click();
  const run = page.getByRole("button", { name: "Run plan" });
  await expect(run).toBeDisabled();
  await run.hover({ force: true });
  await expect(tip(page)).toHaveText("Nothing to run: every feature is skipped");
});
