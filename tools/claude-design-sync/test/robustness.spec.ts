// Failure flows use their own fixture/server so they cannot disturb the normal sync-loop suite.
import { serve } from "@hono/node-server";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { TOOL_DIR } from "../src/engine/config";
import { compare } from "../src/engine/compare";
import { listSyncPoints, snapshotFilesDir } from "../src/engine/snapshots";
import { Jobs } from "../src/server/jobs";
import { createApp } from "../src/server/main";
import { makeFixture, type Fixture } from "./fixture";

const screenshots = join(TOOL_DIR, "../../.tmp/design-sync-improvements");
const capture = async (page: Page, name: string, fullPage = true) => {
  mkdirSync(screenshots, { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: join(screenshots, `${name}.png`), fullPage, animations: "disabled" });
};

let fx: Fixture;
let server: ReturnType<typeof serve>;
let url: string;
let jobId: string;
let stage: string;
let stagedText: string;
const path = "components/core/Toast.jsx";

test.beforeEach(async () => {
  fx = makeFixture();
  const jobs = new Jobs(fx.ctx);
  stage = join(fx.ctx.state, "stage", "retry-review");
  mkdirSync(dirname(join(stage, path)), { recursive: true });
  const source = join(snapshotFilesDir(fx.ctx, fx.nowSnapshot), path);
  stagedText = `${readFileSync(source, "utf8")}\n/* staged change */\n`;
  writeFileSync(join(stage, path), stagedText);
  const job = jobs.create("run", "Retryable upload", {
    stage, snapshotId: fx.nowSnapshot, staged: [{ path, status: "changed" }],
    steps: [{ id: "upload", title: "Upload staged files", kind: "upload", target: "design", state: "pending" }],
  });
  jobs.finish(job, "awaiting-approval");
  jobId = job.id;
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      url = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
});

test.afterEach(async () => {
  if ("closeAllConnections" in server) server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dirname(fx.repo), { recursive: true, force: true });
});

/** Hand the upload to Claude Code, then check it before it ran there */
async function uncheckedUpload(page: Page) {
  await page.goto(`${url}/?job=${jobId}`);
  const panel = page.getByRole("complementary", { name: "Activity" });
  await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeVisible();
  await panel.getByRole("button", { name: /Upload 1 file from Claude Code/ }).click();
  await panel.getByRole("button", { name: "Check the upload" }).click();
  await expect(panel.locator(".cds-jobview")).toContainText("None of the 1 file(s) are in Claude Design yet");
  await expect(panel.getByRole("button", { name: "Check the upload" })).toBeEnabled();
  return panel;
}

test("refuses to hand off an upload whose staged copy is missing", async ({ page }) => {
  await page.goto(`${url}/?job=${jobId}`);
  const panel = page.getByRole("complementary", { name: "Activity" });
  rmSync(join(stage, path));
  await panel.getByRole("button", { name: /Upload 1 file from Claude Code/ }).click();
  await expect(panel.locator(".cds-error-inline")).toContainText("staged copy");
  await expect(panel.getByRole("list", { name: "Upload from Claude Code" })).toHaveCount(0);
});

test("keeps an unchecked upload waiting, and closes it once Claude Design holds the files", async ({ page }) => {
  const panel = await uncheckedUpload(page);
  await capture(page, "upload-waiting-for-claude-code");
  // the developer's upload in Claude Code
  writeFileSync(join(fx.designNowDir, path), stagedText);
  await panel.getByRole("button", { name: "Check the upload" }).click();
  await expect(panel.locator(".cds-jobview")).toContainText("all read back intact");
  await expect(panel.locator(".cds-jobview-head")).toContainText("done");
  await capture(page, "upload-checked");
});

