// Talking to Claude Design through Claude Code's DesignSync tool, run headless. File contents come
// back as tool results in the event stream (or a file Claude Code saved them to), never through
// the model's own reply, so a pull costs little more than the calls themselves. Headless runs only
// read: an upload's plan (finalize_plan) asks the developer for approval, which only an interactive
// Claude Code session can give, so uploads are handed off as a request to paste there.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Ctx } from "./config";
import { isIgnored, readText } from "./fsutil";
import { mergeText } from "./git";
import { runHarness, type HarnessEvent } from "./harness";
import { latestSnapshot, newSnapshotId, snapshotFilesDir, writeSnapshotFile, writeSnapshotMeta } from "./snapshots";
import type { SnapshotMeta } from "./types";

export type Runner = (prompt: string, opts: { model?: string; effort?: string; maxTurns?: number }, onEvent: (e: HarnessEvent) => void) => Promise<Extract<HarnessEvent, { type: "done" }>>;

/** DesignSync is available through Claude Code; CLI and server use the same configuration. */
export function createDesignRunner(ctx: Ctx, signal?: AbortSignal): Runner {
  return (prompt, opts, onEvent) => runHarness({
    kind: "claude", bin: ctx.config.harness.claudeBin, cwd: ctx.repo, prompt,
    model: opts.model, effort: opts.effort, maxTurns: opts.maxTurns, allowedTools: ["DesignSync", "ToolSearch"], signal,
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

/** DesignSync answers a call it needs approval for, in a run nobody can approve, with the prompt's own text */
export const APPROVAL_PROMPT = /^(To project:|From folder:)/m;
export const NEEDS_APPROVAL = "DesignSync asked for your approval, which a background run can't give. Uploads go through Claude Code: use “Upload from Claude Code” in Activity";

async function run(ctx: Ctx, runner: Runner, prompt: string, onLog?: (e: HarnessEvent) => void, maxTurns = 8) {
  const model = ctx.config.harness.pullModel;
  const contents: string[] = [];
  let refused = false;
  const done = await runner(prompt, { model, effort: ctx.config.harness.pullEffort, maxTurns }, (e) => {
    if (e.type === "tool-result") {
      contents.push(e.content);
      if (e.isError && APPROVAL_PROMPT.test(e.content)) refused = true;
    }
    onLog?.(e);
  });
  if (refused) throw new Error(NEEDS_APPROVAL);
  return { done, results: jsonResults(contents) };
}

/** One Claude Design project as list_projects reports it, or null when the account has no such project */
export async function findProject(ctx: Ctx, runner: Runner, projectId: string, onLog?: (e: HarnessEvent) => void): Promise<{ projectId: string; name: string; updatedAt: string } | null> {
  const { done, results } = await run(ctx, runner, `${LOAD} Call DesignSync with method "list_projects". Reply only: DONE.`, onLog, 4);
  const listed = results.some((r) => Array.isArray(r.projects));
  if (!listed) throw new Error(done.ok ? "DesignSync didn't list any projects. Is Claude Code signed in to claude.ai with Claude Design access?" : done.result || "DesignSync list_projects failed");
  return results.flatMap((r) => r.projects ?? []).find((x) => x.projectId === projectId) ?? null;
}

export async function projectStatus(ctx: Ctx, runner: Runner, onLog?: (e: HarnessEvent) => void): Promise<{ updatedAt: string | null; name: string | null }> {
  const p = await findProject(ctx, runner, ctx.config.design.projectId, onLog);
  return { updatedAt: p?.updatedAt ?? null, name: p?.name ?? null };
}

export async function listProjectFiles(ctx: Ctx, runner: Runner, onLog?: (e: HarnessEvent) => void): Promise<string[]> {
  const { done, results } = await run(ctx, runner, `${LOAD} Call DesignSync with method "list_files" and projectId "${ctx.config.design.projectId}". Reply only: DONE.`, onLog, 4);
  const paths = results.find((r) => r.method === "list_files")?.paths;
  if (!paths) throw new Error(done.result || "DesignSync list_files returned nothing");
  // list_files includes folders: keep entries that are not a prefix of another entry
  return paths.filter((p) => !paths.some((q) => q !== p && q.startsWith(p + "/")));
}

/** Ignored for comparison, yet read by the kit tooling: the manifest names the bundle's namespace */
const KIT_READS = new Set(["_ds_manifest.json"]);

/**
 * Files worth pulling: text the tool reads. Binaries, uploads and the generated bundle stay out, and so do
 * the config's `design.ignore` paths (each pulled file costs tokens), except the ones the kit tooling reads.
 */
export function pullable(paths: string[], ignore: string[] = []): string[] {
  return paths.filter((p) => !/^(uploads|assets)\//.test(p) && !/(^|\/)\.thumbnail$|_ds_bundle\.js$|\.(png|jpe?g|gif|webp|woff2?|ttf|otf|ico|pdf|mp4)$/i.test(p) && (KIT_READS.has(p) || !isIgnored(p, ignore)));
}

/** Rounds of get_file runs for one set of paths: a second try always, more while a round brings files in */
const MAX_ROUNDS = 6;

/**
 * Live text content of `paths`. Each run ends after its fetch turn (max turns 2: loading DesignSync, then
 * every get_file call in one message): the contents arrive verbatim in the event stream, and the model never
 * reads them back, which is what a pull's tokens used to go on. A model that spreads its calls over several
 * messages is cut off, so the paths still missing go into another round, which runs while rounds bring files in.
 * Files Design doesn't have, couldn't send, or sent truncated are left out (the caller carries or flags them).
 */
export async function getFiles(ctx: Ctx, runner: Runner, paths: string[], onLog?: (e: HarnessEvent) => void): Promise<Map<string, string>> {
  const asked = new Set(paths);
  const out = new Map<string, string>();
  let want = paths;
  for (let round = 1; want.length && round <= MAX_ROUNDS; round++) {
    const before = out.size;
    const prompt = `${LOAD} Then call DesignSync method "get_file" with projectId "${ctx.config.design.projectId}" once for EACH of these ${want.length} paths. Put all ${want.length} calls in ONE message, as parallel tool calls, not spread over several messages. Do not retry a failed call and never repeat file contents in your replies. When every call has returned, reply only: DONE.\n\n${want.map((p) => `- ${p}`).join("\n")}`;
    const { results } = await run(ctx, runner, prompt, onLog, 2);
    for (const r of results) if (r.method === "get_file" && r.path && asked.has(r.path) && typeof r.content === "string" && !r.isBase64 && !r.truncated) out.set(r.path, r.content);
    want = want.filter((p) => !out.has(p));
    if (round >= 2 && out.size === before) break;
  }
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

/** Margin for the clocks of this machine and Claude Design */
const EXPORT_MARGIN_MS = 2 * 60_000;

/**
 * An imported export of this project, downloaded clearly after Design's last change, shows Design as it is
 * now, for the GUI's freshness and the "bring it up to date" choice only. Nothing that guards data trusts it:
 * pulls still compare updatedAt (isCurrent), and an upload from it still reads Design's live copies first.
 */
export function exportCovers(ctx: Ctx, snap: SnapshotMeta | null, updatedAt: string | null): boolean {
  if (!snap || snap.source !== "import" || snap.projectId !== ctx.config.design.projectId) return false;
  return downloadedAfter(snap.exportedAt, updatedAt);
}

/** Was an export downloaded clearly after Design's last change? */
export const downloadedAfter = (exportedAt: string | undefined, updatedAt: string | null): boolean => !!exportedAt && !!updatedAt && Date.parse(exportedAt) - Date.parse(updatedAt) >= EXPORT_MARGIN_MS;

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
  const all = opts.paths ?? pullable(await listProjectFiles(ctx, runner, opts.onLog), ctx.config.design.ignore);
  const prev = latestSnapshot(ctx);
  const id = newSnapshotId();
  const size = opts.batch ?? 40;
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += size) batches.push(all.slice(i, i + size));
  const got = new Set<string>();
  const failed: string[] = [];
  const report = () => opts.onProgress?.({ done: got.size, total: all.length, failed: [...failed] });
  // getFiles already asks again for what a run didn't bring
  const pullBatch = async (paths: string[]): Promise<void> => {
    for (const [path, content] of await getFiles(ctx, runner, paths, opts.onLog)) {
      writeSnapshotFile(ctx, id, path, content);
      got.add(path);
    }
    report();
    failed.push(...paths.filter((p) => !got.has(p)));
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

/**
 * The upload, as a request for an interactive Claude Code session: staged files (project paths under
 * stageDir) under one locked plan, no deletes. There the developer approves DesignSync's plan prompt.
 * With `notify` (the sync tool's upload-check URL), Claude Code tells the tool once the files are written,
 * and the tool reads them back itself (verifyUpload); without it, the developer clicks Check the upload.
 * Either way the session ends with a fixed success/failure report.
 */
export function uploadRequest(ctx: Ctx, stageDir: string, paths: string[], notify?: string): { prompt: string; command: string } {
  const files = paths.map((p) => `{"path":${JSON.stringify(p)},"localPath":${JSON.stringify(p)}}`).join(",");
  const n = paths.length;
  const ping = notify ? `curl -sS -X POST -H 'x-cds: 1' ${notify}` : null;
  const prompt = `Upload ${n === 1 ? "1 staged file" : `${n} staged files`} from the Claude Design Sync tool to the Claude Design project "${ctx.config.design.projectName}" (${ctx.config.design.projectId}). ${LOAD} Do exactly ${ping ? "three" : "two"} steps and nothing else:
1. Call DesignSync method "finalize_plan" with projectId "${ctx.config.design.projectId}", localDir ${JSON.stringify(stageDir)}, writes ${JSON.stringify(paths)} and deletes []. I will approve its prompt.
2. Call DesignSync method "write_files" with that projectId, the planId from step 1, and files [${files}].${ping ? `
3. Only if step 2 wrote all ${n} file(s): run the shell command \`${ping}\` once. It tells the sync tool to read the files back from Claude Design, compare them with the staged copies and, when they match, mark the run synced.` : ""}
Do not read, edit or create any other file, and do not retry a failed call. Finish with this report and nothing else, filled in from the results:
Upload to Claude Design: SUCCEEDED (all ${n} file(s) written) or FAILED
- Plan (finalize_plan): approved, planId <id>; or failed: <the error>
- Files (write_files): <written> of ${n} written; or not run${ping ? `
- Sync tool (step 3): notified, it is checking the upload now; or not reached: <the error>; or not run` : ""}
- Next: SUCCEEDED → ${ping ? "watch Activity in the sync tool: the run is marked synced once the files read back intact. If the tool wasn't reached, click \"Check the upload\" there." : "go back to the Claude Design Sync tool and click \"Check the upload\"; it reads the files back and marks the run synced."} FAILED → what to fix, then paste this request again.`;
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return { prompt, command: `cd ${q(ctx.repo)} && ${ctx.config.harness.claudeBin} ${q(prompt)}` };
}
