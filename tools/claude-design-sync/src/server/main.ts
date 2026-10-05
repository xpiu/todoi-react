// Claude Design Sync — local server. Binds to 127.0.0.1 only; every POST needs the x-cds header so
// another site in the browser can't trigger runs.
import { serve } from "@hono/node-server";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { uploadPending } from "../engine/approvals";
import { compare, unitBaseline } from "../engine/compare";
import { defaultCtx, saveConfig, TOOL_DIR, type Ctx } from "../engine/config";
import { checkUpload, findProject, isCurrent, projectStatus, pullIfChanged, pushFiles, verifyUpload, type Runner } from "../engine/designsync";
import { fakeRunner } from "../engine/fakeHarness";
import { readText } from "../engine/fsutil";
import { commitsAfter, diffNoIndex, diffSince, git, head, isDirty, showAt } from "../engine/git";
import { runHarness, type HarnessEvent, type HarnessKind } from "../engine/harness";
import { sections } from "../engine/inventory";
import { laneRules } from "../engine/lanes";
import { parseProjectRef } from "../engine/project";
import { buildBundle, checkCards, resolveKitFile } from "../engine/kit";
import { commitAll, commitsSince, createWorktree, headOf, mergeRun, removeWorktree, runCheck, verifyPort } from "../engine/worktree";
import { createStage, cssMergeFor, effectiveDirection, fillStage, planSteps, recordSyncPoint, stagedChanges, unitChoicesFor, type Step } from "../engine/plan";
import { deriveSnapshot, getSnapshot, importExport, latestSnapshot, listSnapshots, listSyncPoints, snapshotFilesDir } from "../engine/snapshots";
import type { Comparison, Direction } from "../engine/types";
import { Jobs, type Job } from "./jobs";
import { mappingHistory } from "./mapping";
import { buildUi } from "./ui-build";

export interface HarnessInfo {
  ok: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export function createApp(ctx: Ctx, opts: { fake?: { designDir: string } } = {}) {
  const app = new Hono();
  const jobs = new Jobs(ctx);
  const cache = new Map<string, Comparison>();
  /** The last time Claude Design was asked whether it changed (this server's lifetime) */
  let lastCheck: { at: string; updatedAt: string | null; stale: boolean } | null = null;

  /** Is the harness on PATH, and does it actually start? (A broken install is worse than a missing one.) */
  const probe = (bin: string): HarnessInfo => {
    try {
      const path = execFileSync("/bin/sh", ["-lc", `command -v ${bin}`], { encoding: "utf8" }).trim();
      if (!path) return { ok: false, error: `${bin} isn't on PATH` };
      try {
        const version = execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0];
        return { ok: true, path, version };
      } catch (e) {
        const out = String((e as { stderr?: string }).stderr ?? (e as Error).message);
        const msg = /^(?:\w*Error): (.+)$/m.exec(out)?.[1] ?? out.split("\n").find((l) => l.trim() && !/^\s*(at |throw|\^|file:)/.test(l))?.trim() ?? "it exits with an error";
        return { ok: false, path, error: `${bin} is installed but doesn't start: ${msg}` };
      }
    } catch {
      return { ok: false, error: `${bin} isn't on PATH` };
    }
  };
  // Codex is untested (no working install to test against), so it's only probed when config.json picks it
  let probed: { claude: HarnessInfo; codex?: HarnessInfo } | null = null;
  const harnesses = () =>
    opts.fake ? { claude: { ok: true, version: "fake" } } : (probed ??= { claude: probe(ctx.config.harness.claudeBin), ...(ctx.config.harness.implement === "codex" ? { codex: probe(ctx.config.harness.codexBin) } : {}) });

  /** DesignSync always goes through Claude Code (it's the only harness with the tool) */
  const designRunner = (job?: Job): Runner =>
    opts.fake
      ? fakeRunner(opts.fake.designDir, ctx.repo)
      : (prompt, o, on) => runHarness({ kind: "claude", bin: ctx.config.harness.claudeBin, cwd: ctx.repo, prompt, model: o.model, maxTurns: o.maxTurns, allowedTools: ["DesignSync", "ToolSearch"], signal: job ? jobs.signal(job.id) : undefined }, on);

