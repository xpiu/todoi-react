import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { ADAPTATION_MARKER, blockedAdaptation, readAdaptation, type Adaptation } from "../src/engine/adaptation";
import * as fake from "../src/engine/fakeHarness";
import { parseClaudeLine } from "../src/engine/harness";
import { removeWorktree } from "../src/engine/worktree";
import { createApp } from "../src/server/main";
import { Jobs, type Job } from "../src/server/jobs";
import type { Step } from "../src/engine/plan";
import { makeFixture, type Fixture } from "./fixture";

// This suite exercises orchestration; rendering has its own real-browser coverage.
vi.mock("../src/engine/kit", async (original) => ({
  ...await original<typeof import("../src/engine/kit")>(),
  buildBundle: vi.fn(async () => "fixture bundle"),
  checkCards: vi.fn(async () => []),
}));
let fx: Fixture | undefined;
const runs: NonNullable<Job["app"]>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const run of runs.splice(0)) removeWorktree(fx!.ctx, run, true);
  if (fx) rmSync(dirname(fx.repo), { recursive: true, force: true });
  fx = undefined;
});
const unit = (id = "component:board/BoardView"): Adaptation["units"][number] => ({
  id, intent: "Keep each board's controlled state independent", differences: "Base UI versus kit-local state",
  implementation: "Use destination composition with controlled callbacks", tradeoffs: "Keep native APIs; do not mirror the implementation",
  interaction: { status: "passed", evidence: "Keyboard, callback and two-instance checks passed in the destination" },
  appearance: { status: "passed", evidence: "Rounded/Minimal and light/dark render comparisons passed" },
});
const result = (units = [unit()]) => `${ADAPTATION_MARKER}${JSON.stringify({ units })}`;

it("requires complete, unique decisions and evidence, and distinguishes blocked from unaffected checks", () => {
  const ids = [unit().id];
  expect(readAdaptation(result(), ids)).toEqual({ units: [unit()] });
  for (const text of ["DONE", `${result()}\n${result()}`, `${ADAPTATION_MARKER}{broken`, result([]), result([unit("other")]), result([unit(), unit()]), result([{ ...unit(), intent: " " }]), result([{ ...unit(), interaction: { status: "passed", evidence: "" } }])]) {
    expect(() => readAdaptation(text, ids)).toThrow();
  }
  const blocked = { ...unit(), interaction: { status: "blocked" as const, evidence: "Browser could not launch" } };
  expect(blockedAdaptation(readAdaptation(result([blocked]), ids))).toContain("Browser could not launch");
  const unaffected = { ...unit(), appearance: { status: "not-applicable" as const, evidence: "Only callback behavior changed" } };
  expect(blockedAdaptation(readAdaptation(result([unaffected]), ids))).toBeUndefined();
});

it("reads actual models, effective Bash effort, turns and limit errors without guessing defaults", () => {
  expect(parseClaudeLine(JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-test" }))).toContainEqual({ type: "runtime", model: "claude-opus-test" });
  expect(parseClaudeLine(JSON.stringify({ type: "assistant", message: { model: "fallback-model", content: [] } }))).toContainEqual({ type: "runtime", model: "fallback-model" });
  const effort = (content: string, is_error = false) => parseClaudeLine(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content, is_error }] } }));
  expect(effort("CDS_RUNTIME_EFFORT=high\n")).toContainEqual({ type: "runtime", effort: "high" });
  expect(effort("CDS_RUNTIME_EFFORT=unknown\n").some((e) => e.type === "runtime")).toBe(false);
  expect(effort("CDS_RUNTIME_EFFORT=high\n", true).some((e) => e.type === "runtime")).toBe(false);
  expect(parseClaudeLine(JSON.stringify({ type: "result", subtype: "error_max_turns", errors: ["Turn limit reached"], num_turns: 80, modelUsage: { "claude-opus-test": {} }, total_cost_usd: 2 }))).toContainEqual({ type: "done", ok: false, result: "Turn limit reached", stopReason: "error_max_turns", turns: 80, models: ["claude-opus-test"], costUsd: 2 });
});

const request = (app: ReturnType<typeof createApp>, url: string, body: unknown) => app.request(url, { method: "POST", headers: { "x-cds": "1", "content-type": "application/json" }, body: JSON.stringify(body) });
async function settled(app: ReturnType<typeof createApp>, id: string): Promise<Job> {
  let job: Job;
  await vi.waitFor(async () => {
    job = await (await app.request(`/api/jobs/${id}`)).json() as Job;
    expect(job.state).not.toBe("running");
  }, { timeout: 10000 });
  if (job!.app && !runs.some((run) => run.branch === job!.app!.branch)) runs.push(job!.app);
  return job!;
}

