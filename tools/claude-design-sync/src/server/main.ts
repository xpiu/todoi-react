// Claude Design Sync — local server. Binds to 127.0.0.1 only; every POST needs the x-cds header so
// another site in the browser can't trigger runs.
import { serve } from "@hono/node-server";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { compare } from "../engine/compare";
import { defaultCtx, TOOL_DIR, type Ctx } from "../engine/config";
import { projectStatus, pullSnapshot, pushFiles, type Runner } from "../engine/designsync";
import { fakeRunner } from "../engine/fakeHarness";
import { readText } from "../engine/fsutil";
import { diffNoIndex, diffSince, head, isDirty, showAt } from "../engine/git";
import { runHarness, type HarnessEvent, type HarnessKind } from "../engine/harness";
import { sections } from "../engine/inventory";
import { buildBundle, checkCards, resolveKitFile } from "../engine/kit";
import { createStage, cssMergeFor, effectiveDirection, fillStage, planSteps, recordSyncPoint, stagedChanges, unitChoicesFor, type Step } from "../engine/plan";
import { deriveSnapshot, getSnapshot, importExport, latestSnapshot, listSnapshots, listSyncPoints, snapshotFilesDir } from "../engine/snapshots";
import type { Comparison, Direction } from "../engine/types";
import { Jobs, type Job } from "./jobs";
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

  /** Is the harness on PATH, and does it actually start? (A broken install is worse than a missing one.) */
  const probe = (bin: string): HarnessInfo => {
    try {
      const path = execFileSync("/bin/sh", ["-lc", `command -v ${bin}`], { encoding: "utf8" }).trim();
      if (!path) return { ok: false, error: `${bin} isn't on PATH` };
      try {
        const version = execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0];
        return { ok: true, path, version };
      } catch (e) {
        const msg = String((e as { stderr?: string }).stderr ?? (e as Error).message).split("\n").find((l) => /error/i.test(l)) ?? "it exits with an error";
        return { ok: false, path, error: `${bin} is installed but doesn't start — ${msg.replace(/^.*Error:\s*/, "").trim()}` };
      }
    } catch {
      return { ok: false, error: `${bin} isn't on PATH` };
    }
  };
  let probed: { claude: HarnessInfo; codex: HarnessInfo } | null = null;
  const harnesses = () => (opts.fake ? { claude: { ok: true, version: "fake" }, codex: { ok: true, version: "fake" } } : (probed ??= { claude: probe(ctx.config.harness.claudeBin), codex: probe(ctx.config.harness.codexBin) }));

  /** DesignSync always goes through Claude Code (it's the only harness with the tool) */
  const designRunner = (job?: Job): Runner =>
    opts.fake
      ? fakeRunner(opts.fake.designDir, ctx.repo)
      : (prompt, o, on) => runHarness({ kind: "claude", bin: ctx.config.harness.claudeBin, cwd: ctx.repo, prompt, model: o.model, maxTurns: o.maxTurns, allowedTools: ["DesignSync", "ToolSearch"], signal: job ? jobs.signal(job.id) : undefined }, on);

  const implementRunner = (kind: HarnessKind, job: Job, stage?: string): Runner =>
    opts.fake
      ? fakeRunner(opts.fake.designDir, ctx.repo)
      : (prompt, _o, on) => runHarness({ kind, bin: kind === "codex" ? ctx.config.harness.codexBin : ctx.config.harness.claudeBin, cwd: ctx.repo, prompt: stage ? `${prompt}\n\n(Also allowed: files under ${stage}.)` : prompt, model: ctx.config.harness.implementModel || undefined, edits: true, maxTurns: 80, signal: jobs.signal(job.id) }, on);

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
      jobs: jobs.list().slice(0, 20).map(({ events: _e, ...j }) => j),
      fake: !!opts.fake,
    }),
  );

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
    if (side === "app") {
      if (unit.kind === "spec") {
        const now = sections(readText(join(ctx.repo, unit.app.paths[0] ?? ""))).get(unit.name) ?? "";
        const was = cmp.base ? sections(showAt(ctx.repo, cmp.base.rev, unit.app.paths[0] ?? "")).get(unit.name) ?? "" : "";
        return c.json({ text: plainDiff(was, now) });
      }
      return c.json({ text: cmp.base ? diffSince(ctx.repo, cmp.base.rev, unit.app.paths) : "" });
    }
    const snap = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
    const baseSnap = cmp.base?.designSnapshot ? snapshotFilesDir(ctx, cmp.base.designSnapshot) : null;
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

  app.post("/api/status-check", async (c) => {
    try {
      const st = await projectStatus(ctx, designRunner());
      const snap = latestSnapshot(ctx);
      return c.json({ ...st, snapshotUpdatedAt: snap?.projectUpdatedAt ?? null, stale: !!st.updatedAt && st.updatedAt !== snap?.projectUpdatedAt });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.post("/api/pull", (c) => {
    if (jobs.running()) return c.json({ error: "Another job is running" }, 409);
    const job = jobs.create("pull", "Pull from Claude Design");
    void (async () => {
      try {
        jobs.log(job, "info", "Asking Claude Design for the project's status and file list…");
        const runner = designRunner(job);
        const st = await projectStatus(ctx, runner, logHarness(job));
        const snap = await pullSnapshot(ctx, runner, { updatedAt: st.updatedAt, label: `Pulled ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, onProgress: (p) => jobs.update(job, { progress: { done: p.done, total: p.total } }), onLog: (e) => e.type === "tool" && jobs.log(job, "tool", `${e.name} ${summarise(e.input)}`) });
        cache.clear();
        jobs.update(job, { snapshotId: snap.id });
        jobs.finish(job, "done", `Snapshot ready: ${snap.fileCount} files`);
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
    const { label, tag, snapshot } = await c.req.json<{ label: string; tag?: boolean; snapshot?: string }>();
    try {
      const p = recordSyncPoint(ctx, { label, tag, snapshotId: snapshot ?? latestSnapshot(ctx)?.id ?? null });
      cache.clear();
      return c.json({ syncPoint: p });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  app.post("/api/run", async (c) => {
    if (jobs.running()) return c.json({ error: "Another job is running" }, 409);
    const body = await c.req.json<{ base?: string; snapshot?: string; global: Direction; overrides: Record<string, Direction>; unitOverrides?: Record<string, Direction>; harness?: HarnessKind; only?: string[] }>();
    const cmp = getComparison(body.base, body.snapshot);
    const choices = Object.fromEntries(cmp.features.map((f) => [f.id, effectiveDirection(f, body.global, body.overrides[f.id])]));
    let steps = planSteps(ctx, cmp, choices, unitChoicesFor(cmp, body.global, body.overrides, body.unitOverrides));
    if (body.only?.length) steps = steps.filter((s) => body.only!.includes(s.id) || (s.kind === "upload" && steps.some((x) => body.only!.includes(x.id) && x.target === "design")));
    if (!steps.length) return c.json({ error: "Nothing to do: every feature is skipped or already in sync" }, 400);
    const job = jobs.create("run", `Sync ${new Set(steps.map((s) => s.featureId)).size - (steps.some((s) => s.kind === "upload") ? 1 : 0)} feature(s)`, { baseId: cmp.base?.id ?? null, snapshotId: cmp.designSnapshot?.id ?? null, steps: steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, target: s.target, state: "pending" as const })) });
    void runPlan(job, cmp, steps, body.harness ?? ctx.config.harness.implement);
    return c.json({ job: job.id });
  });

  async function runPlan(job: Job, cmp: Comparison, steps: Step[], harness: HarnessKind) {
    const stage = steps.some((s) => s.target === "design") ? createStage(ctx, cmp, job.id) : undefined;
    if (stage) jobs.update(job, { stage });
    try {
      for (const s of steps) {
        if (jobs.signal(job.id)?.aborted) return;
        if (s.kind === "upload") continue;
        jobs.step(job, s.id, { state: "running" });
        jobs.log(job, "step", s.title, s.id);
        if (s.kind === "merge-css") {
          const unit = cmp.units.find((u) => u.id === s.units[0])!;
          const { text, summary } = cssMergeFor(ctx, cmp, unit, s.target);
          const dest = s.target === "app" ? join(ctx.repo, unit.app.paths[0]!) : join(stage!, unit.design.paths[0]!);
          writeFileSync(dest, text);
          jobs.step(job, s.id, { state: "done", summary });
          jobs.log(job, "info", summary, s.id);
          continue;
        }
        const brief = fillStage(s.brief ?? "", stage ?? "(no staging folder)");
        const done = await implementRunner(s.target === "design" ? "claude" : harness, job, stage)(brief, {}, logHarness(job, s.id));
        jobs.step(job, s.id, { state: done.ok ? "done" : "failed", summary: done.result.slice(0, 600) });
        if (!done.ok) throw new Error(`${s.title}: ${done.result || "the harness reported a failure"}`);
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
          jobs.finish(job, "awaiting-upload", `${staged.length} kit file(s) staged — review and approve the upload`);
          return;
        }
        jobs.step(job, "upload", { state: "skipped", summary: "No kit files changed" });
      }
      jobs.finish(job, "done", "All steps finished");
    } catch (e) {
      jobs.finish(job, "failed", e instanceof Error ? e.message : String(e));
    }
  }

  app.post("/api/jobs/:id/upload", async (c) => {
    const job = jobs.get(c.req.param("id"));
    if (!job || job.state !== "awaiting-upload" || !job.stage) return c.json({ error: "This run has nothing waiting for upload" }, 400);
    const { paths } = await c.req.json<{ paths: string[] }>();
    const allowed = new Set((job.staged ?? []).map((s) => s.path));
    const files = paths.filter((p) => allowed.has(p));
    if (!files.length) return c.json({ error: "Pick at least one staged file" }, 400);
    job.state = "running";
    jobs.step(job, "upload", { state: "running" });
    jobs.log(job, "step", `Uploading ${files.length} file(s) to ${ctx.config.design.projectName}…`, "upload");
    void (async () => {
      try {
        const res = await pushFiles(ctx, designRunner(job), job.stage!, files, logHarness(job, "upload"));
        const changes = Object.fromEntries(files.map((p) => [p, readFileSync(join(job.stage!, p), "utf8")]));
        const from = job.snapshotId ?? latestSnapshot(ctx)?.id;
        if (from) deriveSnapshot(ctx, from, changes, `After upload (${res.written} files)`, "upload");
        cache.clear();
        jobs.step(job, "upload", { state: "done", summary: `${res.written} file(s) written${res.planId ? ` · plan ${res.planId}` : ""}` });
        jobs.finish(job, "done", `Uploaded ${res.written} file(s) to Claude Design`);
      } catch (e) {
        jobs.step(job, "upload", { state: "failed" });
        jobs.finish(job, "failed", e instanceof Error ? e.message : String(e));
      }
    })();
    return c.json({ ok: true });
  });

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

  // The GUI and the App's own tokens/fonts (the tool wears Todoi's Minimal look)
  app.get("/tokens/*", (c) => fileFrom(join(ctx.repo, "src/client/design/tokens"), c.req.path.slice("/tokens/".length)));
  app.get("/fonts/*", (c) => fileFrom(join(ctx.repo, "src/client/design/fonts"), c.req.path.slice("/fonts/".length)));
  app.get("/ui/*", (c) => fileFrom(join(TOOL_DIR, "dist"), c.req.path.slice("/ui/".length)));
  app.get("/", (c) => c.html(readFileSync(join(TOOL_DIR, "src/ui/index.html"), "utf8")));

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
  const fake = process.env.CDS_FAKE_HARNESS ? { designDir: resolve(process.env.CDS_FAKE_DESIGN ?? join(TOOL_DIR, "test/fixtures/design")) } : undefined;
  await buildUi();
  const port = Number(process.env.CDS_PORT ?? 4477);
  serve({ fetch: createApp(ctx, { fake }).fetch, port, hostname: "127.0.0.1" }, (i) => console.log(`Claude Design Sync → http://localhost:${i.port}`));
}