test("checks the upload by itself when Claude Code pings back, and marks the run synced", async ({ page, request }) => {
  // a run that covers Toast, compared from the fixture's sync point
  const jobs = new Jobs(fx.ctx);
  const base = listSyncPoints(fx.ctx)[0]!;
  const cmp = compare(fx.ctx, { base, snapshotId: fx.nowSnapshot });
  const toast = cmp.units.find((u) => u.design.paths.includes(path))!;
  const job = jobs.create("run", "Sync 1 feature(s)", {
    stage, baseId: base.id, snapshotId: fx.nowSnapshot, staged: [{ path, status: "changed" }], covers: [toast.id], label: "Toast port",
    steps: [{ id: "upload", title: "Upload staged files", kind: "upload", target: "design", state: "pending" }],
  });
  jobs.finish(job, "awaiting-approval");
  // the server reads jobs from disk when it starts
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  const own = await new Promise<{ server: ReturnType<typeof serve>; url: string }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => resolve({ server: s, url: `http://127.0.0.1:${info.port}` }));
  });
  try {
    await page.goto(`${own.url}/?job=${job.id}`);
    const panel = page.getByRole("complementary", { name: "Activity" });
    await panel.getByRole("button", { name: /Upload 1 file from Claude Code/ }).click();
    const handoff = panel.getByRole("list", { name: "Upload from Claude Code" });
    await expect(handoff).toContainText("Copy the request");
    await expect(handoff).toContainText("Allow the upload");
    await handoff.getByRole("button", { name: "Read request" }).click();
    const prompt = await handoff.locator(".cds-brief").textContent();
    const ping = /`curl -sS -X POST -H 'x-cds: 1' (\S+)`/.exec(prompt ?? "")?.[1];
    expect(ping).toBe(`${own.url}/api/jobs/${job.id}/upload-check`);
    expect(prompt).toContain("Upload to Claude Design: SUCCEEDED");
    // Claude Code wrote the file, then ran the ping
    writeFileSync(join(fx.designNowDir, path), stagedText);
    expect((await request.post(ping!, { headers: { "x-cds": "1" } })).ok()).toBe(true);
    await expect(panel.locator(".cds-jobview")).toContainText("all read back intact");
    await expect(panel.locator(".cds-jobview")).toContainText("Marked synced");
    await expect(panel.locator(".cds-jobview-head")).toContainText("done");
    const points = listSyncPoints(fx.ctx);
    expect(points[0]!.label).toBe("Toast port");
    // parts the run didn't touch stay open on the old baseline
    const others = cmp.units.filter((u) => u.id !== toast.id && u.status !== "in-sync" && !["card", "screen", "guideline"].includes(u.kind));
    expect(Object.keys(points[0]!.held ?? {}).sort()).toEqual(others.map((u) => u.id).sort());
  } finally {
    if ("closeAllConnections" in own.server) own.server.closeAllConnections();
    await new Promise<void>((resolve) => own.server.close(() => resolve()));
  }
});

test("discards staged files while an upload waits for Claude Code", async ({ page }) => {
  const panel = await uncheckedUpload(page);
  await panel.getByRole("button", { name: "Discard run…" }).click();
  await expect(panel.getByRole("group", { name: "Discard this run" })).toContainText("staged kit file");
  await panel.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(panel.locator(".cds-jobview")).toContainText("nothing uploaded");
  await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toHaveCount(0);
});

