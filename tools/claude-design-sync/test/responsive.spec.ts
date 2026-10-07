// The bar's rhythm and the ledger's layout across desktop, tablet and phone widths.
import { expect, test, type Page } from "@playwright/test";

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("the bar's controls share one rhythm, and the current page is ruled in ink", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cds-row-title").first()).toBeVisible();
  // within a group every control is a box 6px from the next, so glyphs and labels sit evenly apart
  const gaps = await page.evaluate(() =>
    [...document.querySelectorAll(".cds-bar-group")].flatMap((g) => {
      const kids = [...g.children].filter((k) => getComputedStyle(k).position !== "absolute").map((k) => k.getBoundingClientRect());
      return kids.slice(1).map((r, i) => Math.round(r.left - kids[i]!.right));
    }),
  );
  expect(new Set(gaps)).toEqual(new Set([6]));
  // every control is centred on the bar's middle line
  const middles = await page.evaluate(() =>
    [...document.querySelectorAll(".cds-bar-group > :not(.cds-sr), .cds-wordmark")].map((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    }),
  );
  expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(1);
  const current = await page.locator(".cds-page[aria-current='page']").evaluate((el) => getComputedStyle(el, "::after").height);
  expect(current).toBe("2px");
});

test("a tablet keeps the twin, and its rail keys stay inside the rail", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await expect(page.locator(".cds-heads")).toBeVisible();
  const rail = await box(page, ".cds-row .cds-rail-cell");
  const keys = await box(page, ".cds-row .cds-keys");
  expect(keys.x).toBeGreaterThanOrEqual(rail.x);
  expect(keys.x + keys.width).toBeLessThanOrEqual(rail.x + rail.width);
  expect(await fits(page)).toBe(true);
});

test("with the Activity panel open on a tablet, the narrowed ledger stacks", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await expect(page.locator(".cds-heads")).toBeVisible();
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByRole("complementary", { name: "Activity" })).toBeVisible();
  await expect(page.locator(".cds-heads")).toBeHidden();
  // the plan bar's actions split its own (narrowed) width instead of squeezing beside the summary
  const sum = await box(page, ".cds-plan-toggle");
  const actions = await box(page, ".cds-plan-actions");
  expect(actions.y).toBeGreaterThanOrEqual(sum.y + sum.height - 1);
  expect(await fits(page)).toBe(true);
});

test("a phone's bar is two rows: the page's tools, then the pages as tabs with the meter, mode and project", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/mapping", "/guide"]) {
    await page.goto(path);
    const bar = await box(page, ".cds-bar");
    const pages = await box(page, ".cds-pages");
    const meta = await box(page, ".cds-bar-meta");
    const wordmark = await box(page, ".cds-wordmark");
    expect(pages.y).toBeGreaterThan(wordmark.y + wordmark.height);
    expect(Math.round(meta.y + meta.height / 2)).toBe(Math.round(pages.y + pages.height / 2));
    await expect(page.locator(".cds-page-label").first()).toBeVisible();
    // anything sticky under the bar clears its two rows
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cds-bar")))).toBe(Math.round(bar.height - 1));
    expect(await fits(page)).toBe(true);
  }
  // the three directions stack as rows on a phone
  await page.goto("/");
  const opts = page.locator(".cds-global-opt");
  const [a, b] = [await opts.nth(0).boundingBox(), await opts.nth(1).boundingBox()];
  expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1);
});
