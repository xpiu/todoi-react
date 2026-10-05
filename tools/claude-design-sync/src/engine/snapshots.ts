// Design snapshots (full copies of the Claude Design project's text files, taken by a pull or an
// export import) and sync points (an App git rev + the Design snapshot taken at the same moment).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { Ctx } from "./config";
import { isIgnored, listFiles } from "./fsutil";
import type { SnapshotMeta, SyncPoint } from "./types";

const snapRoot = (ctx: Ctx) => join(ctx.state, "snapshots");
export const snapshotFilesDir = (ctx: Ctx, id: string) => join(snapRoot(ctx), id, "files");

let lastMs = 0;
/** Sortable and unique, even for several snapshots in one millisecond: 20261005T101503123Z */
export function newSnapshotId(now = new Date()): string {
  lastMs = Math.max(now.getTime(), lastMs + 1);
  return new Date(lastMs).toISOString().replace(/[-:.]/g, "");
}

export function listSnapshots(ctx: Ctx): SnapshotMeta[] {
  const root = snapRoot(ctx);
  if (!existsSync(root)) return [];
  return listFiles(root)
    .filter((p) => /^[^/]+\/meta\.json$/.test(p))
    .map((p) => JSON.parse(readFileSync(join(root, p), "utf8")) as SnapshotMeta)
    .sort((a, b) => b.id.localeCompare(a.id));
}

export function getSnapshot(ctx: Ctx, id: string): SnapshotMeta | null {
  const f = join(snapRoot(ctx), id, "meta.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as SnapshotMeta) : null;
}

/** The newest snapshot is "Design now" */
export function latestSnapshot(ctx: Ctx): SnapshotMeta | null {
  return listSnapshots(ctx)[0] ?? null;
}

export function writeSnapshotMeta(ctx: Ctx, meta: Omit<SnapshotMeta, "fileCount">): SnapshotMeta {
  const files = listFiles(snapshotFilesDir(ctx, meta.id));
  const full: SnapshotMeta = { ...meta, fileCount: files.length };
  mkdirSync(join(snapRoot(ctx), meta.id), { recursive: true });
  writeFileSync(join(snapRoot(ctx), meta.id, "meta.json"), JSON.stringify(full, null, 2));
  return full;
}

export function writeSnapshotFile(ctx: Ctx, id: string, path: string, content: string): void {
  const abs = join(snapshotFilesDir(ctx, id), path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** The folder inside an export that holds the project (the one with components/ or _ds_manifest.json) */
export function findProjectRoot(dir: string): string | null {
  const files = listFiles(dir);
  const hit = files.find((f) => /(^|\/)(_ds_manifest\.json|styles\.css)$/.test(f) && files.some((g) => g.startsWith(f.replace(/[^/]*$/, "") + "components/")));
  if (!hit) return null;
  const prefix = hit.replace(/[^/]*$/, "");
  return prefix ? join(dir, prefix) : dir;
}

/** Import a Claude Design project export: a folder or a .zip */
export function importExport(ctx: Ctx, source: string, label?: string): SnapshotMeta {
  let dir = source;
  let tmp: string | null = null;
  if (/\.zip$/i.test(source)) {
    tmp = mkdtempSync(join(tmpdir(), "cds-import-"));
    execFileSync("unzip", ["-q", "-o", source, "-d", tmp]);
    dir = tmp;
  }
  try {
    if (!existsSync(dir)) throw new Error(`Not found: ${source}`);
    const root = findProjectRoot(dir);
    if (!root) throw new Error("This doesn't look like a Claude Design project export (no components/ next to styles.css or _ds_manifest.json).");
    const id = newSnapshotId();
    for (const f of listFiles(root)) {
      if (isIgnored(f, ["uploads/**"])) continue;
      const dest = join(snapshotFilesDir(ctx, id), f);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(root, f), dest);
    }
    return writeSnapshotMeta(ctx, { id, label: label ?? `Imported ${source.split("/").pop()}`, source: "import", createdAt: new Date().toISOString() });
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

/** A new snapshot = an existing one with some files replaced (after an upload). Pass projectUpdatedAt only when it is Design's exact state. */
export function deriveSnapshot(ctx: Ctx, fromId: string, changes: Record<string, string>, label: string, source: SnapshotMeta["source"], projectUpdatedAt?: string): SnapshotMeta {
  const id = newSnapshotId();
  cpSync(snapshotFilesDir(ctx, fromId), snapshotFilesDir(ctx, id), { recursive: true });
  for (const [p, c] of Object.entries(changes)) writeSnapshotFile(ctx, id, p, c);
  return writeSnapshotMeta(ctx, { id, label, source, createdAt: new Date().toISOString(), projectId: getSnapshot(ctx, fromId)?.projectId, projectUpdatedAt });
}

// ── Sync points ──────────────────────────────────────────────────────────────────────────────

const syncFile = (ctx: Ctx) => join(ctx.state, "sync-points.json");

export function listSyncPoints(ctx: Ctx): SyncPoint[] {
  const f = syncFile(ctx);
  if (!existsSync(f)) return [];
  return (JSON.parse(readFileSync(f, "utf8")) as SyncPoint[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveSyncPoint(ctx: Ctx, point: SyncPoint): SyncPoint[] {
  const all = listSyncPoints(ctx).filter((p) => p.id !== point.id);
  all.push(point);
  mkdirSync(ctx.state, { recursive: true });
  writeFileSync(syncFile(ctx), JSON.stringify(all, null, 2));
  return listSyncPoints(ctx);
}
