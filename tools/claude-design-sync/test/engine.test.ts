import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { compare } from "../src/engine/compare";
import { mergeCss, parseCss, ruleDelta } from "../src/engine/css";
import { checkUpload, projectStatus, pullable, pullSnapshot, pushFiles } from "../src/engine/designsync";
import { fakeRunner } from "../src/engine/fakeHarness";
import { parseClaudeLine, toolResultText } from "../src/engine/harness";
import { resolveKitFile, twinOf } from "../src/engine/kit";
import { createStage, cssMergeFor, effectiveDirection, planSteps, stagedChanges, unitChoicesFor } from "../src/engine/plan";
import { deriveSnapshot, getSnapshot, listSyncPoints, snapshotFilesDir } from "../src/engine/snapshots";
import type { Comparison } from "../src/engine/types";
import { makeFixture, type Fixture } from "./fixture";

describe("mergeCss", () => {
  const base = "a{color:red}\nb{color:blue}\n";
  it("replays added rules after the same neighbour", () => {
    const r = mergeCss(base, "a{color:red}\nx{top:0}\nb{color:blue}\n", "a{color:red}\nb{color:blue}\nc{left:0}\n");
    expect(r.text).toBe("a{color:red}\nx{top:0}\nb{color:blue}\nc{left:0}\n");
    expect(r.added).toBe(1);
  });
  it("removes a rule only when the target still has it unedited", () => {
    expect(mergeCss(base, "a{color:red}\n", base).text).toBe("a{color:red}\n");
    const kept = mergeCss(base, "a{color:red}\n", "a{color:red}\nb{color:green}\n");
    expect(kept.text).toContain("b{color:green}");
    expect(kept.conflicts).toHaveLength(1);
  });
  it("merges edits property by property when both sides edited a rule", () => {
    const r = mergeCss("a{color:red;top:0}", "a{color:blue;top:0}", "a{color:red;top:1px}");
    expect(r.text).toBe("a{color:blue;top:1px}");
  });
  it("keeps the target's own formatting (blank lines, comments)", () => {
    const target = "/* head */\na{color:red}\n\n\nb{color:blue}\n";
    expect(mergeCss(base, base, target).text).toBe(target);
  });
  it("is idempotent", () => {
    const once = mergeCss(base, "a{color:red}\nx{top:0}\nb{color:blue}\n", base).text;
    expect(mergeCss(base, "a{color:red}\nx{top:0}\nb{color:blue}\n", once).text).toBe(once);
  });
  it("parses nested at-rules as one statement", () => {
    expect(parseCss("@media (x){a{b:c}}\nd{e:f}").map((s) => s.key)).toEqual(["@media (x)", "d"]);
    expect(ruleDelta("a{b:c}", "a{b:d}\ne{f:g}")).toEqual({ added: 1, removed: 0, changed: 1 });
  });
});

