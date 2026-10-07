// The bar's token meter: unlit while nothing runs Claude Code, burning exactly as long as a call runs, and
// explaining itself on hover. Screenshots land in .tmp/20261007_flame.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { TOOL_DIR } from "../src/engine/config";
import { ownWorld } from "./world";

const shots = join(TOOL_DIR, "../../.tmp/20261007_flame");

test("the flame burns while a Claude Code call runs, and says what it is", async ({ page }) => {
  // each fake call takes 3 s and reports 4 cents, so the flame has time to be seen
  const world = await ownWorld({ delayMs: 3000, costUsd: 0.04 });
  try {
    mkdirSync(shots, { recursive: true });
    await page.goto(world.url);
    const flame = page.getByRole("img", { name: /^Token meter/ });
    const tip = page.getByRole("tooltip");
    const bar = page.locator(".cds-bar");
    await expect(flame).toHaveAccessibleName("Token meter: not spending tokens");
    await expect(flame).not.toHaveClass(/is-burning/);

    // hovering explains it, idle
    await flame.hover();
    await expect(tip).toContainText("Token meter: nothing is spending tokens now.");
    await expect(tip).toContainText("Recompare, plans, previews and Compare visually run on this machine and cost nothing.");
    await bar.screenshot({ path: join(shots, "1-idle-bar.png") });
    await page.screenshot({ path: join(shots, "2-idle-tip.png"), clip: { x: 0, y: 0, width: 640, height: 300 } });
    await page.mouse.move(700, 600);

    // Check for changes runs Claude Code: the flame lights for exactly as long
    await page.getByRole("button", { name: "Check for changes" }).click();
    await expect(flame).toHaveClass(/is-burning/);
    await expect(flame).toHaveAccessibleName("Token meter: spending tokens, 1 Claude Code call running");
    await expect(page.locator(".cds-sr[aria-live]", { hasText: "Claude Code is spending tokens" })).toBeAttached();
    await page.waitForTimeout(500);
    await bar.screenshot({ path: join(shots, "3-burning-bar.png") });
    await flame.screenshot({ path: join(shots, "4-burning-flame.png"), scale: "device" });
    await flame.hover();
    await expect(tip).toContainText("Spending tokens now:");
    await expect(tip).toContainText("• Asking Claude Design whether the project changed, ");
    await page.screenshot({ path: join(shots, "5-burning-tip.png"), clip: { x: 0, y: 0, width: 640, height: 320 } });

    // it goes out when the call ends, and the tip counts what it spent
    await expect(flame).not.toHaveClass(/is-burning/, { timeout: 10_000 });
    await expect(flame).toHaveAccessibleName("Token meter: not spending tokens");
    await page.mouse.move(700, 600);
    await flame.hover();
    await expect(tip).toContainText("Since the server started: 1 Claude Code call, about $0.04 as Claude Code reports it.");

    // dark mode, burning again
    await page.mouse.move(700, 600);
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.getByRole("button", { name: /Check for changes|Up to date|Design changed/ }).click();
    await expect(flame).toHaveClass(/is-burning/);
    await page.waitForTimeout(500);
    await bar.screenshot({ path: join(shots, "6-burning-bar-dark.png") });
    await flame.screenshot({ path: join(shots, "7-burning-flame-dark.png"), scale: "device" });

    // a phone keeps the flame beside the wordmark's mark
    await page.setViewportSize({ width: 390, height: 760 });
    await expect(flame).toBeInViewport();
    await bar.screenshot({ path: join(shots, "8-burning-bar-phone.png") });
    await expect(flame).not.toHaveClass(/is-burning/, { timeout: 10_000 });
  } finally {
    await world.close();
  }
});

test("reduced motion keeps the lit flame still", async ({ page }) => {
  const world = await ownWorld({ delayMs: 3000 });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(world.url);
    await page.getByRole("button", { name: "Check for changes" }).click();
    const flame = page.getByRole("img", { name: /^Token meter/ });
    await expect(flame).toHaveClass(/is-burning/);
    await expect(flame.locator(".cds-flame-sway")).toHaveCSS("animation-name", "none");
    await expect(flame.locator(".cds-flame-lit")).toHaveCSS("opacity", "1");
    await expect(flame).not.toHaveClass(/is-burning/, { timeout: 10_000 });
  } finally {
    await world.close();
  }
});
