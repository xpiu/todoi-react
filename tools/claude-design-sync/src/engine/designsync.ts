// Talking to Claude Design through Claude Code's DesignSync tool, run headless. File contents come
// back as tool results in the event stream (or a file Claude Code saved them to), never through
// the model's own reply, so a pull costs little more than the calls themselves.
import type { Ctx } from "./config";
import type { HarnessEvent } from "./harness";
import { newSnapshotId, writeSnapshotFile, writeSnapshotMeta } from "./snapshots";
import type { SnapshotMeta } from "./types";

export type Runner = (prompt: string, opts: { model?: string; maxTurns?: number }, onEvent: (e: HarnessEvent) => void) => Promise<Extract<HarnessEvent, { type: "done" }>>;

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

function jsonResults(events: HarnessEvent[]): ToolJson[] {
  const out: ToolJson[] = [];
  for (const e of events) {
    if (e.type !== "tool-result") continue;
    try {
      out.push(JSON.parse(e.content) as ToolJson);
    } catch {
      /* not a DesignSync result */
    }
  }
  return out;
}

async function run(runner: Runner, prompt: string, model: string | undefined, onLog?: (e: HarnessEvent) => void, maxTurns = 8) {
  const events: HarnessEvent[] = [];
  const done = await runner(prompt, { model, maxTurns }, (e) => {
    events.push(e);
    onLog?.(e);
  });
  return { done, results: jsonResults(events) };
}

export async function projectStatus(ctx: Ctx, runner: Runner, onLog?: (e: HarnessEvent) => void): Promise<{ updatedAt: string | null; name: string | null }> {
  const { done, results } = await run(runner, `${LOAD} Call DesignSync with method "list_projects". Reply only: DONE.`, ctx.config.harness.pullModel, onLog, 4);
  const p = results.flatMap((r) => r.projects ?? []).find((x) => x.projectId === ctx.config.design.projectId);
  if (!p && !done.ok) throw new Error(done.result || "DesignSync list_projects failed");
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

export interface PullProgress {
  done: number;
  total: number;
  failed: string[];
}

/** Pull `paths` into a new snapshot, in parallel batches of headless runs */
export async function pullSnapshot(ctx: Ctx, runner: Runner, opts: { paths?: string[]; label?: string; batch?: number; parallel?: number; updatedAt?: string | null; onProgress?: (p: PullProgress) => void; onLog?: (e: HarnessEvent) => void }): Promise<SnapshotMeta> {
  const all = opts.paths ?? pullable(await listProjectFiles(ctx, runner, opts.onLog));
  const id = newSnapshotId();
  const size = opts.batch ?? 40;
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += size) batches.push(all.slice(i, i + size));
  const got = new Set<string>();
  const failed: string[] = [];
  const report = () => opts.onProgress?.({ done: got.size, total: all.length, failed: [...failed] });
  const pullBatch = async (paths: string[], attempt = 1): Promise<void> => {
    const prompt = `${LOAD} Then call DesignSync method "get_file" with projectId "${ctx.config.design.projectId}" once for EACH of these ${paths.length} paths, as parallel calls (several per message). Never repeat file contents in your replies. When every call has returned, reply only: DONE.\n\n${paths.map((p) => `- ${p}`).join("\n")}`;
    const { results } = await run(ctx.config.harness.pullModel ? runner : runner, prompt, ctx.config.harness.pullModel, opts.onLog, Math.max(8, Math.ceil(paths.length / 4) + 4));
    for (const r of results) {
      if (r.method !== "get_file" || !r.path || typeof r.content !== "string" || r.isBase64) continue;
      writeSnapshotFile(ctx, id, r.path, r.content);
      got.add(r.path);
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
  return writeSnapshotMeta(ctx, { id, label: opts.label ?? "Pulled from Claude Design", source: "pull", createdAt: new Date().toISOString(), projectUpdatedAt: opts.updatedAt ?? undefined });
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
