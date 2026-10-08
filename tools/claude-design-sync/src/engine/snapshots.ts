// Design snapshots (full copies of the Claude Design project's text files, taken by a pull or an
// export import) and sync points (an App git rev + the Design snapshot taken at the same moment).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { Ctx } from "./config";
import { isIgnored, listFiles, readText } from "./fsutil";
import type { SnapshotMeta, SyncPoint } from "./types";

export const snapRoot = (ctx: Ctx) => join(ctx.state, "snapshots");
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
  return readdirSync(root)
    .filter((name) => name !== "node_modules" && name !== ".git")
    .flatMap((name) => {
      const file = join(root, name, "meta.json");
      return existsSync(file) && statSync(file).isFile() ? [JSON.parse(readFileSync(file, "utf8")) as SnapshotMeta] : [];
    })
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

/** Where an export's project sits in its file list: the folder with components/ next to styles.css or _ds_manifest.json */
function projectRootIn(files: string[]): string | null {
  const hit = files.find((f) => /(^|\/)(_ds_manifest\.json|styles\.css)$/.test(f) && files.some((g) => g.startsWith(f.replace(/[^/]*$/, "") + "components/")));
  return hit == null ? null : hit.replace(/[^/]*$/, "");
}

/** The folder inside an export that holds the project */
function findProjectRoot(dir: string): string | null {
  const prefix = projectRootIn(listFiles(dir));
  if (prefix == null) return null;
  return prefix ? join(dir, prefix) : dir;
}

const namespaceOf = (manifest: string | null): string | undefined => {
  try {
    return manifest ? ((JSON.parse(manifest) as { namespace?: unknown }).namespace as string | undefined) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Is an export's bundle namespace this project's? Claude Design names it `<Name>_<the project id's first six
 * characters>` (FlowboardDesignSystem_13419b for 13419b94-…). null when either side can't tell.
 */
export function namespaceMatches(namespace: string | undefined, projectId: string): boolean | null {
  const id = /^[0-9a-f]{6}/i.exec(projectId)?.[0];
  const tail = namespace ? /_([0-9a-f]{6})$/i.exec(namespace)?.[1] : undefined;
  return id && tail ? id.toLowerCase() === tail.toLowerCase() : null;
}

export interface ExportFile {
  path: string;
  name: string;
  kind: "zip" | "folder";
  bytes: number;
  /** When it landed on disk (a download's finish time) */
  modifiedAt: string;
  namespace?: string;
}

const run = (args: string[]) => execFileSync("unzip", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] });

/** An export's project folder and manifest namespace, read without unpacking it; null when it isn't a project export */
function inspectExport(path: string): { namespace?: string } | null {
  try {
    if (statSync(path).isDirectory()) {
      for (const dir of [path, ...readdirSync(path).map((n) => join(path, n))]) {
        const manifest = join(dir, "_ds_manifest.json");
        if (existsSync(manifest) && existsSync(join(dir, "components"))) return { namespace: namespaceOf(readFileSync(manifest, "utf8")) };
      }
      return null;
    }
    const root = projectRootIn(run(["-Z1", path]).split("\n").filter(Boolean));
    if (root == null) return null;
    let manifest: string | null = null;
    try {
      manifest = run(["-p", path, `${root}_ds_manifest.json`]);
    } catch {
      /* an export without a manifest can't say which project it is */
    }
    return { namespace: namespaceOf(manifest) };
  } catch {
    return null;
  }
}

/**
 * Exports of this project waiting in `dirs` (normally ~/Downloads), newest first: .zip files and unzipped
 * folders from the last `days` days whose manifest names this project. Exports of other projects never show.
 */
export function findExports(ctx: Ctx, dirs: string[], { days = 30, limit = 3, scan = 12 } = {}): ExportFile[] {
  const since = Date.now() - days * 86_400_000;
  const candidates: Array<{ path: string; name: string; at: number }> = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const path = join(dir, name);
      try {
        const st = statSync(path);
        if (st.mtimeMs >= since && (st.isDirectory() || /\.zip$/i.test(name))) candidates.push({ path, name, at: st.mtimeMs });
      } catch {
        /* vanished or unreadable */
      }
    }
  }
  const out: ExportFile[] = [];
  for (const c of candidates.sort((a, b) => b.at - a.at).slice(0, scan)) {
    const found = inspectExport(c.path);
    if (!found || namespaceMatches(found.namespace, ctx.config.design.projectId) !== true) continue;
    const st = statSync(c.path);
    out.push({ path: c.path, name: c.name, kind: st.isDirectory() ? "folder" : "zip", bytes: st.isDirectory() ? 0 : st.size, modifiedAt: new Date(c.at).toISOString(), namespace: found.namespace });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Import a Claude Design project export: a folder or a .zip. An export whose manifest names another project
 * is refused. `exportedAt` (default: the file's modified time) is kept as freshness for display only.
 */
export function importExport(ctx: Ctx, source: string, label?: string, exportedAt?: string): SnapshotMeta {
  let dir = source;
  let tmp: string | null = null;
  try {
    if (!existsSync(source)) throw new Error(`Not found: ${source}`);
    const at = exportedAt ?? statSync(source).mtime.toISOString();
    if (/\.zip$/i.test(source)) {
      tmp = mkdtempSync(join(tmpdir(), "cds-import-"));
      execFileSync("unzip", ["-q", "-o", source, "-d", tmp]);
      dir = tmp;
    }
    const root = findProjectRoot(dir);
    if (!root) throw new Error("This doesn't look like a Claude Design project export (no components/ next to styles.css or _ds_manifest.json).");
    const namespace = namespaceOf(readText(join(root, "_ds_manifest.json")));
    const same = namespaceMatches(namespace, ctx.config.design.projectId);
    if (same === false) throw new Error(`This export is from another Claude Design project (${namespace}), not ${ctx.config.design.projectName}. Nothing was imported.`);
    const id = newSnapshotId();
    for (const f of listFiles(root)) {
      if (isIgnored(f, ["uploads/**"])) continue;
      const dest = join(snapshotFilesDir(ctx, id), f);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(root, f), dest);
    }
    return writeSnapshotMeta(ctx, { id, label: label ?? `Imported ${source.split("/").pop()}`, source: "import", createdAt: new Date().toISOString(), exportedAt: at, ...(same ? { projectId: ctx.config.design.projectId } : {}) });
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

/** A new snapshot = an existing one with some files replaced (after an upload). Pass projectUpdatedAt only when it is Design's exact state. */
export function deriveSnapshot(ctx: Ctx, fromId: string, changes: Record<string, string>, label: string, source: SnapshotMeta["source"], projectUpdatedAt?: string): SnapshotMeta {
  const id = newSnapshotId();
  cpSync(snapshotFilesDir(ctx, fromId), snapshotFilesDir(ctx, id), { recursive: true });
  for (const [p, c] of Object.entries(changes)) writeSnapshotFile(ctx, id, p, c);
  return writeSnapshotMeta(ctx, { id, label, source, createdAt: new Date().toISOString(), projectId: getSnapshot(ctx, fromId)?.projectId, projectUpdatedAt, parent: fromId });
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
