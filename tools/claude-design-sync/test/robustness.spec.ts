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
