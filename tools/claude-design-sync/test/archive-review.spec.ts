import { AxeBuilder } from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { deriveSnapshot, getSnapshot, importExport, writeSnapshotMeta } from "../src/engine/snapshots";
import { ownWorld } from "./world";

test.use({ timezoneId: "UTC", reducedMotion: "reduce" });

async function reviewAppUpdate(page: Page, url: string) {
  await page.goto(url);
  await page.locator(".cds-global").getByRole("radio", { name: /Into the App/ }).click();
  await expect(page.locator(".cds-plan-sum")).toContainText("into the App");
  await page.getByRole("button", { name: "Review selected sync steps" }).click();
  return page.getByRole("region", { name: "Project archive reminder" });
}

test("reminds at review, opens the importer by keyboard, and reviews the replacement archive", async ({ page }, testInfo) => {
  const world = await ownWorld();
  try {
    const imported = importExport(world.fx.ctx, world.fx.designNowDir, "Imported Todoi Design System (3).zip", "2026-10-08T10:21:32Z", { name: "Todoi Design System (3).zip" });
    const reminder = await reviewAppUpdate(page, world.url);
    await expect(reminder).toContainText("Latest imported Project archive: Todoi Design System (3).zip");
    await expect(reminder).toContainText("These steps use this archive's files.");
    await expect(reminder.locator("time").first()).toHaveAttribute("datetime", "2026-10-08T10:21:32Z");
    await expect(reminder.locator("time").first()).toHaveText("8 Oct 2026, 10:21 UTC");
    await expect(reminder.locator("time").last()).toHaveAttribute("datetime", imported.createdAt);
    await expect(reminder).toContainText("Changes made in Claude Design since this snapshot are not included.");
    for (const [name, width, height, mode] of [["desktop", 1440, 900, "light"], ["dark", 1440, 900, "dark"], ["narrow", 390, 844, "light"], ["zoom", 720, 500, "light"]] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: mode });
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      await expect(reminder.getByRole("heading")).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include(".cds-archive-review").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
    }
    const action = reminder.getByRole("button", { name: "Import a newer project archive" });
    await action.focus();
    await page.keyboard.press("Enter");
    const choice = page.getByRole("region", { name: "Bring in Design's changes" });
    await expect(choice).toBeFocused();
    await expect(reminder).toHaveCount(0);
    const zip = join(dirname(world.fx.repo), "New project archive.zip");
    execFileSync("zip", ["-qr", zip, "."], { cwd: world.fx.designNowDir });
    await choice.locator('input[type="file"]').setInputFiles(zip);
    await expect(choice).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Project archive status" })).toContainText("Loaded successfully · used for comparison");
    await expect(page.locator(".cds-global").getByRole("radio", { name: /Into the App/ })).toBeChecked();
    await page.getByRole("button", { name: "Review selected sync steps" }).click();
    await expect(reminder).toContainText("Latest imported Project archive: New project archive.zip");
    await expect(reminder).not.toContainText("Todoi Design System (3).zip");
    const state = await (await page.request.get(`${world.url}/api/state`)).json();
    expect(state.jobs).toHaveLength(0);
    const meter = await (await page.request.get(`${world.url}/api/meter`)).json();
    expect(meter.calls).toBe(0);
  } finally {
    await world.close();
  }
});

test("keeps the latest archive separate from a newer pull or upload snapshot", async ({ page }) => {
  const world = await ownWorld();
  try {
    const archive = importExport(world.fx.ctx, world.fx.designNowDir, "Imported Original archive.zip", "2026-10-01T08:00:00Z", { name: "Original archive.zip" });
    for (const source of ["pull", "upload"] as const) {
      const snapshot = deriveSnapshot(world.fx.ctx, archive.id, {}, source === "pull" ? "Fresh Claude Code pull" : "Verified Design upload", source);
      const reminder = await reviewAppUpdate(page, world.url);
      await expect(reminder).toContainText("Latest imported Project archive: Original archive.zip");
      await expect(reminder).toContainText(`These steps use “${snapshot.label}”`);
      await expect(reminder).not.toContainText("These steps use this archive's files.");
    }
  } finally {
    await world.close();
  }
});

test("handles older metadata without inventing a download time", async ({ page }) => {
  const world = await ownWorld();
  try {
    const snapshot = getSnapshot(world.fx.ctx, world.fx.nowSnapshot)!;
    writeSnapshotMeta(world.fx.ctx, { ...snapshot, label: "Imported Legacy archive.zip", archive: undefined, exportedAt: undefined });
    const reminder = await reviewAppUpdate(page, world.url);
    await expect(reminder).toContainText("Latest imported Project archive: Legacy archive.zip");
    await expect(reminder).toContainText("Download time not recorded");
    await expect(reminder.locator("time")).toHaveCount(1);
  } finally {
    await world.close();
  }
});

test("offers an archive when none belongs to the current project", async ({ page }) => {
  const world = await ownWorld();
  try {
    for (const id of [world.fx.baseSnapshot, world.fx.nowSnapshot]) {
      writeSnapshotMeta(world.fx.ctx, { ...getSnapshot(world.fx.ctx, id)!, projectId: "another-project" });
    }
    const current = deriveSnapshot(world.fx.ctx, world.fx.nowSnapshot, {}, "Current project pull", "pull");
    writeSnapshotMeta(world.fx.ctx, { ...current, projectId: "fake" });
    const reminder = await reviewAppUpdate(page, world.url);
    await expect(reminder).toContainText("No Project archive has been imported for this project yet.");
    await expect(reminder.getByRole("button", { name: "Import project archive", exact: true })).toBeVisible();
  } finally {
    await world.close();
  }
});

test("does not add an App archive reminder to an Into Design review", async ({ page }) => {
  const world = await ownWorld();
  try {
    await page.goto(world.url);
    await page.locator(".cds-global").getByRole("radio", { name: /Into Design/ }).click();
    await expect(page.locator(".cds-plan-sum")).toContainText("into Design");
    await page.getByRole("button", { name: "Review selected sync steps" }).click();
    await expect(page.getByRole("heading", { name: /Run \d+ steps? for \d+ features?\?/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Project archive reminder" })).toHaveCount(0);
  } finally {
    await world.close();
  }
});