describe("compare (three-way)", () => {
  let fx: Fixture;
  let cmp: Comparison;
  beforeAll(() => {
    fx = makeFixture();
    cmp = compare(fx.ctx, { base: listSyncPoints(fx.ctx)[0]! });
  });
  const unit = (id: string) => cmp.units.find((u) => u.id === id)!;

  it("dates each side's change against the sync point", () => {
    expect(unit("component:board/BoardView").status).toBe("both");
    expect(unit("component:core/Toast").status).toBe("app-ahead");
    expect(unit("component:board/HiddenListsMenu").status).toBe("app-only");
    expect(unit("component:core/Chip").status).toBe("design-only");
    expect(unit("component:core/Badge").status).toBe("in-sync");
    expect(unit("tokens:themes/minimal-components.css").status).toBe("both");
    expect(unit("spec:Board").status).toBe("design-ahead");
    expect(unit("spec:Toasts").status).toBe("in-sync");
  });
  it("collects evidence: commit subjects, new props, rule counts, twins", () => {
    expect(unit("component:core/Toast").app.evidence).toContain("Retryable toast");
    expect(unit("component:board/BoardView").design.evidence).toContain("New props: dense");
    expect(unit("tokens:themes/minimal-components.css").design.evidence).toContain("1 rule added");
    expect(unit("card:components/board/board.card.html").design.evidence).toContain("Minimal twin added");
  });
  it("groups units into features from commits and preview cards", () => {
    const titles = cmp.features.map((f) => f.title);
    expect(titles).toContain("Recover hidden lists");
    expect(titles).toContain("Chips");
    const hidden = cmp.features.find((f) => f.title === "Recover hidden lists")!;
    expect(hidden.units.map((u) => u.name).sort()).toEqual(["BoardView", "HiddenListsMenu"]);
    expect(hidden.status).toBe("both");
    expect(cmp.features.find((f) => f.title === "Chips")!.directions).not.toContain("app-to-design");
  });
  it("plans the three directions per feature", () => {
    const hidden = cmp.features.find((f) => f.title === "Recover hidden lists")!;
    const chips = cmp.features.find((f) => f.title === "Chips")!;
    expect(effectiveDirection(chips, "app-to-design")).toBe("skip");
    expect(effectiveDirection(chips, "both")).toBe("both");
    const all = planSteps(fx.ctx, cmp, Object.fromEntries(cmp.features.map((f) => [f.id, "both" as const])));
    expect(all.some((s) => s.featureId === hidden.id && s.kind === "ai-push")).toBe(true);
    expect(all.some((s) => s.featureId === hidden.id && s.kind === "ai-pull")).toBe(true);
    expect(all.at(-1)!.kind).toBe("upload");
    const pullOnly = planSteps(fx.ctx, cmp, Object.fromEntries(cmp.features.map((f) => [f.id, effectiveDirection(f, "design-to-app")])));
    expect(pullOnly.every((s) => s.target === "app")).toBe(true);
    expect(pullOnly.some((s) => s.kind === "upload")).toBe(false);
    const brief = all.find((s) => s.kind === "ai-pull")!.brief!;
    expect(brief).toMatch(/React 19/);
    expect(brief).toMatch(/```diff/);
  });
  it("lets a subfeature override its feature, even when the feature is skipped", () => {
    const hidden = cmp.features.find((f) => f.title === "Recover hidden lists")!;
    const skipAll = Object.fromEntries(cmp.features.map((f) => [f.id, "skip" as const]));
    const units = unitChoicesFor(cmp, "skip", {}, { "component:board/HiddenListsMenu": "app-to-design", "component:core/Chip": "app-to-design" });
    const steps = planSteps(fx.ctx, cmp, skipAll, units);
    const push = steps.find((s) => s.featureId === hidden.id && s.kind === "ai-push")!;
    expect(push.units).toEqual(["component:board/HiddenListsMenu"]);
    // Chip only changed in Design: pushing it isn't possible, so its override falls back to skip
    expect(units["component:core/Chip"]).toBe("skip");
    expect(steps.some((s) => s.units.includes("component:core/Chip"))).toBe(false);
    // a subfeature follows its feature as far as it can: "both" on a new App component means push only
    const follow = unitChoicesFor(cmp, "both");
    expect(follow["component:board/HiddenListsMenu"]).toBe("both");
    expect(unitChoicesFor(cmp, "design-to-app")["component:board/HiddenListsMenu"]).toBe("skip");
  });

  it("merges token CSS deterministically in both directions", () => {
    const tokens = unit("tokens:themes/minimal-components.css");
    const toApp = cssMergeFor(fx.ctx, cmp, tokens, "app").text;
    expect(toApp).toContain(".td-chip");
    expect(toApp).toContain(".td-hidden");
    const toDesign = cssMergeFor(fx.ctx, cmp, tokens, "design").text;
    expect(toDesign.indexOf(".td-hidden")).toBeLessThan(toDesign.indexOf(".td-b"));
  });
  it("stages Design work and reports only what changed", () => {
    const stage = createStage(fx.ctx, cmp, "t1");
    expect(stagedChanges(fx.ctx, cmp, stage)).toEqual([]);
    writeFileSync(join(stage, "components/core/Toast.jsx"), "changed");
    writeFileSync(join(stage, "components/core/New.jsx"), "new");
    expect(stagedChanges(fx.ctx, cmp, stage).sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "components/core/New.jsx", status: "new" },
      { path: "components/core/Toast.jsx", status: "changed" },
    ]);
  });
});

describe("DesignSync through the harness", () => {
  it("pulls a project into a snapshot and pushes staged files", async () => {
    const fx = makeFixture();
    const runner = fakeRunner(fx.designNowDir, fx.repo);
    const snap = await pullSnapshot(fx.ctx, runner, { batch: 3, parallel: 2 });
    expect(snap.fileCount).toBe(pullable(Object.keys((await import("./fixture")).DESIGN_NOW)).length);
    expect(readFileSync(join(snapshotFilesDir(fx.ctx, snap.id), "components/core/Chip.jsx"), "utf8")).toContain("Chip");
    const stage = join(fx.ctx.state, "stage-push");
    mkdirSync(join(stage, "components/core"), { recursive: true });
    writeFileSync(join(stage, "components/core/Pushed.jsx"), "export const Pushed = 1;\n");
    const res = await pushFiles(fx.ctx, runner, stage, ["components/core/Pushed.jsx"]);
    expect(res.written).toBe(1);
    expect(existsSync(join(fx.designNowDir, "components/core/Pushed.jsx"))).toBe(true);
  });
  it("never lets an upload overwrite Design work newer than the run's snapshot", async () => {
    const fx = makeFixture();
    const runner = fakeRunner(fx.designNowDir, fx.repo);
    const cmp = compare(fx.ctx, { base: listSyncPoints(fx.ctx)[0]! });
    const stage = createStage(fx.ctx, cmp, "guard");
    const baseDir = snapshotFilesDir(fx.ctx, fx.nowSnapshot);
    const paths = ["readme.md", "components/core/Toast.jsx", "components/core/Badge.jsx", "components/core/Fresh.jsx"];
    writeFileSync(join(stage, "readme.md"), readFileSync(join(stage, "readme.md"), "utf8") + "\n## Lists\n\nHidden lists come back.\n");
    writeFileSync(join(stage, "components/core/Toast.jsx"), 'import React from "react";\nexport function Toast({message}){return React.createElement("div",{role:"status"},message);}\n');
    writeFileSync(join(stage, "components/core/Badge.jsx"), "export const Badge = 2;\n");
    writeFileSync(join(stage, "components/core/Fresh.jsx"), "export const Fresh = 1;\n");

    // Design unchanged since the snapshot: no file reads, nothing to merge
    const { updatedAt } = await projectStatus(fx.ctx, runner);
    expect(await checkUpload(fx.ctx, runner, { stageDir: stage, baseDir, baseUpdatedAt: updatedAt!, paths })).toMatchObject({ fresh: true, merged: [], conflicts: [] });

    // Design moved: a separate edit merges in, the same line conflicts, a deleted file conflicts, a new file goes up
    const live = (p: string) => join(fx.designNowDir, p);
    writeFileSync(live("readme.md"), readFileSync(live("readme.md"), "utf8").replace("dense mode.", "dense mode and filters."));
    writeFileSync(live("components/core/Toast.jsx"), 'import React from "react";\nexport function Toast({message}){return React.createElement("output",null,message);}\n');
    rmSync(live("components/core/Badge.jsx"));
    const check = await checkUpload(fx.ctx, runner, { stageDir: stage, baseDir, baseUpdatedAt: updatedAt!, paths });
    expect(check.fresh).toBe(false);
    expect(check.merged).toEqual(["readme.md"]);
    expect(readFileSync(join(stage, "readme.md"), "utf8")).toMatch(/dense mode and filters[\s\S]*Hidden lists come back/);
    expect(check.conflicts.map((c) => c.path)).toEqual(["components/core/Toast.jsx", "components/core/Badge.jsx"]);
    expect(readFileSync(join(stage, "components/core/Toast.jsx"), "utf8")).not.toContain("<<<<<<<");
  });
  it("marks the snapshot after an upload with Design's updatedAt only when it is Design's exact state", () => {
    const fx = makeFixture();
    const at = "2026-10-05T10:00:00.000Z";
    expect(getSnapshot(fx.ctx, deriveSnapshot(fx.ctx, fx.nowSnapshot, { "a.jsx": "a" }, "After upload", "upload", at).id)?.projectUpdatedAt).toBe(at);
    expect(getSnapshot(fx.ctx, deriveSnapshot(fx.ctx, fx.nowSnapshot, { "a.jsx": "a" }, "After upload", "upload").id)?.projectUpdatedAt).toBeUndefined();
  });
  it("keeps uploads, binaries and the generated bundle out of pulls", () => {
    expect(pullable(["a.jsx", "uploads/x.png", "assets/fonts/I.ttf", "_ds_bundle.js", "c/.thumbnail", "readme.md"])).toEqual(["a.jsx", "readme.md"]);
  });
  it("reads Claude Code stream-json, including results saved to a file", () => {
    const ev = parseClaudeLine(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: '{"method":"get_file","path":"a"}' }] } }));
    expect(ev).toEqual([{ type: "tool-result", content: '{"method":"get_file","path":"a"}' }]);
    const saved = join(makeFixture().ctx.state, "saved.txt");
    writeFileSync(saved, '{"method":"get_file","path":"big"}');
    expect(toolResultText([{ type: "text", text: `<persisted-output>\nOutput too large (120KB). Full output saved to: ${saved}\n</persisted-output>` }])).toContain('"big"');
    expect(parseClaudeLine(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "DONE", total_cost_usd: 0.1 }))[0]).toMatchObject({ type: "done", ok: true, costUsd: 0.1 });
  });
});

describe("kit tooling", () => {
  it("falls back to the App's copy for binary kit assets a pull skips", () => {
    const fx = makeFixture();
    mkdirSync(join(fx.repo, "src/client/design/fonts"), { recursive: true });
    writeFileSync(join(fx.repo, "src/client/design/fonts/Inter.ttf"), "font");
    const kit = snapshotFilesDir(fx.ctx, fx.nowSnapshot);
    expect(resolveKitFile(kit, "styles.css")).toBe(join(kit, "styles.css"));
    expect(resolveKitFile(kit, "assets/fonts/Inter.ttf")).toBeNull();
    expect(resolveKitFile(kit, "assets/fonts/Inter.ttf", { "assets/fonts/": "src/client/design/fonts/" }, fx.repo)).toBe(join(fx.repo, "src/client/design/fonts/Inter.ttf"));
    expect(resolveKitFile(kit, "../../etc/passwd")).toBeNull();
  });
  it("writes Minimal twins the way the Design project does", () => {
    const card = '<!-- @dsCard group="Components" viewport="1x1" name="Board" subtitle="Lists" -->\n<!doctype html><html><head><style>.r{border-radius:var(--radius-lg,7px);box-shadow:var(--shadow-card)}</style></head></html>';
    const t = twinOf(card);
    expect(t).toContain('group="Components · Minimal"');
    expect(t).toContain('name="Board · Minimal"');
    expect(t).toContain('subtitle="Minimal theme (light) — Lists"');
    expect(t).toContain('<html data-mode="light" data-theme="minimal">');
    expect(t).toContain(".r{border-radius:0;box-shadow:0 0 0 1px var(--border-divider)}");
  });
});
