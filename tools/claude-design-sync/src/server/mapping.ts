// The Mapping page's history: recent traffic between the App and Claude Design, read from what the tool
// already keeps (snapshots, sync points, jobs, git), with the files of each move sorted into lanes.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { appPending, uploadPending } from "../engine/approvals";
import type { Ctx } from "../engine/config";
import { pullable } from "../engine/designsync";
import { listFiles } from "../engine/fsutil";
import { filesTouched } from "../engine/git";
import { tally, type LaneId } from "../engine/lanes";
import { listSnapshots, listSyncPoints, snapshotFilesDir } from "../engine/snapshots";
import type { Side, SnapshotMeta } from "../engine/types";
import type { Job } from "./jobs";

/** Where files went: from Design into the tool's snapshot, from the tool into Design, or into the App */
export type Flow = "from-design" | "to-design" | "to-app";

export interface Move {
  flow: Flow;
  side: Side;
  lanes: Partial<Record<LaneId, number>>;
  files: string[];
}

export interface MappingEvent {
  id: string;
  at: string;
  kind: "pull" | "import" | "upload" | "merge" | "waiting" | "sync-point" | "check";
  title: string;
  detail: string;
  moves: Move[];
  /** The job behind it, for the Activity panel */
  jobId?: string;
  /** Still waiting on the developer */
  open?: boolean;
}

const MAX_FILES = 60;
const move = (ctx: Ctx, flow: Flow, side: Side, files: string[]): Move => ({ flow, side, lanes: tally(ctx.config, side, files), files: files.slice(0, MAX_FILES) });
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;

// Snapshots never change once written, so a pair's diff is computed once per server
const diffs = new Map<string, string[]>();

/**
 * Files added, changed or gone between two snapshots (every file when there is no earlier one). Only files a
 * pull would fetch count, so an import (which keeps everything) next to a pull doesn't read as deletions.
 */
export function snapshotChanges(ctx: Ctx, from: string | null, to: string): string[] {
  const key = JSON.stringify([ctx.state, from, to, ctx.config.design.ignore]);
  const hit = diffs.get(key);
  if (hit) return hit;
  const inScope = (dir: string) => pullable(listFiles(dir), ctx.config.design.ignore);
  const b = snapshotFilesDir(ctx, to);
  const bf = inScope(b);
  const out: string[] = [];
  if (!from) out.push(...bf);
  else {
    const a = snapshotFilesDir(ctx, from);
    const af = new Set(inScope(a));
    for (const f of bf) if (!af.has(f) || !readFileSync(join(a, f)).equals(readFileSync(join(b, f)))) out.push(f);
    const now = new Set(bf);
    for (const f of af) if (!now.has(f)) out.push(f);
  }
  diffs.set(key, out);
  return out;
}

function snapshotEvent(ctx: Ctx, s: SnapshotMeta, older: SnapshotMeta | undefined): MappingEvent {
  const from = s.source === "upload" ? (s.parent ?? older?.id ?? null) : (older?.id ?? null);
  const files = snapshotChanges(ctx, from, s.id);
  const other = !!s.projectId && s.projectId !== ctx.config.design.projectId;
  const flow: Flow = s.source === "upload" ? "to-design" : "from-design";
  const title = s.source === "upload" ? "Uploaded to Claude Design" : s.source === "import" ? "Imported a Claude Design export" : "Pulled from Claude Design";
  const changed = !from ? `First snapshot: ${plural(files.length, "file")}` : files.length ? `${plural(files.length, "file")} changed` : "No file changed";
  const unpulled = s.unpulled ? s.unpulled.carried.length + s.unpulled.missing.length : 0;
  const detail = [s.source === "upload" ? `${plural(files.length, "file")} written` : changed, `${s.fileCount} in the snapshot`, unpulled ? `${unpulled} not pulled` : "", other ? "from another project" : ""].filter(Boolean).join(" · ");
  return { id: `snapshot:${s.id}`, at: s.createdAt, kind: s.source === "upload" ? "upload" : s.source, title, detail, moves: files.length ? [move(ctx, flow, "design", files)] : [] };
}

function jobEvents(ctx: Ctx, j: Job): MappingEvent[] {
  const out: MappingEvent[] = [];
  const run = j.app;
  const waiting = j.state === "awaiting-approval" || (run && appPending(j));
  if (j.kind === "pull" && !j.snapshotId && j.state !== "running") {
    out.push({ id: `job:${j.id}`, at: j.endedAt ?? j.startedAt, kind: "check", title: j.state === "done" ? "Asked Claude Design" : "Pull didn't finish", detail: j.result ?? j.state, moves: [], jobId: j.id });
  }
  if (run?.state === "merged") {
    const at = [...j.events].reverse().find((e) => e.stepId === "app-merge")?.at ?? j.endedAt ?? j.startedAt;
    out.push({ id: `merge:${j.id}`, at, kind: "merge", title: `Merged into ${run.into}`, detail: `${plural(run.commits.length, "commit")} from ${run.branch}`, moves: [move(ctx, "to-app", "app", filesTouched(ctx.repo, run.commits.map((c) => c.hash)))], jobId: j.id });
  }
  if (waiting) {
    const moves: Move[] = [];
    const bits: string[] = [];
    if (run && appPending(j)) {
      moves.push(move(ctx, "to-app", "app", filesTouched(ctx.repo, run.commits.map((c) => c.hash))));
      bits.push(run.state === "ready" ? `${plural(run.commits.length, "commit")} to merge into ${run.into}` : `branch ${run.branch} kept after a failure`);
    }
    if (uploadPending(j)) {
      moves.push(move(ctx, "to-design", "design", j.staged!.map((s) => s.path)));
      bits.push(`${plural(j.staged!.length, "kit file")} to upload`);
    }
    if (moves.length) out.push({ id: `waiting:${j.id}`, at: j.startedAt, kind: "waiting", title: `Waiting for you: ${j.title}`, detail: bits.join(" · "), moves, jobId: j.id, open: true });
  }
  return out;
}

/** Newest first; work still waiting on the developer leads */
export function mappingHistory(ctx: Ctx, jobs: Job[], limit = 16): MappingEvent[] {
  const snaps = listSnapshots(ctx);
  const pulledBy = new Map(jobs.filter((j) => j.snapshotId && j.kind === "pull").map((j) => [j.snapshotId!, j.id]));
  const events: MappingEvent[] = snaps.slice(0, limit).map((s, i) => ({ ...snapshotEvent(ctx, s, snaps[i + 1]), jobId: pulledBy.get(s.id) }));
  for (const j of jobs) events.push(...jobEvents(ctx, j));
  for (const p of listSyncPoints(ctx).slice(0, limit)) {
    const held = Object.keys(p.held ?? {}).length;
    const snap = p.designSnapshot ? snaps.find((s) => s.id === p.designSnapshot) : null;
    events.push({ id: `sync:${p.id}`, at: p.createdAt, kind: "sync-point", title: `Marked synced: ${p.label}`, detail: [`App @${p.rev}`, snap ? `Design: ${snap.label}` : "no Design snapshot", held ? `${plural(held, "part")} kept open` : ""].filter(Boolean).join(" · "), moves: [] });
  }
  return events.sort((a, b) => Number(!!b.open) - Number(!!a.open) || b.at.localeCompare(a.at)).slice(0, limit);
}
