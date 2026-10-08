// Claude Design Sync — local server. Binds to 127.0.0.1 only; every POST needs the x-cds header so
// another site in the browser can't trigger runs.
import { serve } from "@hono/node-server";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";

import { canResume, uploadPending } from "../engine/approvals";
import { compare, unitBaseline } from "../engine/compare";
import { directionsFor } from "../engine/directions";
import { defaultCtx, saveConfig, TOOL_DIR, type Ctx } from "../engine/config";
import { checkUpload, createDesignRunner, downloadedAfter, exportCovers, findProject, isCurrent, projectStatus, pullIfChanged, uploadRequest as uploadHandoff, verifyUpload, type Runner } from "../engine/designsync";
import { fakeRunner } from "../engine/fakeHarness";
import { fileWithin, readText } from "../engine/fsutil";
import { reviewDraft } from "../engine/fidelity";
import { plural } from "../engine/words";
import { commitsAfter, diffNoIndex, diffSince, git, head, isDirty, showAt } from "../engine/git";
import { probeHarness, runHarness, type HarnessEvent, type HarnessInfo, type HarnessKind } from "../engine/harness";
import { sections } from "../engine/inventory";
import { laneRules } from "../engine/lanes";
import { parseProjectRef } from "../engine/project";
import { buildBundle, checkCards, resolveKitFile } from "../engine/kit";
import { kitHome, syncTwins, twinPath, writeDrafts } from "../engine/kitDraft";
import { storybook, type Storybook } from "../engine/storybook";
import { visualCompare } from "../engine/visual";
import { commitAll, commitsSince, createWorktree, headOf, mergeRun, removeWorktree, runCheck, verifyPort, verifyResume } from "../engine/worktree";
import { createStage, cssMergeFor, effectiveDirection, fillStage, planSteps, recordSyncPoint, stagedChanges, unitChoicesFor, type Step } from "../engine/plan";
import { deriveSnapshot, findExports, getSnapshot, importExport, latestSnapshot, listSnapshots, listSyncPoints, snapRoot, snapshotFilesDir } from "../engine/snapshots";
import type { Comparison } from "../engine/types";
import { stepsForSelection } from "../engine/selection";
import { Jobs, type Job } from "./jobs";
import { Meter } from "./meter";
import { mappingHistory } from "./mapping";
import { buildUi, distDir } from "./ui-build";
import { comparisonQuery, diffQuery, importRequest, jobParam, kitParam, mappingQuery, mergeRequest, planRequest, projectRequest, pullRequest, runRequest, syncPointRequest, uploadRequest, validate, visualParam, visualRequest, type PlanRequest } from "./requests";

/** Larger than any Claude Design export; refuses a mistaken pick before it fills memory */
const MAX_EXPORT_BYTES = 256 * 1024 * 1024;

export type { HarnessInfo } from "../engine/harness";

