// The log heading's token meter: counting while a run's Claude Code calls work, then the total with a time.
// Screenshots land in .tmp/20261009_usage-meter.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { TOOL_DIR } from "../src/engine/config";
import type { Job } from "../src/server/jobs";
import { ownWorld } from "./world";

const shots = join(TOOL_DIR, "../../.tmp/20261009_usage-meter");

test("the log's token meter counts while a run works, then keeps the total with its time", async ({ page, request }) => {
  // each fake port takes 2 s, streams its usage, and reports 5 cents
  const world = await ownWorld({ delayMs: 2000, costUsd: 0.05 });
  try {
    mkdirSync(shots, { recursive: true });
    const { job: id } = (await (await request.post(`${world.url}/api/run`, { headers: { "x-cds": "1" }, data: { global: "app-to-design", overrides: {} } })).json()) as { job: string };
    await page.goto(`${world.url}/?job=${id}`);
    const meter = page.locator(".cds-log-title").getByRole("img");
    await expect(meter).toHaveAccessibleName(/^Spending now: about \$\d+\.\d\d, [\d.k]+ tokens$/);
    await expect(meter).toHaveClass(/is-live/);
    await page.locator(".cds-log-section").screenshot({ path: join(shots, "1-live.png") });

    await expect(meter).not.toHaveClass(/is-live/, { timeout: 30_000 });
    const job = (await (await request.get(`${world.url}/api/jobs/${id}`)).json()) as Job;
    const calls = job.steps.filter((s) => s.kind === "ai-push").length;
    // every call reported, so the total is exact: no estimate left
    expect(job.usage?.estimatedUsd).toBe(0);
    expect(job.costUsd).toBeCloseTo(0.05 * calls, 5);
    expect(job.usage?.output).toBe(400 * calls);
    const at = new Date(job.usage!.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    await expect(meter).toHaveAccessibleName(`Spent $${(0.05 * calls).toFixed(2)}, ${((31_600 * calls) / 1000).toFixed(calls * 31_600 < 10_000 ? 1 : 0)}k tokens, last at ${at}`);
    await expect(meter).toContainText(`· ${at}`);
    // any scroll closes a tip, so bring the meter into view before resting on it
    await meter.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await meter.hover();
    await expect(page.getByRole("tooltip")).toContainText("reported by Claude Code for finished calls");
    await page.locator(".cds-log-section").screenshot({ path: join(shots, "2-done.png") });
  } finally {
    await world.close();
  }
});
