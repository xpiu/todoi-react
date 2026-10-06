// Talking to Claude Design through Claude Code's DesignSync tool, run headless. File contents come
// back as tool results in the event stream (or a file Claude Code saved them to), never through
// the model's own reply, so a pull costs little more than the calls themselves.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Ctx } from "./config";
import { readText } from "./fsutil";
import { mergeText } from "./git";
import { runHarness, type HarnessEvent } from "./harness";
import { latestSnapshot, newSnapshotId, snapshotFilesDir, writeSnapshotFile, writeSnapshotMeta } from "./snapshots";
import type { SnapshotMeta } from "./types";

export type Runner = (prompt: string, opts: { model?: string; maxTurns?: number }, onEvent: (e: HarnessEvent) => void) => Promise<Extract<HarnessEvent, { type: "done" }>>;

/** DesignSync is available through Claude Code; CLI and server use the same configuration. */
export function createDesignRunner(ctx: Ctx, signal?: AbortSignal): Runner {
  return (prompt, opts, onEvent) => runHarness({
    kind: "claude", bin: ctx.config.harness.claudeBin, cwd: ctx.repo, prompt,
    model: opts.model, maxTurns: opts.maxTurns, allowedTools: ["DesignSync", "ToolSearch"], signal,
  }, onEvent);
}

const LOAD = "Load the DesignSync tool via ToolSearch first if it is deferred.";

interface ToolJson {
  method?: string;
  projects?: Array<{ projectId: string; name: string; updatedAt: string }>;
  paths?: string[];
  path?: string;
  content?: string;
  isBase64?: boolean;
  truncated?: boolean;
  planId?: string;
  written?: number;
  error?: string;
}

function jsonResults(contents: string[]): ToolJson[] {
  const out: ToolJson[] = [];
  for (const content of contents) {
    try {
      out.push(JSON.parse(content) as ToolJson);
    } catch {
      /* not a DesignSync result */
    }
  }
  return out;
}

async function run(runner: Runner, prompt: string, model: string | undefined, onLog?: (e: HarnessEvent) => void, maxTurns = 8) {
  const contents: string[] = [];
  const done = await runner(prompt, { model, maxTurns }, (e) => {
    if (e.type === "tool-result") contents.push(e.content);
    onLog?.(e);
  });
  return { done, results: jsonResults(contents) };
}

/** One Claude Design project as list_projects reports it, or null when the account has no such project */
export async function findProject(ctx: Ctx, runner: Runner, projectId: string, onLog?: (e: HarnessEvent) => void): Promise<{ projectId: string; name: string; updatedAt: string } | null> {
  const { done, results } = await run(runner, `${LOAD} Call DesignSync with method "list_projects". Reply only: DONE.`, ctx.config.harness.pullModel, onLog, 4);
  const listed = results.some((r) => Array.isArray(r.projects));
  if (!listed) throw new Error(done.ok ? "DesignSync didn't list any projects. Is Claude Code signed in to claude.ai with Claude Design access?" : done.result || "DesignSync list_projects failed");
  return results.flatMap((r) => r.projects ?? []).find((x) => x.projectId === projectId) ?? null;
}

export async function projectStatus(ctx: Ctx, runner: Runner, onLog?: (e: HarnessEvent) => void): Promise<{ updatedAt: string | null; name: string | null }> {
  const p = await findProject(ctx, runner, ctx.config.design.projectId, onLog);
  return { updatedAt: p?.updatedAt ?? null, name: p?.name ?? null };
}

export async function listProjectFiles(ctx: Ctx, runner: Runner, onLog?: (e: HarnessEvent) => void): Promise<string[]> {
  const { done, results } = await run(runner, `${LOAD} Call DesignSync with method "list_files" and projectId "${ctx.config.design.projectId}". Reply only: DONE.`, ctx.config.harness.pullModel, onLog, 4);
  const paths = results.find((r) => r.method === "list_files")?.paths;
  if (!paths) throw new Error(done.result || "DesignSync list_files returned nothing");
  // list_files includes folders: keep entries that are not a prefix of another entry
  return paths.filter((p) => !paths.some((q) => q !== p && q.startsWith(p + "/")));
}

