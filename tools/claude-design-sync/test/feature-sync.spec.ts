import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { compare } from "../src/engine/compare";
import { recordSyncPoint } from "../src/engine/plan";
import { listSyncPoints } from "../src/engine/snapshots";
import { makeFixture } from "./fixture";
import { expect, test } from "@playwright/test";
import type { Comparison } from "../src/engine/types";

test("feature-only runs and manual feature acknowledgements keep unrelated features open", async ({ page }) => {
  await page.goto("/");
  const comparison = await (await page.request.get("/api/compare")).json() as Comparison;
  const feature = comparison.features.find((f) => f.title === "Recover hidden lists")!;
  const unrelated = comparison.features.filter((f) => f.id !== feature.id).flatMap((f) => f.units.map((u) => u.id));
  await page.locator(".cds-global").getByRole("radio", { name: /Into Design/ }).click();
  await page.getByRole("button", { name: feature.title, exact: true }).click();
  const row = page.locator(".cds-row", { has: page.getByRole("button", { name: feature.title, exact: true }) });
  await row.getByRole("button", { name: "Run this feature only" }).click();
  const panel = page.getByRole("complementary", { name: "Activity" });
  await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeVisible({ timeout: 30_000 });
  const { jobs } = await (await page.request.get("/api/state")).json();
  const job = jobs[0] as { id: string; covers: string[] };
  expect(job.covers.length).toBeGreaterThan(0);
  expect(job.covers.every((id) => feature.units.some((u) => u.id === id))).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Mark run features synced" }).click();
  const dialog = page.locator(".cds-mark");
  const selected = dialog.getByRole("group", { name: "Synced this round" });
  await expect(dialog.getByRole("heading", { name: "Mark 1 feature synced" })).toBeVisible();
  await expect(selected.getByRole("checkbox", { name: feature.title })).toBeChecked();
  expect(await selected.locator('input:checked').count()).toBe(1);
  await expect(dialog).toContainText("Preparing kit files doesn't upload them");
  // Capture the real UI payload without changing the shared fixture's baseline.
  let hold: string[] = [];
  await page.route("**/api/sync-point", async (route) => {
    hold = route.request().postDataJSON().hold;
    await route.fulfill({ status: 400, json: { error: "Fixture: sync point not saved" } });
  });
  await dialog.getByRole("button", { name: "Record sync point" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Fixture: sync point not saved");
  expect(unrelated.every((id) => hold.includes(id))).toBe(true);
  expect(job.covers.every((id) => !hold.includes(id))).toBe(true);
  // Apply that UI payload to an isolated real engine fixture and recompare.
  const fixture = makeFixture();
  try {
    const start = listSyncPoints(fixture.ctx)[0]!;
    const before = compare(fixture.ctx, { base: start });
    const point = recordSyncPoint(fixture.ctx, { label: "One feature", from: start, hold, snapshotId: fixture.nowSnapshot });
    const after = compare(fixture.ctx, { base: point });
    for (const id of unrelated) {
      expect(point.held?.[id]?.label).toBe("Start");
      expect(after.units.find((u) => u.id === id)?.status).toBe(before.units.find((u) => u.id === id)?.status);
    }
    for (const id of job.covers) {
      expect(point.held?.[id]).toBeUndefined();
      expect(after.units.find((u) => u.id === id)?.status).toBe("in-sync");
    }
  } finally {
    rmSync(dirname(fixture.repo), { recursive: true, force: true });
  }
  await expect(dialog.getByRole("button", { name: "Record sync point" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  // Explicit feature selection also works without a run and leaves the rest unticked.
  await page.getByRole("button", { name: feature.title, exact: true }).click();
  await row.getByRole("button", { name: "Mark this feature synced" }).click();
  expect(await selected.locator('input:checked').count()).toBe(1);
  await expect(selected.getByRole("checkbox", { name: feature.title })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.request.post(`/api/jobs/${job.id}/discard`, { headers: { "x-cds": "1" } });
});
