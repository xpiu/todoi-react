// Claude Design exports: which project an export belongs to, finding them in Downloads, importing them, and
// when one counts as fresh (for the GUI only; uploads never trust it)
import { execFileSync } from "node:child_process";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { exportDirs, loadConfig, TOOL_DIR, type Ctx } from "../src/engine/config";
import { downloadedAfter, exportCovers } from "../src/engine/designsync";
import { findExports, getSnapshot, importExport, namespaceMatches } from "../src/engine/snapshots";
import { tempDir } from "./fixture";

const PROJECT = "13419b94-fc55-494b-8a6d-e08632bb71e0";

function setup() {
  const root = tempDir("cds-exports-");
  const config = loadConfig();
  const ctx: Ctx = { repo: root, state: join(root, "state"), config: { ...config, design: { ...config.design, projectId: PROJECT, projectName: "Todoi Design System" } } };
  const downloads = join(root, "Downloads");
  mkdirSync(downloads);
  return { root, ctx, downloads };
}

/** A project export folder: components/ next to styles.css and (optionally) a manifest naming its bundle */
function exportFolder(dir: string, namespace?: string) {
  mkdirSync(join(dir, "components/core"), { recursive: true });
  writeFileSync(join(dir, "styles.css"), "@import 'tokens/colors.css';\n");
  writeFileSync(join(dir, "components/core/Chip.jsx"), "export const Chip = 1;\n");
  if (namespace) writeFileSync(join(dir, "_ds_manifest.json"), JSON.stringify({ namespace }));
  return dir;
}

/** Zip `folder` as Claude Design does: the project inside one top folder */
function zipOf(folder: string, zipPath: string) {
  execFileSync("zip", ["-qr", zipPath, "."], { cwd: folder });
  return zipPath;
}

const at = (path: string, iso: string) => utimesSync(path, new Date(iso), new Date(iso));

describe("Claude Design exports", () => {
  it("tells an export's project from its bundle namespace", () => {
    expect(namespaceMatches("FlowboardDesignSystem_13419b", PROJECT)).toBe(true);
    expect(namespaceMatches("MikabotDesignSystem_069f9c", PROJECT)).toBe(false);
    expect(namespaceMatches(undefined, PROJECT)).toBeNull();
    expect(namespaceMatches("FlowboardDesignSystem_13419b", "fake")).toBeNull();
  });

  it("refuses another project's export and records which project and when for this one's", () => {
    const { root, ctx } = setup();
    const other = zipOf(exportFolder(join(root, "mikabot"), "MikabotDesignSystem_069f9c"), join(root, "Mikabot Design System.zip"));
    expect(() => importExport(ctx, other)).toThrow(/another Claude Design project \(MikabotDesignSystem_069f9c\)/);

    const ours = zipOf(exportFolder(join(root, "todoi"), "FlowboardDesignSystem_13419b"), join(root, "Todoi Design System.zip"));
    at(ours, "2026-10-08T09:00:00.000Z");
    const snap = importExport(ctx, ours);
    expect(snap).toMatchObject({ source: "import", projectId: PROJECT, exportedAt: "2026-10-08T09:00:00.000Z" });
    expect(getSnapshot(ctx, snap.id)?.archive).toEqual({ name: "Todoi Design System.zip", path: ours });
    // Browser uploads preserve the original filename, never the disposable incoming path.
    const picked = importExport(ctx, ours, "Imported picked.zip", undefined, { name: "picked.zip" });
    expect(getSnapshot(ctx, picked.id)?.archive).toEqual({ name: "picked.zip" });
    // an import never claims Design's updatedAt: an upload from it always reads Design's live copies first
    expect(snap.projectUpdatedAt).toBeUndefined();

    // without a manifest it can't tell, so it imports without claiming the project
    expect(importExport(ctx, exportFolder(join(root, "bare"))).projectId).toBeUndefined();
  });

  it("looks in Downloads and the uploads drop folder unless CDS_EXPORTS names folders", () => {
    const saved = process.env.CDS_EXPORTS;
    try {
      delete process.env.CDS_EXPORTS;
      expect(exportDirs()).toEqual([join(homedir(), "Downloads"), join(TOOL_DIR, "uploads")]);
      process.env.CDS_EXPORTS = "/srv/a::/srv/b";
      expect(exportDirs()).toEqual(["/srv/a", "/srv/b"]);
    } finally {
      if (saved === undefined) delete process.env.CDS_EXPORTS;
      else process.env.CDS_EXPORTS = saved;
    }
  });

  it("finds this project's exports in Downloads, newest first, and nothing else", () => {
    const { root, ctx, downloads } = setup();
    const ns = "FlowboardDesignSystem_13419b";
    at(zipOf(exportFolder(join(root, "a"), ns), join(downloads, "Todoi Design System.zip")), new Date(Date.now() - 3_600_000).toISOString());
    at(zipOf(exportFolder(join(root, "b"), ns), join(downloads, "Todoi Design System (1).zip")), new Date(Date.now() - 60_000).toISOString());
    at(exportFolder(join(downloads, "Todoi Design System"), ns), new Date(Date.now() - 7_200_000).toISOString());
    at(zipOf(exportFolder(join(root, "c"), ns), join(downloads, "old.zip")), "2026-01-01T00:00:00.000Z");
    zipOf(exportFolder(join(root, "d"), "MikabotDesignSystem_069f9c"), join(downloads, "Mikabot Design System.zip"));
    writeFileSync(join(downloads, "notes.zip"), "not a zip");
    const found = findExports(ctx, [downloads, join(root, "missing")]);
    expect(found.map((x) => [x.name, x.kind])).toEqual([
      ["Todoi Design System (1).zip", "zip"],
      ["Todoi Design System.zip", "zip"],
      ["Todoi Design System", "folder"],
    ]);
    expect(findExports(ctx, [downloads], { limit: 1 })).toHaveLength(1);
  });

  it("counts an export as fresh only when it is this project's and was downloaded clearly after Design's last change", () => {
    const { root, ctx } = setup();
    const zip = zipOf(exportFolder(join(root, "e"), "FlowboardDesignSystem_13419b"), join(root, "e.zip"));
    at(zip, "2026-10-08T09:00:00.000Z");
    const snap = importExport(ctx, zip);
    expect(exportCovers(ctx, snap, "2026-10-08T08:00:00.000Z")).toBe(true);
    // within the clock margin, or older than the change: not fresh
    expect(exportCovers(ctx, snap, "2026-10-08T08:59:00.000Z")).toBe(false);
    expect(exportCovers(ctx, snap, "2026-10-08T10:00:00.000Z")).toBe(false);
    expect(exportCovers(ctx, { ...snap, projectId: undefined }, "2026-10-08T08:00:00.000Z")).toBe(false);
    expect(exportCovers(ctx, { ...snap, source: "pull" }, "2026-10-08T08:00:00.000Z")).toBe(false);
    expect(downloadedAfter(undefined, "2026-10-08T08:00:00.000Z")).toBe(false);
  });
});