/** Files worth pulling: text the comparison reads. Binaries, uploads and the generated bundle stay out. */
export function pullable(paths: string[]): string[] {
  return paths.filter((p) => !/^(uploads|assets)\//.test(p) && !/(^|\/)\.thumbnail$|_ds_bundle\.js$|\.(png|jpe?g|gif|webp|woff2?|ttf|otf|ico|pdf|mp4)$/i.test(p));
}

/** Live text content of `paths`, read in one headless run. Files Design doesn't have (or couldn't send) are left out. */
export async function getFiles(ctx: Ctx, runner: Runner, paths: string[], onLog?: (e: HarnessEvent) => void): Promise<Map<string, string>> {
  const prompt = `${LOAD} Then call DesignSync method "get_file" with projectId "${ctx.config.design.projectId}" once for EACH of these ${paths.length} paths, as parallel calls (several per message). Never repeat file contents in your replies. When every call has returned, reply only: DONE.\n\n${paths.map((p) => `- ${p}`).join("\n")}`;
  const { results } = await run(runner, prompt, ctx.config.harness.pullModel, onLog, Math.max(8, Math.ceil(paths.length / 4) + 4));
  const out = new Map<string, string>();
  for (const r of results) if (r.method === "get_file" && r.path && typeof r.content === "string" && !r.isBase64) out.set(r.path, r.content);
  return out;
}

export interface PullProgress {
  done: number;
  total: number;
  failed: string[];
}

/** The snapshot is Design's state right now: same project, same updatedAt, and every file pulled */
export function isCurrent(ctx: Ctx, snap: SnapshotMeta | null, updatedAt: string | null): boolean {
  return !!snap && !!updatedAt && snap.projectUpdatedAt === updatedAt && !snap.unpulled && (snap.projectId ?? ctx.config.design.projectId) === ctx.config.design.projectId;
}

/** Checks updatedAt through Claude first, then fetches file contents only if needed (or `force`). */
export async function pullIfChanged(ctx: Ctx, runner: Runner, opts: Parameters<typeof pullSnapshot>[2] & { force?: boolean }): Promise<{ snapshot: SnapshotMeta | null; current: SnapshotMeta | null; updatedAt: string | null }> {
  const { updatedAt } = await projectStatus(ctx, runner, opts.onLog);
  const latest = latestSnapshot(ctx);
  if (!opts.force && isCurrent(ctx, latest, updatedAt)) return { snapshot: null, current: latest, updatedAt };
  return { snapshot: await pullSnapshot(ctx, runner, { ...opts, updatedAt }), current: null, updatedAt };
}

/**
 * Pull `paths` into a new snapshot, in parallel batches of headless runs. A file that still fails after
 * a retry is carried from the previous snapshot (an absent file would read as "deleted in Design") and
 * recorded in the meta, and the snapshot doesn't claim Design's updatedAt, so it never passes as current.
 */
export async function pullSnapshot(ctx: Ctx, runner: Runner, opts: { paths?: string[]; label?: string; batch?: number; parallel?: number; updatedAt?: string | null; onProgress?: (p: PullProgress) => void; onLog?: (e: HarnessEvent) => void }): Promise<SnapshotMeta> {
  const all = opts.paths ?? pullable(await listProjectFiles(ctx, runner, opts.onLog));
  const prev = latestSnapshot(ctx);
  const id = newSnapshotId();
  const size = opts.batch ?? 40;
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += size) batches.push(all.slice(i, i + size));
  const got = new Set<string>();
  const failed: string[] = [];
  const report = () => opts.onProgress?.({ done: got.size, total: all.length, failed: [...failed] });
  const pullBatch = async (paths: string[], attempt = 1): Promise<void> => {
    for (const [path, content] of await getFiles(ctx, runner, paths, opts.onLog)) {
      writeSnapshotFile(ctx, id, path, content);
      got.add(path);
    }
    report();
    const missing = paths.filter((p) => !got.has(p));
    if (missing.length && attempt < 2) return pullBatch(missing, attempt + 1);
    failed.push(...missing);
  };
  const queue = [...batches];
  const workers = Array.from({ length: Math.min(opts.parallel ?? 3, queue.length) }, async () => {
    while (queue.length) await pullBatch(queue.shift()!);
  });
  await Promise.all(workers);
  report();
  if (!got.size) throw new Error("The pull returned no files. Is Claude Code signed in to claude.ai with Claude Design access?");
  const carried: string[] = [];
  const missing: string[] = [];
  for (const p of failed.sort()) {
    const earlier = prev ? readText(join(snapshotFilesDir(ctx, prev.id), p)) : null;
    if (earlier == null) missing.push(p);
    else {
      writeSnapshotFile(ctx, id, p, earlier);
      carried.push(p);
    }
  }
  const unpulled = failed.length ? { carried, missing, from: carried.length ? prev?.label : undefined } : undefined;
  return writeSnapshotMeta(ctx, { id, label: opts.label ?? "Pulled from Claude Design", source: "pull", createdAt: new Date().toISOString(), projectId: ctx.config.design.projectId, projectUpdatedAt: unpulled ? undefined : (opts.updatedAt ?? undefined), unpulled });
}