export function createApp(ctx: Ctx, opts: { fake?: { designDir: string; delayMs?: number; costUsd?: number; projectId?: string } } = {}) {
  const app = new Hono();
  app.onError((e, c) => c.json({ error: e.message }, e instanceof HTTPException ? e.status : 500));
  const jobs = new Jobs(ctx);
  const meter = new Meter();
  const cache = new Map<string, Comparison>();
  /** The last time Claude Design was asked whether it changed (this server's lifetime) */
  let lastCheck: { at: string; updatedAt: string | null; stale: boolean } | null = null;
  // Where exports are looked for: ~/Downloads, or CDS_EXPORTS (folders separated by ":"); none in a fake run unless set
  const exportDirs = process.env.CDS_EXPORTS ? process.env.CDS_EXPORTS.split(":").filter(Boolean) : opts.fake ? [] : [join(homedir(), "Downloads")];

  // Codex is untested (no working install to test against), so it's only probed when config.json picks it
  let probed: { claude: HarnessInfo; codex?: HarnessInfo } | null = null;
  const harnesses = () =>
    opts.fake ? { claude: { ok: true, version: "fake" } } : (probed ??= { claude: probeHarness(ctx.config.harness.claudeBin), ...(ctx.config.harness.implement === "codex" ? { codex: probeHarness(ctx.config.harness.codexBin) } : {}) });

  /** DesignSync always goes through Claude Code (it's the only harness with the tool); `what` names the call for the bar's flame */
  const designRunner = (what: string, job?: Job): Runner =>
    meter.meter(opts.fake
      ? fakeRunner(opts.fake.designDir, ctx.repo, opts.fake)
      : createDesignRunner(ctx, job ? jobs.signal(job.id) : undefined), what, job?.id);

  /** App ports run in their worktree (`cwd`, reading Design snapshots via addDirs); kit ports in the repo, writing the stage */
  const implementRunner = (kind: HarnessKind, job: Job, what: string, where: { cwd?: string; addDirs?: string[]; stage?: string }): Runner =>
    meter.meter(opts.fake
      ? fakeRunner(opts.fake.designDir, where.cwd ?? ctx.repo, opts.fake)
      : (prompt, _o, on) => runHarness({ kind, bin: kind === "codex" ? ctx.config.harness.codexBin : ctx.config.harness.claudeBin, cwd: where.cwd ?? ctx.repo, prompt: where.stage ? `${prompt}\n\n(Also allowed: files under ${where.stage}.)` : prompt, model: ctx.config.harness.implementModel || undefined, edits: true, maxTurns: 80, addDirs: where.addDirs, signal: jobs.signal(job.id) }, on), what, job.id);

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

  const requestedPlan = (body: PlanRequest) => {
    const cmp = getComparison(body.base, body.snapshot);
    const choices = Object.fromEntries(cmp.features.map((f) => [f.id, effectiveDirection(f, body.global, body.overrides[f.id])]));
    const units = unitChoicesFor(cmp, body.global, body.overrides, body.unitOverrides);
    return { cmp, choices, units, steps: planSteps(ctx, cmp, choices, units) };
  };

  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.header("x-cds") !== "1") return c.json({ error: "Missing x-cds header" }, 403);
    await next();
  });

  app.use("/api/jobs/:id/*", validate("param", jobParam));

  app.get("/api/state", (c) =>
    c.json({
      project: { id: ctx.config.design.projectId, name: ctx.config.design.projectName },
      repo: ctx.repo,
      appHead: head(ctx.repo),
      dirty: isDirty(ctx.repo),
      syncPoints: listSyncPoints(ctx),
      snapshots: listSnapshots(ctx),
      snapshotRoot: snapRoot(ctx),
      harnesses: harnesses(),
      implement: ctx.config.harness.implement,
      check: ctx.config.app.check,
      jobs: jobs.list().slice(0, 20).map(({ events: _e, ...j }) => j),
      fake: !!opts.fake,
    }),
  );

  // The Mapping page: the lane rules from config.json, recent traffic, and how fresh each side's data is
  app.get("/api/mapping", validate("query", mappingQuery), (c) => {
    try {
      const base = baseFor(c.req.valid("query").base);
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

  app.get("/api/compare", validate("query", comparisonQuery), (c) => {
    try {
      const { base, snapshot, fresh } = c.req.valid("query");
      return c.json(getComparison(base, snapshot, fresh === "1"));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.get("/api/diff", validate("query", diffQuery), (c) => {
    const query = c.req.valid("query");
    const cmp = getComparison(query.base, query.snapshot);
    const unit = cmp.units.find((u) => u.id === query.unit);
    if (!unit) return c.json({ error: "Unknown unit" }, 404);
    const side = query.side;
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

  // Pictures of a component on both sides: its Storybook stories and the kit cards that show it, per theme
  app.post("/api/visual", validate("json", visualRequest), async (c) => {
    const body = c.req.valid("json");
    const cmp = getComparison(body.base, body.snapshot);
    const unit = cmp.units.find((u) => u.id === body.unit);
    if (!unit || unit.kind !== "component") return c.json({ error: "Only components can be compared visually" }, 400);
    if (!cmp.designSnapshot) return c.json({ error: "There is no Design snapshot to picture yet: pull first" }, 400);
    try {
      return c.json(await visualCompare(ctx, cmp.designSnapshot.id, unit));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
  app.get("/visual/:key/:file", validate("param", visualParam), (c) => fileFrom(join(ctx.state, "visual", c.req.valid("param").key), c.req.param("file")));

  app.post("/api/plan", validate("json", planRequest), (c) => {
    const { steps, choices, units } = requestedPlan(c.req.valid("json"));
    return c.json({ steps, choices, units });
  });

  // Switch the Claude Design project the tool targets (checked against the account's projects first)
  app.post("/api/project", validate("json", projectRequest), async (c) => {
    const { project } = c.req.valid("json");
    const id = parseProjectRef(project);
    if (!id) return c.json({ error: "Paste a Claude Design project link (https://claude.ai/design/p/…) or its id." }, 400);
    if (id === ctx.config.design.projectId) return c.json({ project: { id, name: ctx.config.design.projectName } });
    if (jobs.running()) return c.json({ error: "A job is running. Switch projects when it has finished." }, 409);
    const waiting = jobs.list().find((j) => j.state === "awaiting-approval" && uploadPending(j));
    if (waiting) return c.json({ error: `“${waiting.title}” is waiting to upload to ${ctx.config.design.projectName}. Upload or discard it first.` }, 409);
    try {
      const found = await findProject(ctx, designRunner("Looking up the Claude Design project"), id);
      if (!found) return c.json({ error: `Claude Design has no project ${id} on this account.` }, 404);
      ctx.config.design.projectId = found.projectId;
      ctx.config.design.projectName = found.name;
      saveConfig(ctx);
      cache.clear();
      lastCheck = null;
      return c.json({ project: { id: found.projectId, name: found.name } });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.post("/api/status-check", async (c) => {
    try {
      const st = await projectStatus(ctx, designRunner("Asking Claude Design whether the project changed"));
      const snap = latestSnapshot(ctx);
      const stale = !!st.updatedAt && !isCurrent(ctx, snap, st.updatedAt) && !exportCovers(ctx, snap, st.updatedAt);
      lastCheck = { at: new Date().toISOString(), updatedAt: st.updatedAt, stale };
      return c.json({ ...st, snapshotUpdatedAt: snap?.projectUpdatedAt ?? null, stale });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.post("/api/pull", validate("json", pullRequest), async (c) => {
    if (jobs.running()) return c.json({ error: "Another job is running" }, 409);
    const { force } = c.req.valid("json");
    const job = jobs.create("pull", "Pull from Claude Design");
    void (async () => {
      try {
        jobs.log(job, "info", "Asking Claude Design whether the project changed since the newest snapshot…");
        const runner = designRunner("Pulling the Design project", job);
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

  /** After an import, the last answer from Claude Design says whether the new snapshot is behind it */
  const imported = (snap: ReturnType<typeof importExport>) => {
    cache.clear();
    const covers = lastCheck?.updatedAt ? exportCovers(ctx, snap, lastCheck.updatedAt) : null;
    if (lastCheck) lastCheck = { ...lastCheck, stale: covers === false };
    return { snapshot: snap, covers };
  };

  app.post("/api/import", validate("json", importRequest), async (c) => {
    const { path, label } = c.req.valid("json");
    try {
      return c.json(imported(importExport(ctx, resolve(path.replace(/^~(?=\/)/, process.env.HOME ?? "~")), label)));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  // An export picked or dropped in the browser: the zip's bytes, its name and its download time
  app.post("/api/import-file", async (c) => {
    const name = (c.req.query("name") ?? "export.zip").replace(/[/\\]/g, "_").slice(0, 200);
    const modified = Number(c.req.query("modified"));
    if (!/\.zip$/i.test(name)) return c.json({ error: "Pick the .zip Claude Design exports. An unzipped folder can be imported by its path." }, 400);
    if (Number(c.req.header("content-length") ?? 0) > MAX_EXPORT_BYTES) return c.json({ error: "That file is larger than any Claude Design export (over 256 MB)." }, 413);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_EXPORT_BYTES) return c.json({ error: bytes.length ? "That file is larger than any Claude Design export (over 256 MB)." : "The file arrived empty." }, 400);
    const dir = join(ctx.state, "incoming");
    const file = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, bytes);
      const at = Number.isFinite(modified) && modified > 0 ? new Date(modified).toISOString() : undefined;
      return c.json(imported(importExport(ctx, file, `Imported ${name}`, at, { name })));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    } finally {
      rmSync(file, { force: true });
    }
  });

  // Exports of this project waiting in Downloads, how they compare with Design's last change, and what a pull cost last time
  app.get("/api/exports", (c) => {
    const updatedAt = lastCheck?.updatedAt ?? null;
    const exports = findExports(ctx, exportDirs).map((x) => ({ ...x, covers: updatedAt ? downloadedAfter(x.modifiedAt, updatedAt) : null }));
    const pull = jobs.list().find((j) => j.kind === "pull" && j.snapshotId && j.state === "done");
    const lastPull = pull ? { at: pull.endedAt ?? pull.startedAt, costUsd: pull.costUsd ?? null, seconds: pull.endedAt ? Math.round((Date.parse(pull.endedAt) - Date.parse(pull.startedAt)) / 1000) : null } : null;
    return c.json({ exports, designUpdatedAt: updatedAt, checkedAt: lastCheck?.at ?? null, lastPull, folders: exportDirs });
  });

  app.post("/api/sync-point", validate("json", syncPointRequest), async (c) => {
    const { label, tag, snapshot, base, hold } = c.req.valid("json");
    try {
      const p = recordSyncPoint(ctx, { label, tag, snapshotId: snapshot ?? latestSnapshot(ctx)?.id ?? null, from: baseFor(base), hold });
      cache.clear();
      return c.json({ syncPoint: p });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  app.post("/api/run", validate("json", runRequest), (c) => {
    if (jobs.running()) return c.json({ error: "Another job is running" }, 409);
    const body = c.req.valid("json");
    const prepared = requestedPlan(body);
    const cmp = prepared.cmp;
    const steps = stepsForSelection(prepared.steps, body.only);
    if (!steps.length) return c.json({ error: "Nothing to do: every feature is skipped or already in sync" }, 400);
    const jobSteps: Job["steps"] = steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, target: s.target, state: "pending" as const }));
    // App work ends with the repo's check on the run's branch, then waits for the developer's merge
    if (steps.some((s) => s.target === "app")) {
      const at = jobSteps.findIndex((s) => s.id === "upload");
      const draft = steps.some((s) => s.kind === "ai-pull");
      jobSteps.splice(at < 0 ? jobSteps.length : at, 0, { id: "app-check", title: `Run ${ctx.config.app.check} on the run's branch`, kind: "check", target: "app", state: "pending" }, { id: "app-merge", title: draft ? "Review the draft against the App's architecture, then merge it into your branch" : "Merge the run's branch into your branch (after your review)", kind: "merge", target: "app", state: "pending" });
    }
    const titles = [...new Set(steps.filter((s) => s.kind !== "upload").map((s) => s.featureTitle))];
    const label = titles.join(", ");
    const job = jobs.create("run", titles.length === 1 ? titles[0]! : `Sync ${plural(titles.length, "feature")}`, { baseId: cmp.base?.id ?? null, snapshotId: cmp.designSnapshot?.id ?? null, steps: jobSteps, covers: [...new Set(steps.flatMap((s) => s.units))], label: label.length > 80 ? `${label.slice(0, 79)}…` : label });
    jobs.savePlan(job, { comparison: cmp, steps, harness: ctx.config.harness.implement });
    void runPlan(job, cmp, steps, ctx.config.harness.implement);
    return c.json({ job: job.id });
  });

  app.post("/api/jobs/:id/resume", (c) => {
    if (jobs.running()) return c.json({ error: "Another job is running" }, 409);
    const job = jobs.get(c.req.param("id"));
    if (!job || !canResume(job)) return c.json({ error: "This run has no failed App-only plan to resume" }, 400);
    try {
      verifyResume(job.app!);
      let plan = jobs.plan(job);
      if (!plan) {
        // Older runs stored step ids and coverage but not briefs. Recover only the exact original steps.
        if (!job.snapshotId || !getSnapshot(ctx, job.snapshotId)) throw new Error("The original Design snapshot is missing. Start a new run.");
        const base = baseFor(job.baseId);
        if (!base || base.id !== job.baseId || !job.covers) throw new Error("The original sync point or selected parts are missing. Start a new run.");
        const comparison = getComparison(job.baseId, job.snapshotId, true);
        const units = Object.fromEntries(comparison.units.map((u) => [u.id, job.covers!.includes(u.id) ? "design-to-app" as const : "skip" as const]));
        const choices = Object.fromEntries(comparison.features.map((f) => [f.id, "design-to-app" as const]));
        const planned = planSteps(ctx, comparison, choices, units);
        const original = job.steps.filter((s) => s.kind === "ai-pull" || s.kind === "merge-css");
        const steps = original.map((s) => planned.find((p) => p.id === s.id));
        if (steps.some((s) => !s) || !steps.length) throw new Error("The original plan can no longer be reconstructed exactly. Start a new run.");
        const recovered = steps as Step[];
        const covered = new Set(recovered.flatMap((s) => s.units));
        if (covered.size !== job.covers.length || job.covers.some((id) => !covered.has(id))) throw new Error("The original selected parts changed. Start a new run.");
        plan = { comparison, steps: recovered, harness: ctx.config.harness.implement };
        jobs.savePlan(job, plan);
      }
      if (plan.steps.some((s) => s.target !== "app")) throw new Error("Mixed App and Design runs cannot be resumed yet. Start a new run.");
      jobs.resume(job);
      jobs.log(job, "info", "Resuming the saved App branch: completed steps are kept; unfinished steps and the final check run again.");
      void runPlan(job, plan.comparison, plan.steps, plan.harness);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 409);
    }
  });

  /** A job ends only when nothing waits on the developer: no upload to approve, no verified branch to merge */
  const settle = (job: Job, note: string, failed = false) => jobs.finish(job, uploadPending(job) || job.app?.state === "ready" ? "awaiting-approval" : failed ? "failed" : "done", note);

  /**
   * A run whose upload read back intact and whose App branch merged has synced what it planned, so it
   * records the sync point itself. Parts it didn't move (skipped, or changed since) stay open on their
   * old baseline, as in the Mark synced dialog. Returns the sentence that tells the developer what happened.
   */
  const markRunSynced = (job: Job): string => {
    const latest = baseFor();
    // runs started before runs recorded what they cover can't say which parts stay open
    if (!job.covers) return " Use “Mark selected features synced” when both sides look right.";
    if (!latest || latest.id !== job.baseId) return latest ? " A newer sync point was recorded meanwhile, so this run didn't record one: use “Mark selected features synced” if both sides look right." : " Use “Mark selected features synced” to record the first sync point.";
    // a staged file left out of the upload never reached Design: the parts it carries stay open too
    const left = new Set((job.staged ?? []).filter((s) => !job.handoff?.paths.includes(s.path)).map((s) => s.path));
    const covered = new Set(job.covers ?? []);
    const cmp = getComparison(job.baseId, null, true);
    const hold = cmp.units.filter((u) => (!covered.has(u.id) || u.design.paths.some((p) => left.has(p))) && directionsFor(u.status, u.kind).directions.some((d) => d !== "skip")).map((u) => u.id);
    try {
      const point = recordSyncPoint(ctx, { label: job.label || job.title, snapshotId: latestSnapshot(ctx)?.id ?? null, from: latest, hold });
      cache.clear();
      jobs.update(job, { syncPointId: point.id });
      const open = cmp.features.filter((f) => f.units.some((u) => hold.includes(u.id))).length;
      jobs.log(job, "done", `Marked synced: comparisons now start from “${point.label}”${open ? `; ${open} feature(s) stay open` : ""}`);
      return ` Marked synced: comparisons now start here${open ? `, and ${open} feature(s) this run didn't finish stay open` : ""}.${left.size ? ` ${[...left].join(", ")} stayed out of the upload, so ${left.size === 1 ? "its feature stays" : "their features stay"} open.` : ""}`;
    } catch (e) {
      return ` Couldn't mark it synced (${e instanceof Error ? e.message : String(e)}): use “Mark selected features synced”.`;
    }
  };

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
    try {
      const stage = steps.some((s) => s.target === "design") ? createStage(ctx, cmp, job.id) : undefined;
      if (stage) jobs.update(job, { stage });
      // briefs point at files in the newest snapshot, each part's baseline snapshot, and spec sections: let the harness read them
      const readable = [snapRoot(ctx), join(ctx.state, "sections")];
      for (const d of readable) mkdirSync(d, { recursive: true });
      // App work never touches the developer's checkout: a worktree on its own branch, merged on approval
      const run = steps.some((s) => s.target === "app") ? job.app ?? createWorktree(ctx, job.id) : undefined;
      if (run) {
        jobs.update(job, { app: run });
        jobs.log(job, "info", `App work runs on ${run.branch}, a separate worktree from ${run.base.slice(0, 7)} on ${run.into}. Your checkout isn't touched until you merge. (${run.worktree})`);
      }
      let sb: Storybook | null | undefined;
      /** What the tool drafted per component (the .jsx it is for, and each file's drafted text) */
      const drafts: Array<{ jsx: string; files: Record<string, string> }> = [];
      for (const s of steps) {
        if (jobs.signal(job.id)?.aborted) {
          keepAppRun(job, "Stopped by you");
          return;
        }
        if (s.kind === "upload" || job.steps.find((step) => step.id === s.id)?.state === "done") continue;
        jobs.step(job, s.id, { state: "running" });
        jobs.log(job, "step", s.title, s.id);
        if (s.kind === "merge-css") {
          const unit = cmp.units.find((u) => u.id === s.units[0])!;
          const { text, summary } = cssMergeFor(ctx, cmp, unit, s.target);
          const dest = s.target === "app" ? join(run!.worktree, unit.app.paths[0]!) : join(stage!, unit.design.paths[0]!);
          writeFileSync(dest, text);
          if (s.target === "app") {
            commitAll(run!, `style(tokens): merge Claude Design's ${unit.name} rules`);
            run!.checkpoint = headOf(run!);
          }
          jobs.step(job, s.id, { state: "done", summary });
          jobs.log(job, "info", summary, s.id);
          continue;
        }
        if (s.target === "app") {
          const before = headOf(run!);
          const brief = `You are working in ${run!.worktree}, a git worktree of ${ctx.repo} on branch ${run!.branch}. Make every change there and commit actual edits there, or report that all selected parts are already implemented; never edit ${ctx.repo} itself.\n\n${(s.brief ?? "").replaceAll(`in this repository (${ctx.repo})`, `in this worktree (${run!.worktree})`)}`;
          const done = await implementRunner(harness, job, `Drafting “${s.featureTitle}” into the App`, { cwd: run!.worktree, addDirs: readable })(brief, {}, logHarness(job, s.id));
          if (jobs.signal(job.id)?.aborted) { keepAppRun(job, "Stopped by you"); return; }
          if (!done.ok) {
            jobs.step(job, s.id, { state: "failed", summary: done.result.slice(0, 600) });
            throw new Error(`${s.title}: ${done.result || "the harness reported a failure"}`);
          }
          // The harness must commit edits or explicitly account for every already-implemented unit.
          const v = verifyPort(run!, before, { result: done.result, units: s.units });
          if (!v.ok) {
            jobs.step(job, s.id, { state: "failed", summary: v.reason });
            throw new Error(`${s.title}: ${v.reason}`);
          }
          run!.checkpoint = headOf(run!);
          const summary = v.alreadyImplemented ? "Already implemented: no App changes needed" : v.commits.map((c) => `${c.hash} ${c.subject}`).join(" · ");
          jobs.step(job, s.id, { state: "done", summary, alreadyImplemented: v.alreadyImplemented });
          if (v.alreadyImplemented) jobs.log(job, "info", summary, s.id);
          continue;
        }
        // the mechanical kit files come from the App's Storybook, written before the AI refines them
        const pushed = cmp.units.filter((u) => s.units.includes(u.id));
        if (stage && pushed.some((u) => u.kind === "component")) {
          sb ??= await storybook(ctx, jobs.signal(job.id)).catch((e: Error) => {
            jobs.log(job, "warn", `${e.message}. Nothing was drafted from Storybook; the AI writes those files.`, s.id);
            return null;
          });
          if (sb) for (const u of pushed) {
            const files = writeDrafts(ctx, sb, u, stage);
            if (files.length) drafts.push({ jsx: `${kitHome(ctx, u).dir}/${kitHome(ctx, u).name}.jsx`, files: Object.fromEntries(files.map((p) => [p, readText(join(stage, p)) ?? ""])) });
            for (const p of files) {
              jobs.update(job, { origin: { ...job.origin, [p]: "storybook" } });
              jobs.log(job, "info", `Drafted ${p} from Storybook`, s.id);
            }
          }
        }
        const done = await implementRunner("claude", job, `Porting “${s.featureTitle}” into the kit`, { stage, addDirs: [...readable, ...(stage ? [stage] : [])] })(fillStage(s.brief ?? "", stage ?? "(no staging folder)"), {}, logHarness(job, s.id));
        jobs.step(job, s.id, { state: done.ok ? "done" : "failed", summary: done.result.slice(0, 600) });
        if (!done.ok) throw new Error(`${s.title}: ${done.result || "the harness reported a failure"}`);
      }
      const notes: string[] = [];
      if (run) {
        run.commits = commitsSince(run);
        jobs.step(job, "app-check", { state: "running" });
        jobs.log(job, "step", `Running ${ctx.config.app.check} on ${run.branch}…`, "app-check");
        const check = await runCheck(run, ctx.config.app.check, jobs.signal(job.id));
        if (jobs.signal(job.id)?.aborted) { keepAppRun(job, "Stopped by you"); return; }
        run.check = check;
        jobs.log(job, check.ok ? "info" : "error", check.output.trim().split("\n").slice(-12).join("\n") || "(no output)", "app-check");
        if (!check.ok) {
          jobs.step(job, "app-check", { state: "failed", summary: `${check.command} failed` });
          throw new Error(`${check.command} failed on ${run.branch}, so it can't be merged. The branch is kept for a look; Discard removes it.`);
        }
        jobs.step(job, "app-check", { state: "done", summary: `${check.command} passed` });
        // a port from the kit is a draft: the check can't see a lost Base UI primitive or a whole-store
        // subscription, so the branch is scanned for those and waits for the developer's review
        if (steps.some((s) => s.kind === "ai-pull")) {
          run.review = { findings: reviewDraft(run.worktree, run.base, "HEAD") };
          for (const f of run.review.findings) jobs.log(job, "warn", `${f.file}: ${f.detail}`, "app-merge");
        }
        run.state = "ready";
        const flagged = run.review?.findings.length;
        jobs.step(job, "app-merge", { state: "pending", summary: run.review ? `Draft: ${plural(run.commits.length, "commit")} to review${flagged ? `, ${plural(flagged, "architecture finding")}` : ""}` : `${plural(run.commits.length, "commit")} waiting for your merge` });
        notes.push(run.review ? `${plural(run.commits.length, "drafted App commit")} passed ${check.command}${flagged ? ` with ${plural(flagged, "architecture finding")}` : ""}: review, then merge` : `${plural(run.commits.length, "App commit")} passed ${check.command}: review and merge`);
      }
      cache.clear();
      if (stage) {
        // Minimal twins are the tool's: each changed card's edit is replayed onto its twin
        const snapDir = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
        const twins = syncTwins(stage, stagedChanges(ctx, cmp, stage).map((x) => x.path), (p) => (snapDir ? readText(join(snapDir, p)) : null));
        for (const t of twins.written) {
          jobs.update(job, { origin: { ...job.origin, [t]: job.origin?.[t] ?? "twin" } });
          jobs.log(job, "info", `Minimal twin ${t} follows its card`);
        }
        const fileNotes: Record<string, string> = {};
        const holdBack = new Set<string>();
        for (const t of twins.conflicts) {
          const card = t.replace(/-minimal\.card\.html$/, ".card.html");
          fileNotes[card] = "Its Minimal twin couldn't follow: your edit overlaps the twin's own Minimal changes. Update the twin by hand, or upload the card alone.";
          jobs.log(job, "warn", `${t}: the card's edit overlaps the twin's own Minimal changes, so the twin was left as it was. Update it by hand before uploading.`);
        }
        // drafts the AI changed are its refinements now; drafts for a component it never wrote stay back
        for (const d of drafts) {
          for (const [p, text] of Object.entries(d.files)) if (readText(join(stage, p)) !== text) jobs.update(job, { origin: { ...job.origin, [p]: "storybook-refined" } });
          if (existsSync(join(stage, d.jsx))) continue;
          for (const p of [...Object.keys(d.files), ...Object.keys(d.files).filter((f) => f.endsWith(".card.html")).map(twinPath)]) {
            holdBack.add(p);
            fileNotes[p] = `${d.jsx.split("/").pop()} wasn't written, so this would describe a component Design doesn't have. Left out.`;
          }
        }
        const staged = stagedChanges(ctx, cmp, stage);
        const cards = staged.map((x) => x.path).filter((p) => /\.html$/.test(p) && p.startsWith("components/"));
        let checked: Array<{ card: string; errors: string[] }> = [];
        if (cards.length) {
          jobs.log(job, "step", `Rendering ${cards.length} staged preview card(s) with a local bundle…`);
          await buildBundle(stage);
          checked = (await checkCards(stage, cards, undefined, { fallbacks: ctx.config.design.assetFallbacks, repo: ctx.repo })).map(({ card, errors }) => ({ card, errors }));
          for (const r of checked) jobs.log(job, r.errors.length ? "warn" : "info", r.errors.length ? `${r.card}: ${r.errors.join(" · ")}` : `${r.card} renders cleanly`);
        }
        // a card that renders with errors (and its twin) waits unticked: Claude Design would show the errors
        for (const r of checked) {
          if (!r.errors.length || holdBack.has(r.card)) continue;
          for (const p of [r.card, /-minimal\.card\.html$/.test(r.card) ? r.card.replace(/-minimal\.card\.html$/, ".card.html") : twinPath(r.card)]) {
            if (!staged.some((x) => x.path === p)) continue;
            holdBack.add(p);
            fileNotes[p] ??= p === r.card ? `Renders with ${plural(r.errors.length, "error")}, so it's left out: Claude Design would show them. Tick it to upload anyway.` : "Left out with its card, which renders with errors.";
          }
        }
        jobs.update(job, { staged, cards: checked, fileNotes, holdBack: [...holdBack] });
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

  app.post("/api/jobs/:id/upload", validate("json", uploadRequest), (c) => {
    const job = jobs.get(c.req.param("id"));
    if (!job || job.state !== "awaiting-approval" || !job.stage || !uploadPending(job)) return c.json({ error: "This run has nothing waiting for upload" }, 400);
    const { paths } = c.req.valid("json");
    const allowed = new Set((job.staged ?? []).map((s) => s.path));
    const files = paths.filter((p) => allowed.has(p));
    if (!files.length) return c.json({ error: "Pick at least one staged file" }, 400);
    const gone = files.filter((p) => !existsSync(join(job.stage!, p)));
    if (gone.length) return c.json({ error: `The staged copy of ${gone.join(", ")} is missing, so it can't be uploaded. Discard the run and run the feature again` }, 409);
    // Claude Code calls this URL once the files are written, so the tool checks the upload by itself
    const notify = new URL(`/api/jobs/${job.id}/upload-check`, c.req.url).href;
    job.state = "running";
    jobs.update(job, { handoff: undefined });
    jobs.step(job, "upload", { state: "running" });
    void (async () => {
      try {
        const runner = designRunner("Checking the upload against Claude Design", job);
        const from = job.snapshotId ? getSnapshot(ctx, job.snapshotId) : latestSnapshot(ctx);
        jobs.log(job, "step", "Checking Claude Design for edits made since this run's snapshot…", "upload");
        const check = await checkUpload(ctx, runner, { stageDir: job.stage!, baseDir: from ? snapshotFilesDir(ctx, from.id) : null, baseUpdatedAt: from?.projectUpdatedAt, paths: files, onLog: logHarness(job, "upload") });
        const conflict = new Map(check.conflicts.map((x) => [x.path, x.reason]));
        // files left out of this check keep what an earlier check said about them
        jobs.update(job, { staged: job.staged!.map((s) => (conflict.has(s.path) ? { ...s, conflict: conflict.get(s.path) } : files.includes(s.path) ? { path: s.path, status: s.status } : s)) });
        if (check.fresh) jobs.log(job, "info", "Claude Design hasn't changed since the snapshot", "upload");
        for (const p of check.merged) jobs.log(job, "info", `${p}: merged Claude Design's newer edits into the staged copy`, "upload");
        if (conflict.size) {
          for (const x of check.conflicts) jobs.log(job, "warn", `${x.path}: ${x.reason}`, "upload");
          jobs.step(job, "upload", { state: "pending", summary: `${conflict.size} file(s) would overwrite newer Design work` });
          jobs.finish(job, "awaiting-approval", `Nothing uploaded: Claude Design changed ${conflict.size === 1 ? "a file" : `${conflict.size} files`} since this run's snapshot. Untick ${conflict.size === 1 ? "it" : "them"} to upload the rest, or pull and run the feature again.`);
          return;
        }
        // DesignSync's plan prompt needs the developer, so the upload itself runs in Claude Code
        const { prompt, command } = uploadHandoff(ctx, job.stage!, files, notify);
        jobs.update(job, { handoff: { paths: files, prompt, command, fresh: check.fresh, at: new Date().toISOString() } });
        jobs.step(job, "upload", { state: "pending", summary: `${files.length} file(s) ready for Claude Code` });
        jobs.finish(job, "awaiting-approval", `Ready to upload ${files.length} file(s): follow the steps under “Upload to Claude Design”.`);
      } catch (e) {
        jobs.step(job, "upload", { state: "failed", summary: "Couldn't check Claude Design; the staged files are kept" });
        jobs.finish(job, "awaiting-approval", `Couldn't prepare the upload: ${e instanceof Error ? e.message : String(e)}. Try again, or discard the run.`);
      }
    })();
    return c.json({ ok: true });
  });

  // After the upload ran in Claude Code (its request calls this, or the developer clicks Check the upload):
  // read every file back; the step closes once all match
  app.post("/api/jobs/:id/upload-check", (c) => {
    const job = jobs.get(c.req.param("id"));
    const h = job?.handoff;
    if (!job || !h || job.state !== "awaiting-approval" || !job.stage || !uploadPending(job)) return c.json({ error: "This run has no upload waiting to be checked" }, 400);
    job.state = "running";
    jobs.step(job, "upload", { state: "running" });
    void (async () => {
      try {
        const runner = designRunner("Reading the upload back from Claude Design", job);
        jobs.log(job, "step", `Reading the ${h.paths.length} file(s) back from Claude Design…`, "upload");
        const { contents, differ } = await verifyUpload(ctx, runner, job.stage!, h.paths, logHarness(job, "upload"));
        if (differ.length) {
          for (const p of differ) jobs.log(job, "warn", `${p}: ${contents.has(p) ? "Claude Design doesn't hold the staged content (yet)" : "not in Claude Design (yet)"}`, "upload");
          const none = differ.length === h.paths.length;
          jobs.step(job, "upload", { state: "pending", summary: none ? "Not in Claude Design yet" : `${differ.length} of ${h.paths.length} file(s) don't match yet` });
          jobs.finish(job, "awaiting-approval", none ? `None of the ${h.paths.length} file(s) are in Claude Design yet. Run the request in Claude Code (steps 1–3), then check again.` : `${differ.length} of ${h.paths.length} file(s) don't match the staged copy: ${differ.join(", ")}. Finish the upload in Claude Code, or pull to see what Claude Design holds.`);
          return;
        }
        // The snapshot keeps what Design holds now. It is Design's exact state only when nothing else moved
        // before the files were checked and everything read back intact; then it takes Design's updatedAt
        // now, so "Check for changes" doesn't ask for a pull it doesn't need.
        const from = job.snapshotId ? getSnapshot(ctx, job.snapshotId) : latestSnapshot(ctx);
        const changes = Object.fromEntries(h.paths.map((p) => [p, contents.get(p)!]));
        const after = h.fresh ? await projectStatus(ctx, runner, logHarness(job, "upload")).catch(() => null) : null;
        if (from) deriveSnapshot(ctx, from.id, changes, `After upload (${h.paths.length} files)`, "upload", after?.updatedAt ?? undefined);
        cache.clear();
        jobs.step(job, "upload", { state: "done", summary: `${h.paths.length} file(s) in Claude Design, read back intact` });
        const uploaded = `Uploaded ${h.paths.length} file(s) to Claude Design, all read back intact.${h.fresh ? "" : " Claude Design also changed elsewhere since this run's snapshot: Pull now to compare those changes."}`;
        settle(job, `${uploaded}${job.app?.state === "ready" ? " Merge the App branch to finish; the run is marked synced then." : markRunSynced(job)}`);
      } catch (e) {
        jobs.step(job, "upload", { state: "pending", summary: "Couldn't read Claude Design; check again" });
        jobs.finish(job, "awaiting-approval", `Couldn't check the upload: ${e instanceof Error ? e.message : String(e)}. Check again.`);
      }
    })();
    return c.json({ ok: true });
  });

  // Bring a verified App branch into the developer's branch; conflicts leave everything as it was
  app.post("/api/jobs/:id/merge", validate("json", mergeRequest), (c) => {
    const job = jobs.get(c.req.param("id"));
    const run = job?.app;
    if (!job || !run || run.state !== "ready") return c.json({ error: "This run has no verified App branch waiting to merge" }, 400);
    if (run.review && !c.req.valid("json").reviewed) return c.json({ error: `This run is a draft ported from the kit, so it merges only after your review: confirm you checked ${run.review.findings.length ? `its ${plural(run.review.findings.length, "architecture finding")} and ` : ""}Base UI, refs, store selectors and accessibility.` }, 409);
    try {
      if (run.review) run.review.reviewedAt = new Date().toISOString();
      const how = mergeRun(ctx, run);
      removeWorktree(ctx, run, true);
      run.state = "merged";
      cache.clear();
      const summary = `${run.commits.length} commit(s) merged into ${run.into} (${how === "fast-forward" ? "fast-forward" : "merge commit"})`;
      jobs.step(job, "app-merge", { state: "done", summary });
      jobs.log(job, "info", `${summary}; ${run.branch} and its worktree removed`, "app-merge");
      settle(job, `${summary}.${uploadPending(job) ? " Upload the kit files to finish; the run is marked synced then." : markRunSynced(job)}`);
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

  // The bar's flame polls this: the Claude Code calls running now and what finished ones cost
  app.get("/api/meter", (c) => c.json(meter.state()));

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
  app.get("/kit/:where/:id/*", validate("param", kitParam), async (c) => {
    const { where, id } = c.req.valid("param");
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
  app.get("/ui/*", (c) => fileFrom(distDir(), c.req.path.slice("/ui/".length)));
  app.get("/favicon.svg", () => fileFrom(join(TOOL_DIR, "src/ui"), "favicon.svg"));
  // One page app: the plan at /, the mapping at /mapping, the guide at /guide
  for (const path of ["/", "/mapping", "/guide"]) app.get(path, (c) => c.html(readFileSync(join(TOOL_DIR, "src/ui/index.html"), "utf8")));

  return app;
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".map": "application/json" };

function fileFrom(root: string, rel: string): Response {
  const file = fileWithin(root, decodeURIComponent(rel));
  if (!file) return new Response("Not found", { status: 404 });
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
  const fake = process.env.CDS_FAKE_HARNESS ? { designDir: resolve(process.env.CDS_FAKE_DESIGN!), ...(process.env.CDS_FAKE_PROJECT ? { projectId: process.env.CDS_FAKE_PROJECT } : {}) } : undefined;
  await buildUi();
  const port = Number(process.env.CDS_PORT ?? 4477);
  serve({ fetch: createApp(ctx, { fake }).fetch, port, hostname: "127.0.0.1" }, (i) => console.log(`Claude Design Sync → http://localhost:${i.port}`));
}