it("shares verified decisions and updated files across directions, and persists actual usage separately from requested settings", async () => {
  fx = makeFixture();
  const original = fake.fakeRunner;
  const prompts: string[] = [];
  vi.spyOn(fake, "fakeRunner").mockImplementation((design, repo, options) => {
    const runner = original(design, repo, options);
    return async (prompt, opts, on) => {
      prompts.push(prompt);
      on({ type: "runtime", model: "actual-model", effort: "medium" });
      const done = await runner(prompt, opts, (e) => { if (e.type !== "done") on(e); });
      const units = [...prompt.matchAll(/Subfeature id: (.+)/g)].map((m) => unit(m[1]!));
      const reported = { ...done, result: result(units), turns: 7, models: ["actual-model"], costUsd: 0.25 };
      on(reported);
      return reported;
    };
  });
  fx.ctx.config.harness.implementModel = "requested-alias";
  fx.ctx.config.harness.implementEffort = "high";
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  const body = { global: "both", overrides: {} };
  const { steps } = await (await request(app, "/api/plan", body)).json() as { steps: Step[] };
  const pull = steps.find((s) => s.kind === "ai-pull" && s.units.includes(unit().id))!;
  const push = steps.find((s) => s.kind === "ai-push" && s.featureId === pull.featureId)!;
  expect(pull.brief).toContain("Both sides changed");
  const { job: id } = await (await request(app, "/api/run", { ...body, only: [pull.id, push.id] })).json() as { job: string };
  const job = await settled(app, id);
  expect(job.state).toBe("awaiting-approval");
  expect(prompts).toHaveLength(2);
  expect(prompts[0]).toContain("Completed direction's decisions: []");
  expect(prompts[1]).toContain('"intent":"Keep each board\'s controlled state independent"');
  expect(prompts[1]).toContain(join(job.app!.worktree, "src/client/design/board/BoardView.tsx"));
  expect(readFileSync(join(job.app!.worktree, "src/client/design/board/BoardView.tsx"), "utf8")).toContain("ported by the fake harness");
  for (const s of job.steps.filter((step) => step.kind.startsWith("ai-"))) {
    expect(s.adaptation?.units.length).toBeGreaterThan(0);
    expect(s.attempts).toEqual([expect.objectContaining({ requestedModel: "requested-alias", requestedEffort: "high", maxTurns: 80, models: ["actual-model"], efforts: ["medium"], turns: 7, costUsd: 0.25, endedAt: expect.any(String), stopReason: "success" })]);
  }
  expect(new Jobs(fx.ctx).get(id)!.steps).toEqual(job.steps);
});

it.each(["missing", "blocked", "turn-limit"])("keeps %s verification from succeeding, preserving the attempt across retry and restart", async (failure) => {
  fx = makeFixture();
  const original = fake.fakeRunner;
  let fail = true;
  let failingUnit: string;
  vi.spyOn(fake, "fakeRunner").mockImplementation((design, repo, options) => {
    const runner = original(design, repo, options);
    return async (prompt, opts, on) => {
      const done = await runner(prompt, opts, (e) => { if (e.type !== "done") on(e); });
      const units = [...prompt.matchAll(/Subfeature id: (.+)/g)].map((m) => unit(m[1]!));
      const failing = fail && units.some((u) => u.id === failingUnit);
      const reported = { ...done, result: failing && failure === "missing" ? "DONE" : result(units.map((u) => failing && failure === "blocked" ? { ...u, interaction: { status: "blocked" as const, evidence: "Keyboard behavior has not been exercised" } } : u)), ok: !(failing && failure === "turn-limit"), turns: failing && failure === "turn-limit" ? 80 : 4, stopReason: failing && failure === "turn-limit" ? "error_max_turns" : "success" };
      on(reported);
      return reported;
    };
  });
  let app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  const body = { global: "design-to-app", overrides: {} };
  const { steps } = await (await request(app, "/api/plan", body)).json() as { steps: Step[] };
  const [completed, pull] = steps.filter((s) => s.kind === "ai-pull");
  failingUnit = pull!.units[0]!;
  const { job: id } = await (await request(app, "/api/run", { ...body, only: [completed!.id, pull!.id] })).json() as { job: string };
  const failed = await settled(app, id);
  expect(failed.state).toBe("failed");
  const failedStep = failed.steps.find((s) => s.id === pull!.id)!;
  expect(failedStep.state).toBe("failed");
  expect(failedStep.attempts).toHaveLength(1);
  expect(failedStep.attempts![0]!.turns).toBe(failure === "turn-limit" ? 80 : 4);
  expect(failedStep.attempts![0]!.efforts).toEqual([]);
  if (failure === "blocked") expect(failedStep.adaptation!.units[0]!.interaction.status).toBe("blocked");
  expect((await request(app, `/api/jobs/${id}/merge`, { reviewed: true })).status).toBe(400);
  fail = false;
  app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  expect((await request(app, `/api/jobs/${id}/resume`, {})).status).toBe(200);
  const ready = await settled(app, id);
  expect(ready.state).toBe("awaiting-approval");
  expect(ready.steps.find((s) => s.id === completed!.id)).toEqual(failed.steps.find((s) => s.id === completed!.id));
  const attempts = ready.steps.find((s) => s.id === pull!.id)!.attempts!;
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(failedStep.attempts![0]);
  expect(attempts[1]!.turns).toBe(4);
});

it("records cancellation on a live attempt without claiming successful completion", async () => {
  fx = makeFixture();
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir, delayMs: 200 } });
  const body = { global: "design-to-app", overrides: {} };
  const { steps } = await (await request(app, "/api/plan", body)).json() as { steps: Step[] };
  const pull = steps.find((s) => s.kind === "ai-pull")!;
  const { job: id } = await (await request(app, "/api/run", { ...body, only: [pull.id] })).json() as { job: string };
  await vi.waitFor(async () => {
    const job = await (await app.request(`/api/jobs/${id}`)).json() as Job;
    expect(job.steps.find((s) => s.id === pull.id)?.attempts).toHaveLength(1);
  });
  expect((await request(app, `/api/jobs/${id}/cancel`, {})).status).toBe(200);
  await vi.waitFor(async () => {
    const job = await (await app.request(`/api/jobs/${id}`)).json() as Job;
    expect(job.steps.find((s) => s.id === pull.id)?.attempts?.[0]?.endedAt).toBeDefined();
    expect(job.app?.state).toBe("failed");
  });
  const cancelled = await settled(app, id);
  expect(cancelled.state).toBe("cancelled");
  expect(cancelled.steps.find((s) => s.id === pull.id)!.attempts![0]!.stopReason).toBe("cancelled");
});