export interface UploadCheck {
  /** Design's updatedAt right now */
  updatedAt: string | null;
  /** Design hasn't changed at all since the snapshot the stage was built from */
  fresh: boolean;
  /** Staged files Design edited meanwhile: its edits were merged into the staged copy */
  merged: string[];
  /** Staged files that can't go up as they are: uploading them would overwrite Design's newer work */
  conflicts: Array<{ path: string; reason: string }>;
}

/**
 * Before an upload: has Design moved since the snapshot the stage was built from? When it has (or the
 * snapshot doesn't know its updatedAt), read the live copy of every file about to be written and
 * three-way merge Design's edits into the staged copy, so an upload never overwrites newer work.
 */
export async function checkUpload(ctx: Ctx, runner: Runner, o: { stageDir: string; baseDir: string | null; baseUpdatedAt?: string; paths: string[]; onLog?: (e: HarnessEvent) => void }): Promise<UploadCheck> {
  const { updatedAt } = await projectStatus(ctx, runner, o.onLog);
  if (updatedAt && updatedAt === o.baseUpdatedAt) return { updatedAt, fresh: true, merged: [], conflicts: [] };
  const live = await getFiles(ctx, runner, o.paths, o.onLog);
  const merged: string[] = [];
  const conflicts: UploadCheck["conflicts"] = [];
  for (const p of o.paths) {
    const base = o.baseDir ? readText(join(o.baseDir, p)) : null;
    const ours = readFileSync(join(o.stageDir, p), "utf8");
    const theirs = live.get(p) ?? null;
    if (theirs === base || theirs === ours) continue;
    if (theirs == null) conflicts.push({ path: p, reason: "Claude Design no longer has this file, or couldn't send it" });
    else if (base == null) conflicts.push({ path: p, reason: "Claude Design created this file too, with other content" });
    else {
      const m = mergeText(base, ours, theirs);
      if (m.conflicts) conflicts.push({ path: p, reason: `Claude Design edited the same lines (${m.conflicts} overlapping change${m.conflicts === 1 ? "" : "s"})` });
      else {
        writeFileSync(join(o.stageDir, p), m.text);
        merged.push(p);
      }
    }
  }
  return { updatedAt, fresh: false, merged, conflicts };
}

/** Same text, give or take line endings and trailing whitespace at the end of the file */
const sameText = (a: string, b: string) => a.replace(/\r\n/g, "\n").trimEnd() === b.replace(/\r\n/g, "\n").trimEnd();

/** After an upload: read every written file back and compare it with the staged copy. `contents` is what Design now holds. */
export async function verifyUpload(ctx: Ctx, runner: Runner, stageDir: string, paths: string[], onLog?: (e: HarnessEvent) => void): Promise<{ contents: Map<string, string>; differ: string[] }> {
  const contents = await getFiles(ctx, runner, paths, onLog);
  const differ = paths.filter((p) => {
    const back = contents.get(p);
    return back == null || !sameText(back, readFileSync(join(stageDir, p), "utf8"));
  });
  return { contents, differ };
}

/** Upload staged files (project paths under stageDir) with one locked plan. No deletes. */
export async function pushFiles(ctx: Ctx, runner: Runner, stageDir: string, paths: string[], onLog?: (e: HarnessEvent) => void): Promise<{ written: number; planId: string | null }> {
  const files = paths.map((p) => `{"path":${JSON.stringify(p)},"localPath":${JSON.stringify(p)}}`).join(",");
  const prompt = `${LOAD} The developer already approved this exact upload in the Claude Design Sync tool. Do exactly two steps and nothing else:
1. Call DesignSync method "finalize_plan" with projectId "${ctx.config.design.projectId}", localDir ${JSON.stringify(stageDir)}, writes ${JSON.stringify(paths)} and deletes [].
2. Call DesignSync method "write_files" with that projectId, the planId from step 1, and files [${files}].
Do not read, edit or create any other file. Reply only with the write_files result JSON.`;
  const { done, results } = await run(runner, prompt, ctx.config.harness.pullModel, onLog, 8);
  const planId = results.find((r) => r.planId)?.planId ?? null;
  const written = results.find((r) => typeof r.written === "number")?.written ?? 0;
  if (!written) throw new Error(done.result || "The upload did not report any written files");
  return { written, planId };
}