  /** App ports run in their worktree (`cwd`, reading the Design snapshot via addDirs); kit ports in the repo, writing the stage */
  const implementRunner = (kind: HarnessKind, job: Job, where: { cwd?: string; addDirs?: string[]; stage?: string }): Runner =>
    opts.fake
      ? fakeRunner(opts.fake.designDir, where.cwd ?? ctx.repo)
      : (prompt, _o, on) => runHarness({ kind, bin: kind === "codex" ? ctx.config.harness.codexBin : ctx.config.harness.claudeBin, cwd: where.cwd ?? ctx.repo, prompt: where.stage ? `${prompt}\n\n(Also allowed: files under ${where.stage}.)` : prompt, model: ctx.config.harness.implementModel || undefined, edits: true, maxTurns: 80, addDirs: where.addDirs, signal: jobs.signal(job.id) }, on);

  const logHarness = (job: Job, stepId?: string) => (e: HarnessEvent) => {
    if (e.type === "text") jobs.log(job, "ai", e.text, stepId);
    else if (e.type === "tool") jobs.log(job, "tool", `${e.name} ${summarise(e.input)}`, stepId);
    else if (e.type === "done") {
      if (typeof e.costUsd === "number") jobs.update(job, { costUsd: (job.costUsd ?? 0) + e.costUsd });
    } else if (e.type === "stderr" && e.text.trim()) jobs.log(job, "warn", e.text.trim(), stepId);
  };

