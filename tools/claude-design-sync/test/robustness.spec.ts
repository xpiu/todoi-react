// Failure flows use their own fixture/server so they cannot disturb the normal sync-loop suite.
import { serve } from "@hono/node-server";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { TOOL_DIR } from "../src/engine/config";
import { snapshotFilesDir } from "../src/engine/snapshots";
import { Jobs } from "../src/server/jobs";
import { createApp } from "../src/server/main";
import { makeFixture, type Fixture } from "./fixture";

const screenshots = join(TOOL_DIR, "../../.tmp/design-sync-improvements");
const capture = async (page: Page, name: string) => {
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, `${name}.png`), fullPage: true });
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

async function failUpload(page: Page) {
  await page.goto(`${url}/?job=${jobId}`);
  const panel = page.getByRole("complementary", { name: "Activity" });
  await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeVisible();
  rmSync(join(stage, path));
  await panel.getByRole("button", { name: /Upload 1 file/ }).click();
  await expect(panel.locator(".cds-jobview")).toContainText("Upload failed:");
  await expect(panel.getByRole("button", { name: /Upload 1 file/ })).toBeEnabled();
  return panel;
}

test("keeps a failed upload visible and successfully retries it", async ({ page }) => {
  const panel = await failUpload(page);
  await capture(page, "upload-failed-retry-available");
  writeFileSync(join(stage, path), stagedText);
  await panel.getByRole("button", { name: /Upload 1 file/ }).click();
  await expect(panel.locator(".cds-jobview")).toContainText("all read back intact");
  await expect(panel.locator(".cds-jobview-head")).toContainText("done");
  expect(readFileSync(join(fx.designNowDir, path), "utf8")).toBe(stagedText);
  await capture(page, "upload-retry-succeeded");
});

test("discards staged files after an upload failure", async ({ page }) => {
  const panel = await failUpload(page);
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
  for (const [path, data] of cases) {
    const response = await request.post(url + path, { headers, data });
    expect(response.status(), path).toBe(400);
    expect(await response.json()).toHaveProperty("error", expect.any(String));
  }
  const malformed = await request.post(`${url}/api/plan`, { headers, data: "{" });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toHaveProperty("error");
  for (const path of ["/api/compare?snapshot=..%2Fprivate", "/api/diff?unit=x&side=invalid", "/kit/invalid/id/styles.css", "/api/jobs/..%2Fprivate"]) {
    const response = await request.get(url + path);
    expect(response.status(), path).toBe(400);
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
