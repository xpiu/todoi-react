// Reduced motion: one global rule (tokens/motion.css) collapses every transition and animation to a
// frame while state changes still happen — the Style menu still opens, the toast still shows.
import { expect, test } from "@playwright/test";

import { seedProjectId, signIn, useScope } from "./helpers";

test.describe("prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("transitions collapse, interactions still work", async ({ page }) => {
    await useScope(page, "standard-dark");
    await signIn(page);
    const pid = await seedProjectId(page);
    await page.goto(`/p/${pid}?v=board`);
    await expect(page.getByRole("list", { name: / cards$/ }).first()).toBeVisible();
    const durations = await page.evaluate(() => {
      const els = [document.querySelector(".td-btn, button"), document.querySelector(".td-card"), document.querySelector(".td-subnav")].filter(Boolean) as Element[];
      return els.map((el) => getComputedStyle(el).transitionDuration);
    });
    // Chromium reports the collapsed duration as "1e-05s" (0.01ms)
    const seconds = (d: string) => (d.endsWith("ms") ? parseFloat(d) / 1000 : parseFloat(d));
    for (const d of durations) expect(seconds(d)).toBeLessThan(0.001);
    await page.getByRole("button", { name: /Style/ }).click();
    await expect(page.getByRole("menu").or(page.getByRole("dialog")).first()).toBeVisible();
    const popDuration = await page.locator(".td-pop").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(seconds(popDuration)).toBeLessThan(0.001);
  });
});

test.describe("motion on", () => {
  test("tokens drive transitions by default", async ({ page }) => {
    await useScope(page, "standard-dark");
    await signIn(page);
    const pid = await seedProjectId(page);
    await page.goto(`/p/${pid}?v=board`);
    await expect(page.getByRole("list", { name: / cards$/ }).first()).toBeVisible();
    const base = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--duration-base").trim());
    expect(base).toBe("150ms");
  });
});