  const baseFor = (id?: string | null) => {
    const points = listSyncPoints(ctx);
    return (id ? points.find((p) => p.id === id) : points[0]) ?? null;
  };
  const getComparison = (baseId?: string | null, snapshotId?: string | null, fresh = false) => {
    const base = baseFor(baseId);
    const snap = snapshotId ? getSnapshot(ctx, snapshotId) : latestSnapshot(ctx);
    const key = `${base?.id}|${snap?.id}|${head(ctx.repo)}`;
    if (!fresh && cache.has(key)) return cache.get(key)!;
    const c = compare(ctx, { base, snapshotId: snap?.id ?? null });
    cache.set(key, c);
    return c;
  };

  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.header("x-cds") !== "1") return c.json({ error: "Missing x-cds header" }, 403);
    await next();
  });

  app.get("/api/state", (c) =>
    c.json({
      project: { id: ctx.config.design.projectId, name: ctx.config.design.projectName },
      repo: ctx.repo,
      appHead: head(ctx.repo),
      dirty: isDirty(ctx.repo),
      syncPoints: listSyncPoints(ctx),
      snapshots: listSnapshots(ctx),
      harnesses: harnesses(),
      implement: ctx.config.harness.implement,
      check: ctx.config.app.check,
      jobs: jobs.list().slice(0, 20).map(({ events: _e, ...j }) => j),
      fake: !!opts.fake,
    }),
  );

  // The Mapping page: the lane rules from config.json, recent traffic, and how fresh each side's data is
  app.get("/api/mapping", (c) => {
    try {
      const base = baseFor(c.req.query("base"));
      let branch: string | null = null;
      try {
        branch = git(ctx.repo, ["symbolic-ref", "--short", "HEAD"]).trim();
      } catch {
        /* detached HEAD */
      }
      return c.json({
        lanes: laneRules(ctx.config),
        history: mappingHistory(ctx, jobs.list()),
        lastCheck,
        app: { branch, commitsSinceBase: base ? commitsAfter(ctx.repo, base.rev).length : null },
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.get("/api/compare", (c) => {
    try {
      return c.json(getComparison(c.req.query("base"), c.req.query("snapshot"), c.req.query("fresh") === "1"));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.get("/api/diff", (c) => {
    const cmp = getComparison(c.req.query("base"), c.req.query("snapshot"));
    const unit = cmp.units.find((u) => u.id === c.req.query("unit"));
    if (!unit) return c.json({ error: "Unknown unit" }, 404);
    const side = c.req.query("side") === "design" ? "design" : "app";
    const base = unitBaseline(cmp, unit);
    if (side === "app") {
      if (unit.kind === "spec") {
        const now = sections(readText(join(ctx.repo, unit.app.paths[0] ?? ""))).get(unit.name) ?? "";
        const was = base ? sections(showAt(ctx.repo, base.rev, unit.app.paths[0] ?? "")).get(unit.name) ?? "" : "";
        return c.json({ text: plainDiff(was, now) });
      }
      return c.json({ text: base ? diffSince(ctx.repo, base.rev, unit.app.paths) : "" });
    }
    const snap = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
    const baseSnap = base?.designSnapshot ? snapshotFilesDir(ctx, base.designSnapshot) : null;
    if (!snap) return c.json({ text: "" });
    if (unit.kind === "spec") {
      const now = sections(readText(join(snap, unit.design.paths[0] ?? ""))).get(unit.name) ?? "";
      const was = baseSnap ? sections(readText(join(baseSnap, unit.design.paths[0] ?? ""))).get(unit.name) ?? "" : "";
      return c.json({ text: plainDiff(was, now) });
    }
    const text = unit.design.paths.map((p) => (baseSnap && existsSync(join(baseSnap, p)) ? diffNoIndex(join(baseSnap, p), join(snap, p)) : `new file ${p}\n` + (readText(join(snap, p)) ?? "").split("\n").map((l) => `+${l}`).join("\n"))).join("\n");
    return c.json({ text: text.replaceAll(snap, "now").replaceAll(baseSnap ?? "\u0000", "base") });
  });

  app.post("/api/plan", async (c) => {
    const body = await c.req.json<{ base?: string; snapshot?: string; global: Direction; overrides: Record<string, Direction>; unitOverrides?: Record<string, Direction> }>();
    const cmp = getComparison(body.base, body.snapshot);
    const choices = Object.fromEntries(cmp.features.map((f) => [f.id, effectiveDirection(f, body.global, body.overrides[f.id])]));
    const units = unitChoicesFor(cmp, body.global, body.overrides, body.unitOverrides);
    return c.json({ steps: planSteps(ctx, cmp, choices, units), choices, units });
  });

  // Switch the Claude Design project the tool targets (checked against the account's projects first)
  app.post("/api/project", async (c) => {
    const { project } = await c.req.json<{ project: string }>();
    const id = parseProjectRef(project ?? "");
    if (!id) return c.json({ error: "Paste a Claude Design project link (https://claude.ai/design/p/…) or its id." }, 400);
    if (id === ctx.config.design.projectId) return c.json({ project: { id, name: ctx.config.design.projectName } });
    if (jobs.running()) return c.json({ error: "A job is running. Switch projects when it has finished." }, 409);
    const waiting = jobs.list().find((j) => j.state === "awaiting-approval" && uploadPending(j));
    if (waiting) return c.json({ error: `“${waiting.title}” is waiting to upload to ${ctx.config.design.projectName}. Upload or discard it first.` }, 409);
    try {
      const found = await findProject(ctx, designRunner(), id);
      if (!found) return c.json({ error: `Claude Design has no project ${id} on this account.` }, 404);
      ctx.config.design.projectId = found.projectId;
      ctx.config.design.projectName = found.name;
      saveConfig(ctx);
      cache.clear();
      return c.json({ project: { id: found.projectId, name: found.name } });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.post("/api/status-check", async (c) => {
    try {
      const st = await projectStatus(ctx, designRunner());
      const snap = latestSnapshot(ctx);
      const stale = !!st.updatedAt && !isCurrent(ctx, snap, st.updatedAt);
      lastCheck = { at: new Date().toISOString(), updatedAt: st.updatedAt, stale };
      return c.json({ ...st, snapshotUpdatedAt: snap?.projectUpdatedAt ?? null, stale });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.post("/api/pull", async (c) => {
    if (jobs.running()) return c.json({ error: "Another job is running" }, 409);
    const { force } = await c.req.json<{ force?: boolean }>().catch(() => ({ force: false }));
    const job = jobs.create("pull", "Pull from Claude Design");
    void (async () => {
      try {
        jobs.log(job, "info", "Asking Claude Design whether the project changed since the newest snapshot…");
        const runner = designRunner(job);
        const { snapshot: snap, current, updatedAt } = await pullIfChanged(ctx, runner, { force, onLog: logHarness(job), label: `Pulled ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, onProgress: (p) => jobs.update(job, { progress: { done: p.done, total: p.total } }) });
        // a complete pull (or none needed) leaves the tool holding Design's current state
        if (!snap?.unpulled) lastCheck = { at: new Date().toISOString(), updatedAt: updatedAt ?? null, stale: false };
        if (!snap) {
          jobs.finish(job, "done", `Already up to date: Claude Design hasn't changed since ${current?.label ?? "the newest snapshot"}. Nothing pulled.`);
          return;
        }
        cache.clear();
        jobs.update(job, { snapshotId: snap.id });
        const un = snap.unpulled;
        if (un) for (const p of [...un.carried, ...un.missing]) jobs.log(job, "warn", `${p}: couldn't be pulled${un.carried.includes(p) ? `, kept as in ${un.from}` : ""}`);
        jobs.finish(job, "done", `Snapshot ready: ${snap.fileCount} files${un ? `. ${un.carried.length + un.missing.length} couldn't be pulled${un.carried.length ? ` (${un.carried.length} kept as in ${un.from})` : ""}: pull again` : ""}`);
      } catch (e) {
        jobs.finish(job, "failed", e instanceof Error ? e.message : String(e));
      }
    })();
    return c.json({ job: job.id });
  });

  app.post("/api/import", async (c) => {
    const { path, label } = await c.req.json<{ path: string; label?: string }>();
    try {
      const snap = importExport(ctx, resolve(path.replace(/^~(?=\/)/, process.env.HOME ?? "~")), label);
      cache.clear();
      return c.json({ snapshot: snap });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  app.post("/api/sync-point", async (c) => {
    const { label, tag, snapshot, base, hold } = await c.req.json<{ label: string; tag?: boolean; snapshot?: string; base?: string | null; hold?: string[] }>();
    try {
      const p = recordSyncPoint(ctx, { label, tag, snapshotId: snapshot ?? latestSnapshot(ctx)?.id ?? null, from: baseFor(base), hold });
      cache.clear();
      return c.json({ syncPoint: p });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  app.post("/api/run", async (c) => {
    if (jobs.running()) return c.json({ error: "Another job is running" }, 409);
    const body = await c.req.json<{ base?: string; snapshot?: string; global: Direction; overrides: Record<string, Direction>; unitOverrides?: Record<string, Direction>; only?: string[] }>();
    const cmp = getComparison(body.base, body.snapshot);
    const choices = Object.fromEntries(cmp.features.map((f) => [f.id, effectiveDirection(f, body.global, body.overrides[f.id])]));
    let steps = planSteps(ctx, cmp, choices, unitChoicesFor(cmp, body.global, body.overrides, body.unitOverrides));
    if (body.only?.length) steps = steps.filter((s) => body.only!.includes(s.id) || (s.kind === "upload" && steps.some((x) => body.only!.includes(x.id) && x.target === "design")));
    if (!steps.length) return c.json({ error: "Nothing to do: every feature is skipped or already in sync" }, 400);
    const jobSteps: Job["steps"] = steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, target: s.target, state: "pending" as const }));
    // App work ends with the repo's check on the run's branch, then waits for the developer's merge
    if (steps.some((s) => s.target === "app")) {
      const at = jobSteps.findIndex((s) => s.id === "upload");
      jobSteps.splice(at < 0 ? jobSteps.length : at, 0, { id: "app-check", title: `Run ${ctx.config.app.check} on the run's branch`, kind: "check", target: "app", state: "pending" }, { id: "app-merge", title: "Merge the run's branch into your branch (after your review)", kind: "merge", target: "app", state: "pending" });
    }
    const job = jobs.create("run", `Sync ${new Set(steps.map((s) => s.featureId)).size - (steps.some((s) => s.kind === "upload") ? 1 : 0)} feature(s)`, { baseId: cmp.base?.id ?? null, snapshotId: cmp.designSnapshot?.id ?? null, steps: jobSteps });
    void runPlan(job, cmp, steps, ctx.config.harness.implement);
    return c.json({ job: job.id });
  });

  /** A job ends only when nothing waits on the developer: no upload to approve, no verified branch to merge */
  const settle = (job: Job, note: string, failed = false) => jobs.finish(job, uploadPending(job) || job.app?.state === "ready" ? "awaiting-approval" : failed ? "failed" : "done", note);

  /** The App's branch is kept for a look when its run fails or stops; only Discard removes it */
  const keepAppRun = (job: Job, reason: string) => {
    const run = job.app;
    if (!run || run.state !== "working") return;
    try {
      run.commits = commitsSince(run);
    } catch {
      /* the worktree is gone */
    }
    Object.assign(run, { state: "failed", reason });
    jobs.update(job, {});
    jobs.log(job, "warn", `The App branch ${run.branch} is kept for a look (${run.worktree}). Discard removes it.`);
  };

  async function runPlan(job: Job, cmp: Comparison, steps: Step[], harness: HarnessKind) {
    const stage = steps.some((s) => s.target === "design") ? createStage(ctx, cmp, job.id) : undefined;
    if (stage) jobs.update(job, { stage });
    const snapshotDir = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
    try {
      // App work never touches the developer's checkout: a worktree on its own branch, merged on approval
      const run = steps.some((s) => s.target === "app") ? createWorktree(ctx, job.id) : undefined;
      if (run) {
        jobs.update(job, { app: run });
        jobs.log(job, "info", `App work runs on ${run.branch}, a separate worktree from ${run.base.slice(0, 7)} on ${run.into}. Your checkout isn't touched until you merge. (${run.worktree})`);
      }
      for (const s of steps) {
        if (jobs.signal(job.id)?.aborted) {
          keepAppRun(job, "Stopped by you");
          return;
        }
        if (s.kind === "upload") continue;
        jobs.step(job, s.id, { state: "running" });
        jobs.log(job, "step", s.title, s.id);
        if (s.kind === "merge-css") {
          const unit = cmp.units.find((u) => u.id === s.units[0])!;
          const { text, summary } = cssMergeFor(ctx, cmp, unit, s.target);
          const dest = s.target === "app" ? join(run!.worktree, unit.app.paths[0]!) : join(stage!, unit.design.paths[0]!);
          writeFileSync(dest, text);
          if (s.target === "app") commitAll(run!, `style(tokens): merge Claude Design's ${unit.name} rules`);
          jobs.step(job, s.id, { state: "done", summary });
          jobs.log(job, "info", summary, s.id);
          continue;
        }
        if (s.target === "app") {
          const before = headOf(run!);
          const brief = `You are working in ${run!.worktree}, a git worktree of ${ctx.repo} on branch ${run!.branch}. Make every change there and finish with a commit there; never edit ${ctx.repo} itself.\n\n${(s.brief ?? "").replaceAll(`in this repository (${ctx.repo})`, `in this worktree (${run!.worktree})`)}`;
          const done = await implementRunner(harness, job, { cwd: run!.worktree, addDirs: snapshotDir ? [snapshotDir] : [] })(brief, {}, logHarness(job, s.id));
          if (!done.ok) {
            jobs.step(job, s.id, { state: "failed", summary: done.result.slice(0, 600) });
            throw new Error(`${s.title}: ${done.result || "the harness reported a failure"}`);
          }
          // the harness's own "ok" isn't proof: the port must have committed, and left nothing behind
          const v = verifyPort(run!, before);
          if (!v.ok) {
            jobs.step(job, s.id, { state: "failed", summary: v.reason });
            throw new Error(`${s.title}: ${v.reason}`);
          }
          jobs.step(job, s.id, { state: "done", summary: v.commits.map((c) => `${c.hash} ${c.subject}`).join(" · ") });
          continue;
        }
        const done = await implementRunner("claude", job, { stage })(fillStage(s.brief ?? "", stage ?? "(no staging folder)"), {}, logHarness(job, s.id));
        jobs.step(job, s.id, { state: done.ok ? "done" : "failed", summary: done.result.slice(0, 600) });
        if (!done.ok) throw new Error(`${s.title}: ${done.result || "the harness reported a failure"}`);
      }
      const notes: string[] = [];
      if (run) {
        run.commits = commitsSince(run);
        jobs.step(job, "app-check", { state: "running" });
        jobs.log(job, "step", `Running ${ctx.config.app.check} on ${run.branch}…`, "app-check");
        const check = await runCheck(run, ctx.config.app.check, jobs.signal(job.id));
        run.check = check;
        jobs.log(job, check.ok ? "info" : "error", check.output.trim().split("\n").slice(-12).join("\n") || "(no output)", "app-check");
        if (!check.ok) {
          jobs.step(job, "app-check", { state: "failed", summary: `${check.command} failed` });
          throw new Error(`${check.command} failed on ${run.branch}, so it can't be merged. The branch is kept for a look; Discard removes it.`);
        }
        jobs.step(job, "app-check", { state: "done", summary: `${check.command} passed` });
        run.state = "ready";
        jobs.step(job, "app-merge", { state: "pending", summary: `${run.commits.length} commit(s) waiting for your merge` });
        notes.push(`${run.commits.length} App commit(s) passed ${check.command}: review and merge`);
      }
      cache.clear();
      if (stage) {
        const staged = stagedChanges(ctx, cmp, stage);
        const cards = staged.map((x) => x.path).filter((p) => /\.html$/.test(p) && p.startsWith("components/"));
        let checked: Array<{ card: string; errors: string[] }> = [];
        if (cards.length) {
          jobs.log(job, "step", `Rendering ${cards.length} staged preview card(s) with a local bundle…`);
          await buildBundle(stage);
          checked = (await checkCards(stage, cards, undefined, { fallbacks: ctx.config.design.assetFallbacks, repo: ctx.repo })).map(({ card, errors }) => ({ card, errors }));
          for (const r of checked) jobs.log(job, r.errors.length ? "warn" : "info", r.errors.length ? `${r.card}: ${r.errors.join(" · ")}` : `${r.card} renders cleanly`);
        }
        jobs.update(job, { staged, cards: checked });
        if (staged.length) {
          jobs.step(job, "upload", { state: "pending", summary: `${staged.length} file(s) waiting for your approval` });
          notes.push(`${staged.length} kit file(s) staged: review and approve the upload`);
        } else jobs.step(job, "upload", { state: "skipped", summary: "No kit files changed" });
      }
      settle(job, notes.join(" · ") || "All steps finished");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      keepAppRun(job, msg);
      settle(job, msg, true);
    }
  }

  app.post("/api/jobs/:id/upload", async (c) => {
    const job = jobs.get(c.req.param("id"));
    if (!job || job.state !== "awaiting-approval" || !job.stage || !uploadPending(job)) return c.json({ error: "This run has nothing waiting for upload" }, 400);
    const { paths } = await c.req.json<{ paths: string[] }>();
    const allowed = new Set((job.staged ?? []).map((s) => s.path));
    const files = paths.filter((p) => allowed.has(p));
    if (!files.length) return c.json({ error: "Pick at least one staged file" }, 400);
    job.state = "running";
    jobs.step(job, "upload", { state: "running" });
    void (async () => {
      try {
        const runner = designRunner(job);
        const from = job.snapshotId ? getSnapshot(ctx, job.snapshotId) : latestSnapshot(ctx);
        jobs.log(job, "step", "Checking Claude Design for edits made since this run's snapshot…", "upload");
        const check = await checkUpload(ctx, runner, { stageDir: job.stage!, baseDir: from ? snapshotFilesDir(ctx, from.id) : null, baseUpdatedAt: from?.projectUpdatedAt, paths: files, onLog: logHarness(job, "upload") });
        const conflict = new Map(check.conflicts.map((x) => [x.path, x.reason]));
        jobs.update(job, { staged: job.staged!.map(({ conflict: _c, ...s }) => (conflict.has(s.path) ? { ...s, conflict: conflict.get(s.path) } : s)) });
        if (check.fresh) jobs.log(job, "info", "Claude Design hasn't changed since the snapshot", "upload");
        for (const p of check.merged) jobs.log(job, "info", `${p}: merged Claude Design's newer edits into the staged copy`, "upload");
        if (conflict.size) {
          for (const x of check.conflicts) jobs.log(job, "warn", `${x.path}: ${x.reason}`, "upload");
          jobs.step(job, "upload", { state: "pending", summary: `${conflict.size} file(s) would overwrite newer Design work` });
          jobs.finish(job, "awaiting-approval", `Nothing uploaded: Claude Design changed ${conflict.size === 1 ? "a file" : `${conflict.size} files`} since this run's snapshot. Untick ${conflict.size === 1 ? "it" : "them"} to upload the rest, or pull and run the feature again.`);
          return;
        }
        jobs.log(job, "step", `Uploading ${files.length} file(s) to ${ctx.config.design.projectName}…`, "upload");
        const res = await pushFiles(ctx, runner, job.stage!, files, logHarness(job, "upload"));
        jobs.log(job, "step", `Reading the ${files.length} file(s) back from Claude Design…`, "upload");
        const { contents, differ } = await verifyUpload(ctx, runner, job.stage!, files, logHarness(job, "upload"));
        for (const p of differ) jobs.log(job, "warn", `${p}: ${contents.has(p) ? "Claude Design holds different content than was uploaded" : "couldn't be read back"}`, "upload");
        // The snapshot keeps what Design holds now. It is Design's exact state only when nothing else moved
        // before the upload and everything read back intact; then it takes the post-upload updatedAt, so
        // "Check for changes" doesn't ask for a pull it doesn't need.
        const changes = Object.fromEntries(files.map((p) => [p, contents.get(p) ?? readFileSync(join(job.stage!, p), "utf8")]));
        const after = check.fresh && !differ.length ? await projectStatus(ctx, runner, logHarness(job, "upload")).catch(() => null) : null;
        if (from) deriveSnapshot(ctx, from.id, changes, `After upload (${res.written} files)`, "upload", after?.updatedAt ?? undefined);
        cache.clear();
        if (differ.length) {
          jobs.step(job, "upload", { state: "failed", summary: `${res.written} file(s) written · ${differ.length} didn't read back intact` });
          settle(job, `Uploaded ${res.written} file(s), but ${differ.length === 1 ? "1 doesn't" : `${differ.length} don't`} read back as uploaded: ${differ.join(", ")}. Pull to see what Claude Design holds.`, true);
          return;
        }
        jobs.step(job, "upload", { state: "done", summary: `${res.written} file(s) written and read back intact${res.planId ? ` · plan ${res.planId}` : ""}` });
        settle(job, `Uploaded ${res.written} file(s) to Claude Design, all read back intact${check.fresh ? "" : ". Design had other changes too: pull to see them."}${job.app?.state === "ready" ? " The App branch still waits for your merge." : " Mark synced when both sides look right."}`);
      } catch (e) {
        // nothing (or not everything) went up: keep the staged files so the upload can be tried again
        jobs.step(job, "upload", { state: "failed", summary: "Upload failed; the staged files are kept" });
        jobs.finish(job, "awaiting-approval", `Upload failed: ${e instanceof Error ? e.message : String(e)}. Try again, or discard the run.`);
      }
    })();
    return c.json({ ok: true });
  });

  // Bring a verified App branch into the developer's branch; conflicts leave everything as it was
  app.post("/api/jobs/:id/merge", (c) => {
    const job = jobs.get(c.req.param("id"));
    const run = job?.app;
    if (!job || !run || run.state !== "ready") return c.json({ error: "This run has no verified App branch waiting to merge" }, 400);
    try {
      const how = mergeRun(ctx, run);
      removeWorktree(ctx, run, true);
      run.state = "merged";
      cache.clear();
      const summary = `${run.commits.length} commit(s) merged into ${run.into} (${how === "fast-forward" ? "fast-forward" : "merge commit"})`;
      jobs.step(job, "app-merge", { state: "done", summary });
      jobs.log(job, "info", `${summary}; ${run.branch} and its worktree removed`, "app-merge");
      settle(job, `${summary}.${uploadPending(job) ? " The kit upload still waits for your approval." : " Mark synced when both sides look right."}`);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      jobs.log(job, "warn", msg, "app-merge");
      return c.json({ error: msg }, 409);
    }
  });

  app.post("/api/jobs/:id/discard", (c) => (jobs.discard(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "This run holds nothing to discard" }, 400)));

  app.post("/api/jobs/:id/cancel", (c) => {
    jobs.cancel(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/jobs/:id", (c) => {
    const j = jobs.get(c.req.param("id"));
    return j ? c.json(j) : c.json({ error: "Unknown job" }, 404);
  });

  app.get("/api/jobs/:id/events", (c) =>
    streamSSE(c, async (stream) => {
      const id = c.req.param("id");
      const j = jobs.get(id);
      if (!j) return;
      await stream.writeSSE({ event: "job", data: JSON.stringify(j) });
      const off = jobs.subscribe(id, ({ job, event }) => {
        void stream.writeSSE({ event: event ? "event" : "job", data: JSON.stringify(event ? { job: { ...job, events: [] }, event } : job) });
      });
      const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 15000);
      await new Promise<void>((done) =>
        stream.onAbort(() => {
          clearInterval(ping);
          off();
          done();
        }),
      );
    }),
  );

  // Kit previews: snapshot and staging folders, with a local bundle built on first request
  app.get("/kit/:where/:id/*", async (c) => {
    const { where, id } = c.req.param();
    const root = where === "stage" ? join(ctx.state, "stage", id) : snapshotFilesDir(ctx, id);
    const rel = decodeURIComponent(c.req.path.split(`/kit/${where}/${id}/`)[1] ?? "");
    if (rel === "_ds_bundle.js" && !existsSync(join(root, rel))) await buildBundle(root);
    const file = resolveKitFile(root, rel, ctx.config.design.assetFallbacks, ctx.repo);
    if (!file) return c.text("Not found", 404);
    return new Response(readFileSync(file), { headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream" } });
  });

  // The GUI wears Todoi's Minimal look: tokens and fonts from the repo the tool lives in (not the target
  // repo, which in tests and the demo is a throwaway fixture)
  const home = resolve(TOOL_DIR, "../..");
  app.get("/tokens/*", (c) => fileFrom(join(home, "src/client/design/tokens"), c.req.path.slice("/tokens/".length)));
  app.get("/fonts/*", (c) => fileFrom(join(home, "src/client/design/fonts"), c.req.path.slice("/fonts/".length)));
  app.get("/ui/*", (c) => fileFrom(join(TOOL_DIR, "dist"), c.req.path.slice("/ui/".length)));
  app.get("/favicon.svg", () => fileFrom(join(TOOL_DIR, "src/ui"), "favicon.svg"));
  // One page app: the plan at /, the mapping at /mapping
  for (const path of ["/", "/mapping"]) app.get(path, (c) => c.html(readFileSync(join(TOOL_DIR, "src/ui/index.html"), "utf8")));

  return app;
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".map": "application/json" };

function fileFrom(root: string, rel: string): Response {
  const file = resolve(root, decodeURIComponent(rel));
  if (!file.startsWith(resolve(root)) || !existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(readFileSync(file), { headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" } });
}

function summarise(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (o.method) return `${o.method}${o.path ? ` ${o.path}` : ""}${Array.isArray(o.files) ? ` (${o.files.length} files)` : ""}`;
  if (o.file_path) return String(o.file_path);
  if (o.command) return String(o.command).slice(0, 160);
  return JSON.stringify(o).slice(0, 160);
}

function plainDiff(a: string, b: string): string {
  const al = a.split("\n");
  const bl = b.split("\n");
  const bs = new Set(bl);
  const as = new Set(al);
  return [...al.filter((l) => !bs.has(l)).map((l) => `-${l}`), ...bl.filter((l) => !as.has(l)).map((l) => `+${l}`)].join("\n");
}

// Start when run directly (npm run design-sync -- serve)
if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("main.ts")) {
  const ctx = defaultCtx();
  mkdirSync(ctx.state, { recursive: true });
  if (process.env.CDS_FAKE_HARNESS && !process.env.CDS_FAKE_DESIGN) throw new Error("CDS_FAKE_HARNESS needs CDS_FAKE_DESIGN=<folder that plays the Design project>. For a demo world, run npm run design-sync:demo.");
  const fake = process.env.CDS_FAKE_HARNESS ? { designDir: resolve(process.env.CDS_FAKE_DESIGN!) } : undefined;
  await buildUi();
  const port = Number(process.env.CDS_PORT ?? 4477);
  serve({ fetch: createApp(ctx, { fake }).fetch, port, hostname: "127.0.0.1" }, (i) => console.log(`Claude Design Sync → http://localhost:${i.port}`));
}