test("rejects invalid API input with useful JSON errors before doing work", async ({ request }) => {
  const headers = { "x-cds": "1", "content-type": "application/json" };
  const cases = [
    ["/api/plan", {}],
    ["/api/run", { global: "invalid", overrides: {} }],
    ["/api/pull", { force: "yes" }],
    ["/api/import", { path: 42 }],
    ["/api/project", { project: false }],
    ["/api/sync-point", { label: "Synced", hold: "all" }],
    [`/api/jobs/${jobId}/upload`, { paths: "all" }],
  ] as const;
  for (const [endpoint, data] of cases) {
    const response = await request.post(url + endpoint, { headers, data });
    expect(response.status(), endpoint).toBe(400);
    expect(await response.json()).toHaveProperty("error", expect.any(String));
  }
  const malformed = await request.post(`${url}/api/plan`, { headers, data: "{" });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toHaveProperty("error");
  for (const endpoint of ["/api/compare?snapshot=..%2Fprivate", "/api/diff?unit=x&side=invalid", "/kit/invalid/id/styles.css", "/api/jobs/..%2Fprivate"]) {
    const response = await request.get(url + endpoint);
    expect(response.status(), endpoint).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
  const denied = await request.post(`${url}/api/plan`, { data: {} });
  expect(denied.status()).toBe(403);
  const preview = await request.post(`${url}/api/plan`, { headers, data: { base: null, global: "both", overrides: {} } });
  expect(preview.status()).toBe(200);
  expect((await preview.json()).steps.length).toBeGreaterThan(0);
  const job = await (await request.get(`${url}/api/jobs/${jobId}`)).json();
  expect(job.state).toBe("awaiting-approval");
});

test("reports staging startup failures as failed jobs", async ({ request }) => {
  rmSync(join(fx.ctx.state, "stage"), { recursive: true });
  writeFileSync(join(fx.ctx.state, "stage"), "not a directory");
  const response = await request.post(`${url}/api/run`, {
    headers: { "x-cds": "1" }, data: { global: "app-to-design", overrides: {} },
  });
  expect(response.status()).toBe(200);
  const { job: id } = await response.json();
  await expect.poll(async () => (await (await request.get(`${url}/api/jobs/${id}`)).json()).state).toBe("failed");
});

test("preserves plan dialog transitions and layouts at desktop and phone widths", async ({ page, request }) => {
  await request.post(`${url}/api/jobs/${jobId}/discard`, { headers: { "x-cds": "1" } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.locator(".cds-plan-sum strong")).toContainText("features");
  await capture(page, "after-plan-desktop");
  await page.getByRole("button", { name: "Review selected sync steps" }).click();
  await expect(page.getByRole("heading", { name: /Run \d+ steps\?/ })).toBeVisible();
  await capture(page, "after-plan-confirmation");
  await page.getByRole("button", { name: "Back to the steps" }).click();
  await expect(page.getByRole("heading", { name: "Steps, in order" })).toBeVisible();
  await page.getByRole("button", { name: "Mark selected features synced" }).click();
  await expect(page.getByRole("heading", { name: /Mark \d+ features? synced/ })).toBeVisible();
  await capture(page, "after-mark-synced");
  await page.getByLabel("Label", { exact: true }).fill("Keep this label");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Steps, in order" })).toBeVisible();
  await page.locator(".cds-plan-toggle").click();
  await expect(page.locator(".cds-plan-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Mark selected features synced" }).click();
  await expect(page.getByLabel("Label", { exact: true })).toHaveValue("Keep this label");
  await page.locator(".cds-plan-toggle").click();
  await page.getByRole("button", { name: "Review selected sync steps" }).click();
  await page.locator(".cds-plan-toggle").click();
  await expect(page.getByRole("heading", { name: /Run \d+ steps\?/ })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, "after-plan-phone", false);
  await page.getByRole("button", { name: "Mark selected features synced" }).click();
  await expect(page.getByRole("heading", { name: /Mark \d+ features? synced/ })).toBeVisible();
  await capture(page, "after-mark-synced-phone", false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${url}/mapping`);
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await expect(page.locator(".cds-map-detail")).toContainText("Paired by");
  await capture(page, "after-mapping-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, "after-mapping-phone", false);
  expect(errors).toEqual([]);
});

test("keeps older approvals visible and lets the reader reveal completed history", async ({ page, request }) => {
  const state = await (await request.get(`${url}/api/state`)).json();
  const waiting = state.jobs[0];
  const completed = Array.from({ length: 12 }, (_, i) => ({ ...waiting, id: `completed-${i}`, title: `Completed job ${i}`, state: "done", staged: [], steps: [] }));
  await page.route("**/api/state", (route) => route.fulfill({ json: { ...state, jobs: [...completed, waiting] } }));
  await page.goto(`${url}/?job=${jobId}`);
  const jobs = page.getByRole("navigation", { name: "Jobs" });
  await expect(jobs.getByRole("button", { name: /Retryable upload/ })).toBeVisible();
  await expect(jobs.getByRole("button").first()).toContainText("Retryable upload");
  await expect(jobs.getByRole("button", { name: "Completed job 11", exact: false })).toHaveCount(0);
  await jobs.getByRole("button", { name: /Show older jobs/ }).click();
  await expect(jobs.getByRole("button", { name: /Completed job 11/ })).toHaveCount(1);
  await expect(jobs.getByRole("button", { name: /Show older jobs/ })).toHaveCount(0);
});

test("preserves a reader's log position as new entries arrive and resumes at the bottom", async ({ page, request }) => {
  const job = await (await request.get(`${url}/api/jobs/${jobId}`)).json();
  await page.addInitScript(() => {
    class TestEventSource extends EventTarget {
      constructor() {
        super();
        (window as unknown as { emitJob: (job: unknown) => void }).emitJob = (snapshot) => this.dispatchEvent(new MessageEvent("job", { data: JSON.stringify(snapshot) }));
      }
      close() {}
    }
    window.EventSource = TestEventSource as unknown as typeof EventSource;
  });
  await page.goto(`${url}/?job=${jobId}`);
  await expect(page.getByRole("navigation", { name: "Jobs" })).toBeVisible();
  job.events = Array.from({ length: 120 }, (_, i) => ({ at: new Date().toISOString(), level: "info", text: `Log entry ${i}` }));
  await page.evaluate((snapshot) => (window as unknown as { emitJob: (job: unknown) => void }).emitJob(snapshot), job);
  const log = page.getByRole("list", { name: "Log", exact: true });
  await expect(log.locator("li")).toHaveCount(120);
  await expect.poll(() => log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
  await log.evaluate((el) => { el.scrollTop = 60; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  job.events.push({ at: new Date().toISOString(), level: "info", text: "New while reading" });
  await page.evaluate((snapshot) => (window as unknown as { emitJob: (job: unknown) => void }).emitJob(snapshot), job);
  await expect(log.locator("li")).toHaveCount(121);
  expect(await log.evaluate((el) => el.scrollTop)).toBe(60);
  await log.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  job.events.push({ at: new Date().toISOString(), level: "info", text: "New at bottom" });
  await page.evaluate((snapshot) => (window as unknown as { emitJob: (job: unknown) => void }).emitJob(snapshot), job);
  await expect(log.locator("li")).toHaveCount(122);
  await expect.poll(() => log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
});

test("offers selectable text when copying fails, then allows retry", async ({ page }) => {
  await page.addInitScript(() => {
    let denied = true;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {
      if (denied) { denied = false; throw new Error("Clipboard denied"); }
    } } });
  });
  await page.goto(url);
  await page.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
  const copy = page.getByRole("button", { name: "Copy brief", exact: true }).first();
  await copy.click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t copy");
  const fallback = page.getByRole("textbox", { name: "Copy brief text" });
  await expect(fallback).toHaveValue(/Recover hidden lists/);
  await fallback.focus();
  expect(await fallback.evaluate((el) => (el as HTMLTextAreaElement).selectionEnd - (el as HTMLTextAreaElement).selectionStart)).toBe((await fallback.inputValue()).length);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".cds-copy").filter({ has: fallback }).screenshot({ path: join(screenshots, "clipboard-fallback-detail.png"), animations: "disabled" });
  await copy.click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await expect(fallback).toHaveCount(0);
});

test("shows a long diff's size and reveals every remaining line", async ({ page }) => {
  const text = Array.from({ length: 3200 }, (_, i) => `+diff line ${i + 1}`).join("\n");
  await page.route("**/api/diff?**", (route) => route.fulfill({ json: { text } }));
  await page.goto(url);
  await page.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
  await page.getByRole("button", { name: "App diff", exact: true }).first().click();
  const diff = page.getByRole("region", { name: "Diff", exact: true });
  await expect(diff.getByRole("status")).toHaveText("Showing 1,500 of 3,200 lines.");
  await expect(diff.locator(".cds-dl")).toHaveCount(1500);
  await diff.getByRole("button", { name: "Show more lines" }).click();
  await expect(diff.locator(".cds-dl")).toHaveCount(3000);
  await diff.getByRole("button", { name: "Show more lines" }).click();
  await expect(diff.locator(".cds-dl")).toHaveCount(3200);
  await expect(diff.getByRole("status")).toHaveText("Showing 3,200 of 3,200 lines.");
  await expect(diff.getByRole("button", { name: "Show more lines" })).toHaveCount(0);
});
