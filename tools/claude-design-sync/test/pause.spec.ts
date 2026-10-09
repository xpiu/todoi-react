// Pause and Resume: a running sync run parks at the step it was on, keeps its staging copy, and goes on from
// there. Its own world, so the shared suite never sees the run.
import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

import type { Job } from "../src/server/jobs";
import { ownWorld } from "./world";

test("a paused run keeps its stage, and Resume finishes it from where it stopped", async ({ page, request }) => {
  // each fake Claude Code call takes 1.5 s, so the pause lands while the first port runs
  const world = await ownWorld({ delayMs: 1500, costUsd: 0.02 });
  try {
    const headers = { "x-cds": "1" };
    const started = await request.post(`${world.url}/api/run`, { headers, data: { global: "app-to-design", overrides: {} } });
    expect(started.ok()).toBe(true);
    const { job: id } = (await started.json()) as { job: string };
    const job = async () => (await (await request.get(`${world.url}/api/jobs/${id}`)).json()) as Job;
    await expect.poll(async () => (await job()).steps.some((s) => s.state === "running")).toBe(true);

    await page.goto(`${world.url}/?job=${id}`);
    const panel = page.getByRole("complementary", { name: "Activity" });
    await panel.getByRole("button", { name: "Pause" }).click();
    await expect(panel.getByRole("button", { name: "Resume" })).toBeVisible({ timeout: 10_000 });
    await expect(panel.locator(".cds-jobview-head")).toContainText("paused");

    const parked = await job();
    expect(parked.state).toBe("paused");
    expect(parked.result).toMatch(/^Paused/);
    expect(parked.steps.some((s) => s.state === "running")).toBe(false);
    expect(parked.steps.filter((s) => s.kind !== "upload").some((s) => s.state === "pending")).toBe(true);
    // the staging copy survives the pause
    expect(parked.stage && existsSync(parked.stage)).toBe(true);
    // while paused, the next run waits
    await expect(page.getByRole("button", { name: "Review selected sync steps" })).toBeDisabled();
    // and Pause/Resume can't be asked twice
    expect((await request.post(`${world.url}/api/jobs/${id}/pause`, { headers })).ok()).toBe(false);

    await panel.getByRole("button", { name: "Resume" }).click();
    await expect.poll(async () => (await job()).state, { timeout: 30_000 }).toBe("awaiting-approval");
    const finished = await job();
    expect(finished.steps.filter((s) => s.kind !== "upload").every((s) => s.state === "done")).toBe(true);
    expect(finished.events.some((e) => e.text.startsWith("Resumed where it was paused"))).toBe(true);
    await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeVisible();
  } finally {
    await world.close();
  }
});

test("Discard gives up a paused run and its staging copy", async ({ request }) => {
  const world = await ownWorld({ delayMs: 1500 });
  try {
    const headers = { "x-cds": "1" };
    const { job: id } = (await (await request.post(`${world.url}/api/run`, { headers, data: { global: "app-to-design", overrides: {} } })).json()) as { job: string };
    const job = async () => (await (await request.get(`${world.url}/api/jobs/${id}`)).json()) as Job;
    await expect.poll(async () => (await job()).steps.some((s) => s.state === "running")).toBe(true);
    expect((await request.post(`${world.url}/api/jobs/${id}/pause`, { headers })).ok()).toBe(true);
    await expect.poll(async () => (await job()).state, { timeout: 10_000 }).toBe("paused");
    const stage = (await job()).stage!;
    expect((await request.post(`${world.url}/api/jobs/${id}/discard`, { headers })).ok()).toBe(true);
    const gone = await job();
    expect(gone.state).toBe("cancelled");
    expect(existsSync(stage)).toBe(false);
  } finally {
    await world.close();
  }
});

test("pausing an App port sets its partial edits aside, and Resume starts from the last saved step", async ({ request }) => {
  const world = await ownWorld({ delayMs: 1500 });
  try {
    const headers = { "x-cds": "1" };
    const { job: id } = (await (await request.post(`${world.url}/api/run`, { headers, data: { global: "design-to-app", overrides: {} } })).json()) as { job: string };
    const job = async () => (await (await request.get(`${world.url}/api/jobs/${id}`)).json()) as Job;
    await expect.poll(async () => (await job()).steps.some((s) => s.target === "app" && s.kind !== "check" && s.state === "running")).toBe(true);
    expect((await request.post(`${world.url}/api/jobs/${id}/pause`, { headers })).ok()).toBe(true);
    await expect.poll(async () => (await job()).state, { timeout: 10_000 }).toBe("paused");
    const parked = await job();
    expect(parked.app?.state).toBe("working");
    // the fake port commits even as it's stopped: that commit is the partial work Resume mustn't build on
    expect(parked.result).toContain("partial changes");
    const resumed = await request.post(`${world.url}/api/jobs/${id}/resume`, { headers, data: { setAside: false } });
    expect(resumed.ok(), await resumed.text()).toBe(true);
    await expect.poll(async () => (await job()).state, { timeout: 60_000 }).toBe("awaiting-approval");
    const finished = await job();
    expect(finished.app?.state).toBe("ready");
    expect(finished.steps.find((s) => s.id === "app-check")?.state).toBe("done");
  } finally {
    await world.close();
  }
});
