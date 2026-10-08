import { serve } from "@hono/node-server";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";

import { compare } from "../src/engine/compare";
import { TOOL_DIR } from "../src/engine/config";
import { cssMergeFor, planSteps } from "../src/engine/plan";
import { listSyncPoints } from "../src/engine/snapshots";
import { commitAll, commitsSince, createWorktree, headOf, removeWorktree } from "../src/engine/worktree";
import { Jobs, type Job } from "../src/server/jobs";
import { createApp } from "../src/server/main";
import { makeFixture } from "./fixture";

// Isolated failed run: resume never touches the normal GUI suite's world or the user's run.
test("Activity resumes a failed App run, retaining prior commits and showing no-change evidence", async ({ page }) => {
  const fx = makeFixture();
  const jobs = new Jobs(fx.ctx);
  const base = listSyncPoints(fx.ctx)[0]!;
  const comparison = compare(fx.ctx, { base, snapshotId: fx.nowSnapshot });
  const choices = Object.fromEntries(comparison.features.map((f) => [f.id, "design-to-app" as const]));
  const steps = planSteps(fx.ctx, comparison, choices);
  const job = jobs.create("run", "Recover the sync", {
    baseId: base.id, snapshotId: fx.nowSnapshot,
    covers: steps.flatMap((s) => s.units),
    steps: [...steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, target: s.target, state: "pending" as const })),
      { id: "app-check", title: "Run the final check", kind: "check", target: "app", state: "pending" },
      { id: "app-merge", title: "Review and merge", kind: "merge", target: "app", state: "pending" }],
  });
  const run = createWorktree(fx.ctx, job.id);
  jobs.update(job, { app: run });
  for (const step of steps) {
    if (step.kind === "merge-css") {
      const unit = comparison.units.find((u) => u.id === step.units[0])!;
      const merged = cssMergeFor(fx.ctx, comparison, unit, "app");
      writeFileSync(join(run.worktree, unit.app.paths[0]!), merged.text);
      commitAll(run, "style: merge tokens");
      jobs.step(job, step.id, { state: "done", summary: merged.summary });
    } else if (step.units.includes("component:board/BoardView")) {
      jobs.step(job, step.id, { state: "done", summary: "Already implemented: no App changes needed", alreadyImplemented: {
        units: step.units.map((id) => ({ id, evidence: [{ path: "DESIGN.md", reason: "The existing board spec already describes the requested behavior." }] })),
      } });
    } else jobs.step(job, step.id, { state: "failed", summary: "No commit or valid already-implemented report" });
  }
  run.checkpoint = headOf(run);
  run.commits = commitsSince(run);
  run.state = "failed";
  run.reason = "No commit or valid already-implemented report";
  jobs.finish(job, "failed", run.reason);
  jobs.savePlan(job, { comparison, steps, harness: "claude" });
  const unfinished = job.steps.filter((s) => s.kind === "ai-pull" && s.state !== "done").length;
  const completedPort = job.steps.find((s) => s.alreadyImplemented)!;
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir, delayMs: 200 } });
  let server: ReturnType<typeof serve> | undefined;
  try {
    const url = await new Promise<string>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => resolve(`http://127.0.0.1:${info.port}`));
    });
    await page.goto(`${url}/?job=${job.id}`);
    const panel = page.getByRole("complementary", { name: "Activity" });
    await expect(panel.getByRole("button", { name: "Resume run" })).toBeVisible();
    await panel.getByText("Evidence for already implemented parts").click();
    await expect(panel).toContainText("The existing board spec already describes the requested behavior.");
    // Starting over is where the work got lost: the run confirmation points at the kept run instead.
    await page.getByRole("button", { name: "Review selected sync steps" }).click();
    const kept = page.getByRole("note").filter({ hasText: "already finished" });
    await expect(kept).toContainText(run.branch);
    await kept.getByRole("button", { name: "Show that run" }).click();
    await expect(panel.getByRole("button", { name: "Resume run" })).toBeVisible();
    // An interrupted port's leftovers refuse a plain resume, and offer to set them aside as a patch.
    writeFileSync(join(run.worktree, "stray.txt"), "uncommitted");
    await panel.getByRole("button", { name: "Resume run" }).click();
    await expect(panel.getByRole("alert")).toContainText("uncommitted files");
    const drift = panel.getByRole("group", { name: "Set aside and resume" });
    await expect(drift).toContainText("stray.txt");
    const screenshots = join(TOOL_DIR, "../../.tmp/design-sync-recovery");
    mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: join(screenshots, "failed-run.png"), fullPage: true });
    await drift.getByRole("button", { name: "Set aside and resume" }).click();
    await expect(panel.getByRole("heading", { name: "Review the draft, then merge" })).toBeVisible({ timeout: 30000 });
    const ready = await (await page.request.get(`${url}/api/jobs/${job.id}`)).json() as Job;
    expect(ready.app!.branch).toBe(run.branch);
    expect(ready.app!.commits[0]).toEqual(run.commits[0]);
    expect(ready.app!.commits).toHaveLength(run.commits.length + unfinished);
    expect(ready.steps.find((s) => s.id === completedPort.id)).toEqual(completedPort);
    expect(existsSync(join(run.worktree, "stray.txt"))).toBe(false);
    await expect(panel).toContainText("Set aside 1 file changed after the last saved step");
    await page.screenshot({ path: join(screenshots, "resumed-run.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    if (server) {
      if ("closeAllConnections" in server) server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    removeWorktree(fx.ctx, run, true);
    rmSync(dirname(fx.repo), { recursive: true, force: true });
  }
});
