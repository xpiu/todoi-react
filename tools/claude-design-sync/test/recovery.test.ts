import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { canResume } from "../src/engine/approvals";
import { ADAPTATION_MARKER } from "../src/engine/adaptation";
import * as fake from "../src/engine/fakeHarness";
import { git } from "../src/engine/git";
import type { Runner } from "../src/engine/designsync";
import { ALREADY_IMPLEMENTED_MARKER, createWorktree, headOf, removeWorktree, verifyPort, verifyResume } from "../src/engine/worktree";
import { Jobs, type Job } from "../src/server/jobs";
import { createApp } from "../src/server/main";
import { makeFixture, type Fixture } from "./fixture";

let fx: Fixture;
const runs: NonNullable<Job["app"]>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const run of runs.splice(0)) removeWorktree(fx.ctx, run, true);
  if (fx) rmSync(dirname(fx.repo), { recursive: true, force: true });
});
const report = (ids: string[], path = "DESIGN.md") => ALREADY_IMPLEMENTED_MARKER + JSON.stringify({ units: ids.map((id) => ({ id, evidence: [{ path, reason: "The existing spec already describes and implements the requested behavior." }] })) }) + "\n" + ADAPTATION_MARKER + JSON.stringify({ units: ids.map((id) => ({
  id, intent: "Preserve the existing behavior", differences: "No implementation differences remain",
  implementation: "Keep existing files", tradeoffs: "No changes needed",
  interaction: { status: "not-applicable", evidence: "No interaction changed" },
  appearance: { status: "not-applicable", evidence: "No appearance changed" },
})) });
const request = (app: ReturnType<typeof createApp>, url: string, body?: unknown) => app.request(url, { method: "POST", headers: { "x-cds": "1", "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
async function settled(app: ReturnType<typeof createApp>, id: string): Promise<Job> {
  let job: Job;
  await vi.waitFor(async () => {
    job = await (await app.request(`/api/jobs/${id}`)).json() as Job;
    expect(job.state).not.toBe("running");
  }, { timeout: 10000 });
  return job!;
}

it("requires complete file evidence and an unchanged clean HEAD for an already-implemented result", () => {
  fx = makeFixture();
  const run = createWorktree(fx.ctx, "noop");
  runs.push(run);
  const before = headOf(run);
  const units = ["component:core/Toast", "spec:Toasts"];
  const check = (result: string) => verifyPort(run, before, { result, units });
  expect(check("Everything already matches").ok).toBe(false);
  expect(check(report(units))).toMatchObject({ ok: true, commits: [], alreadyImplemented: { units: expect.any(Array) } });
  expect(check(report(units.slice(0, 1))).ok).toBe(false);
  expect(check(report([units[0]!, units[0]!])).ok).toBe(false);
  expect(check(report([...units, "other"])).ok).toBe(false);
  expect(check(report(units, "missing.tsx")).ok).toBe(false);
  expect(check(report(units, "../outside.md")).ok).toBe(false);
  expect(check(report(units) + "\n" + report(units)).ok).toBe(false);
  expect(check(ALREADY_IMPLEMENTED_MARKER + "{broken").ok).toBe(false);
  writeFileSync(join(run.worktree, "stray.txt"), "uncommitted");
  expect(check(report(units))).toMatchObject({ ok: false, reason: "It changed 1 file(s) but made no commit" });
  rmSync(join(run.worktree, "stray.txt"));
  git(run.worktree, ["reset", "--hard", "HEAD~1"]);
  expect(check(report(units))).toMatchObject({ ok: false, reason: expect.stringContaining("backwards") });
});

it("accepts an already-implemented feature, continues later features, and still requires the gate and review", async () => {
  fx = makeFixture();
  const visited: string[] = [];
  vi.spyOn(fake, "fakeRunner").mockImplementation((): Runner => async (prompt) => {
    const ids = [...prompt.matchAll(/Subfeature id: (.+)/g)].map((m) => m[1]!);
    visited.push(...ids);
    return { type: "done", ok: true, result: report(ids) };
  });
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  const response = await request(app, "/api/run", { global: "design-to-app", overrides: {} });
  const { job: id } = await response.json() as { job: string };
  const job = await settled(app, id);
  runs.push(job.app!);
  expect(job.state).toBe("awaiting-approval");
  expect(job.steps.filter((s) => s.kind === "ai-pull").length).toBeGreaterThan(1);
  expect(job.steps.filter((s) => s.kind === "ai-pull").every((s) => s.state === "done" && s.alreadyImplemented)).toBe(true);
  expect(visited).toContain("component:core/Chip");
  expect(job.app).toMatchObject({ state: "ready", check: { ok: true }, review: { findings: expect.any(Array) } });
  // The only commit is the real deterministic CSS edit. No cosmetic or empty AI commits.
  expect(job.app!.commits).toHaveLength(1);
  expect((await request(app, `/api/jobs/${id}/merge`)).status).toBe(409);
  const stored = new Jobs(fx.ctx).get(id)!;
  expect(stored.steps).toEqual(job.steps);
});

it.each([false, true])("resumes the same branch after restart, retaining completed steps (legacy plan: %s)", async (legacy) => {
  fx = makeFixture();
  const visited: string[] = [];
  let fail = true;
  vi.spyOn(fake, "fakeRunner").mockImplementation((): Runner => async (prompt, _opts, on) => {
    const ids = [...prompt.matchAll(/Subfeature id: (.+)/g)].map((m) => m[1]!);
    visited.push(ids.join(","));
    const done = ids.includes("component:core/Chip") && fail
      ? { type: "done" as const, ok: false, result: "Temporary harness error", costUsd: 0.5 }
      : { type: "done" as const, ok: true, result: report(ids), costUsd: 0.5 };
    on(done);
    return done;
  });
  let app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  const { job: id } = await (await request(app, "/api/run", { global: "design-to-app", overrides: {} })).json() as { job: string };
  const failed = await settled(app, id);
  runs.push(failed.app!);
  expect(failed.state).toBe("failed");
  expect(canResume(failed)).toBe(true);
  const completed = failed.steps.filter((s) => s.state === "done");
  expect(completed.length).toBeGreaterThan(0);
  const before = headOf(failed.app!);
  if (legacy) rmSync(join(fx.ctx.state, "plans", `${id}.json`));
  fail = false;
  // New server loads persisted job state, rather than using the original objects.
  app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  expect((await request(app, `/api/jobs/${id}/resume`)).status).toBe(200);
  expect((await request(app, `/api/jobs/${id}/resume`)).status).toBe(409);
  const ready = await settled(app, id);
  expect(ready.app!.worktree).toBe(failed.app!.worktree);
  expect(ready.app!.branch).toBe(failed.app!.branch);
  expect(headOf(ready.app!)).toBe(before);
  expect(ready.app!.commits).toEqual(failed.app!.commits);
  expect(ready.state).toBe("awaiting-approval");
  expect(ready.app!.check!.ok).toBe(true);
  expect(ready.costUsd).toBeGreaterThan(failed.costUsd!);
  for (const step of completed) expect(ready.steps.find((s) => s.id === step.id)).toEqual(step);
  expect(visited.filter((ids) => ids.includes("component:board/BoardView"))).toHaveLength(1);
});

it("reruns a failed final gate without repeating verified no-change steps or creating empty commits", async () => {
  fx = makeFixture();
  fx.ctx.config.app.check = "exit 3";
  const runner = vi.fn<Runner>(async (prompt) => {
    const ids = [...prompt.matchAll(/Subfeature id: (.+)/g)].map((m) => m[1]!);
    return { type: "done", ok: true, result: report(ids) };
  });
  vi.spyOn(fake, "fakeRunner").mockReturnValue(runner);
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  const body = { global: "design-to-app", overrides: {} };
  const planned = await (await request(app, "/api/plan", body)).json() as { steps: Array<{ id: string; kind: string }> };
  const only = [planned.steps.find((s) => s.kind === "ai-pull")!.id];
  const { job: id } = await (await request(app, "/api/run", { ...body, only })).json() as { job: string };
  const failed = await settled(app, id);
  runs.push(failed.app!);
  expect(failed.steps.find((s) => s.id === "app-check")?.state).toBe("failed");
  expect(failed.app!.commits).toEqual([]);
  expect(runner).toHaveBeenCalledTimes(1);
  fx.ctx.config.app.check = "git log -1 --format=%s";
  expect((await request(app, `/api/jobs/${id}/resume`)).status).toBe(200);
  const ready = await settled(app, id);
  expect(ready.app).toMatchObject({ state: "ready", commits: [], check: { ok: true } });
  expect(runner).toHaveBeenCalledTimes(1);
  const head = git(fx.repo, ["rev-parse", "HEAD"]).trim();
  expect((await request(app, `/api/jobs/${id}/merge`, { reviewed: true })).status).toBe(200);
  expect(git(fx.repo, ["rev-parse", "HEAD"]).trim()).toBe(head);
  expect((await (await app.request(`/api/jobs/${id}`)).json() as Job).state).toBe("done");
});

it("refuses dirty, switched, or unexpectedly edited branches before resuming", () => {
  fx = makeFixture();
  const run = createWorktree(fx.ctx, "guards");
  runs.push(run);
  expect(() => verifyResume(run)).not.toThrow();
  writeFileSync(join(run.worktree, "stray.txt"), "dirty");
  expect(() => verifyResume(run)).toThrow(/uncommitted/);
  git(run.worktree, ["add", "stray.txt"]);
  git(run.worktree, ["commit", "-qm", "feat: manual edit"]);
  expect(() => verifyResume(run)).toThrow(/changed after/);
  git(run.worktree, ["checkout", "-qb", "another-branch"]);
  expect(() => verifyResume(run)).toThrow(/different branch/);
});

it("persists checkpoints atomically and keeps interrupted App jobs recoverable", () => {
  fx = makeFixture();
  const jobs = new Jobs(fx.ctx);
  const run = createWorktree(fx.ctx, "interrupted");
  runs.push(run);
  const job = jobs.create("run", "Interrupted", { app: run, steps: [{ id: "pull", title: "Pull", kind: "ai-pull", target: "app", state: "running" }] });
  const reloaded = new Jobs(fx.ctx).get(job.id)!;
  expect(reloaded.state).toBe("failed");
  expect(canResume(reloaded)).toBe(true);
  expect(canResume({ ...reloaded, steps: [...reloaded.steps, { id: "upload", title: "Upload", kind: "upload", target: "design", state: "pending" }] })).toBe(false);
  expect(readFileSync(join(fx.ctx.state, "jobs", `${job.id}.json`), "utf8")).toContain(job.id);
});
