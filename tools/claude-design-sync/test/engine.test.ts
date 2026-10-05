import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { compare } from "../src/engine/compare";
import { mergeCss, parseCss, ruleDelta } from "../src/engine/css";
import { checkUpload, findProject, projectStatus, pullable, pullIfChanged, pullSnapshot, pushFiles, verifyUpload, type Runner } from "../src/engine/designsync";
import { fakeRunner } from "../src/engine/fakeHarness";
import { parseClaudeLine, toolResultText } from "../src/engine/harness";
import { resolveKitFile, twinOf } from "../src/engine/kit";
import { parseProjectRef, projectUrl } from "../src/engine/project";
import { createStage, cssMergeFor, effectiveDirection, planSteps, recordSyncPoint, stagedChanges, unitChoicesFor } from "../src/engine/plan";
import { deriveSnapshot, getSnapshot, listSyncPoints, snapshotFilesDir } from "../src/engine/snapshots";
import type { Comparison } from "../src/engine/types";
import { Jobs } from "../src/server/jobs";
import { laneOf, laneRules, LANE_ORDER } from "../src/engine/lanes";
import { mappingHistory } from "../src/server/mapping";
import { commitAll, createWorktree, headOf, mergeRun, removeWorktree, runCheck, verifyPort } from "../src/engine/worktree";
import { git } from "../src/engine/git";
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

describe("component stories and documentation", () => {
  it("groups examples with their owner and supplies them to the Design port", () => {
    const fx = makeFixture();
    const source = "src/client/design/core/Badge";
    const story = `${source}.stories.tsx`;
    const docs = `${source}.mdx`;
    writeFileSync(join(fx.repo, story), 'import { Badge } from "./Badge";\nexport const Overflow = { args: { n: 99 } };\n');
    writeFileSync(join(fx.repo, docs), "# Badge\nUse Overflow for large counts.\n");
    writeFileSync(join(fx.repo, "src/client/design/core/Orphan.stories.tsx"), "export const Example = {};\n");
    const cmp = compare(fx.ctx, { base: listSyncPoints(fx.ctx)[0]! });
    const badge = cmp.units.find((u) => u.id === "component:core/Badge")!;
    expect(badge.app.paths).toEqual([`${source}.tsx`, story, docs]);
    expect(badge.status).toBe("app-ahead");
    expect(cmp.units.some((u) => u.name.endsWith(".stories"))).toBe(false);
    expect(laneOf(fx.ctx.config, "app", docs)).toBe("component");
    const steps = planSteps(fx.ctx, cmp, Object.fromEntries(cmp.features.map((f) => [f.id, "app-to-design" as const])));
    const brief = steps.find((s) => s.units.includes(badge.id) && s.kind === "ai-push")!.brief!;
    expect(brief).toContain(story);
    expect(brief).toContain("Overflow");
    expect(brief).toContain("Do not copy Storybook imports");
    expect(brief).toContain("Production architecture comes first");
  });

  it("tracks later story-only edits and respects configured ignores", () => {
    const fx = makeFixture();
    const story = "src/client/design/core/Badge.stories.ts";
    writeFileSync(join(fx.repo, story), "export const Basic = { args: { n: 1 } };\n");
    git(fx.repo, ["add", story]);
    git(fx.repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "docs: badge examples"]);
    const base = recordSyncPoint(fx.ctx, { label: "With stories", snapshotId: fx.nowSnapshot, hold: [] });
    writeFileSync(join(fx.repo, story), "export const Basic = { args: { n: 2 } };\n");
    const cmp = compare(fx.ctx, { base });
    expect(cmp.units.find((u) => u.id === "component:core/Badge")!.status).toBe("app-ahead");
    fx.ctx.config.app = { ...fx.ctx.config.app, ignore: [...fx.ctx.config.app.ignore, "**/*.stories.ts"] };
    const ignored = compare(fx.ctx, { base });
    expect(ignored.units.find((u) => u.id === "component:core/Badge")!.status).toBe("in-sync");
  });
});

describe("sync points that keep skipped work open", () => {
  it("carries held units forward on their old baseline, and lets go of the rest", () => {
    const fx = makeFixture();
    const start = listSyncPoints(fx.ctx)[0]!;
    const before = compare(fx.ctx, { base: start });
    const chips = before.features.find((f) => f.title === "Chips")!;
    const hold = chips.units.map((u) => u.id);
    const next = recordSyncPoint(fx.ctx, { label: "Round 1", snapshotId: fx.nowSnapshot, from: start, hold });
    expect(next.held?.["component:core/Chip"]).toEqual({ rev: start.rev, designSnapshot: start.designSnapshot, label: "Start" });

    const after = compare(fx.ctx, { base: next });
    // synced work starts over from the new point; the held feature is still there, measured from Start
    expect(after.features.map((f) => f.title)).toEqual(["Chips"]);
    const chip = after.units.find((u) => u.id === "component:core/Chip")!;
    expect(chip.status).toBe("design-only");
    expect(chip.heldFrom?.label).toBe("Start");
    expect(chip.design.evidence[0]).toBe("Kept open since Start");
    expect(after.units.find((u) => u.id === "component:board/BoardView")!.status).toBe("in-sync");

    // held again: still measured from Start (not from Round 1); not held: released
    const round2 = recordSyncPoint(fx.ctx, { label: "Round 2", snapshotId: fx.nowSnapshot, from: next, hold: ["component:core/Chip"] });
    expect(round2.held?.["component:core/Chip"]?.label).toBe("Start");
    const round3 = recordSyncPoint(fx.ctx, { label: "Round 3", snapshotId: fx.nowSnapshot, from: round2, hold: [] });
    expect(round3.held).toBeUndefined();
    expect(compare(fx.ctx, { base: round3 }).features).toEqual([]);
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
  it("never lets a file a pull couldn't fetch read as deleted in Design", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.designNowDir, "components/core/Newer.jsx"), "export const Newer = 1;\n");
    const fake = fakeRunner(fx.designNowDir, fx.repo);
    // Claude Design never sends these two, however often they're asked for
    const lossy: Runner = (prompt, o, on) => fake(prompt, o, (e) => (e.type === "tool-result" && /"path":"components\/core\/(Chip|Newer)\.jsx"/.test(e.content) ? undefined : on(e)));
    const snap = await pullSnapshot(fx.ctx, lossy, { updatedAt: "2026-10-05T10:00:00.000Z" });
    expect(snap.unpulled).toEqual({ carried: ["components/core/Chip.jsx"], missing: ["components/core/Newer.jsx"], from: "Design now" });
    expect(snap.projectUpdatedAt).toBeUndefined();
    expect(readFileSync(join(snapshotFilesDir(fx.ctx, snap.id), "components/core/Chip.jsx"), "utf8")).toContain("Chip");
    const chip = compare(fx.ctx, { base: listSyncPoints(fx.ctx)[0]! }).units.find((u) => u.id === "component:core/Chip")!;
    expect(chip.status).toBe("design-only");
    expect(chip.design.evidence).toContain("Not pulled: compared as of Design now");
  });
  it("reads an upload back and names every file that didn't arrive intact", async () => {
    const fx = makeFixture();
    const fake = fakeRunner(fx.designNowDir, fx.repo);
    const stage = join(fx.ctx.state, "stage-verify");
    mkdirSync(join(stage, "components/core"), { recursive: true });
    const paths = ["components/core/A.jsx", "components/core/B.jsx", "components/core/C.jsx"];
    for (const p of paths) writeFileSync(join(stage, p), `export const ${p.slice(-5, -4)} = 1;\n`);
    await pushFiles(fx.ctx, fake, stage, paths);
    expect((await verifyUpload(fx.ctx, fake, stage, paths)).differ).toEqual([]);
    // Claude Design keeps B with Windows line endings (still intact), mangles C, and loses A
    writeFileSync(join(fx.designNowDir, "components/core/B.jsx"), "export const B = 1;\r\n");
    writeFileSync(join(fx.designNowDir, "components/core/C.jsx"), "export const C = 2;\n");
    rmSync(join(fx.designNowDir, "components/core/A.jsx"));
    const v = await verifyUpload(fx.ctx, fake, stage, paths);
    expect(v.differ).toEqual(["components/core/A.jsx", "components/core/C.jsx"]);
    expect(v.contents.get("components/core/C.jsx")).toBe("export const C = 2;\n");
  });
  it("stops a pull early when Design hasn't changed since the newest snapshot", async () => {
    const fx = makeFixture();
    const fake = fakeRunner(fx.designNowDir, fx.repo);
    let reads = 0;
    const counting: Runner = (prompt, o, on) => {
      if (prompt.includes('"get_file"')) reads++;
      return fake(prompt, o, on);
    };
    const first = await pullIfChanged(fx.ctx, counting, {});
    expect(first.snapshot?.projectUpdatedAt).toBe(first.updatedAt);
    expect(first.snapshot?.projectId).toBe("fake");
    const before = reads;
    const again = await pullIfChanged(fx.ctx, counting, {});
    expect(again.snapshot).toBeNull();
    expect(again.current?.id).toBe(first.snapshot!.id);
    expect(reads).toBe(before);
    // a change in Design, or force, reads the files again
    writeFileSync(join(fx.designNowDir, "components/core/Badge.jsx"), "export const Badge = 3;\n");
    expect((await pullIfChanged(fx.ctx, counting, {})).snapshot).not.toBeNull();
    expect((await pullIfChanged(fx.ctx, counting, { force: true })).snapshot).not.toBeNull();
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

describe("App runs in a worktree", () => {
  const commitIn = (dir: string, file: string, text: string, msg: string) => {
    writeFileSync(join(dir, file), text);
    git(dir, ["add", "-A"]);
    git(dir, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg]);
  };

  it("works on its own branch, and counts only a committed, clean port", async () => {
    const fx = makeFixture();
    const run = createWorktree(fx.ctx, "r1");
    expect(run).toMatchObject({ branch: "design-sync/run-r1", into: "main", state: "working" });
    expect(existsSync(join(run.worktree, "DESIGN.md"))).toBe(true);
    expect(run.worktree.startsWith(fx.repo)).toBe(false);

    let before = headOf(run);
    expect(verifyPort(run, before)).toEqual({ ok: false, reason: "It made no commit, so nothing was ported" });
    writeFileSync(join(run.worktree, "DESIGN.md"), "# Spec, edited\n");
    expect(verifyPort(run, before)).toMatchObject({ ok: false, reason: "It changed 1 file(s) but made no commit" });
    commitIn(run.worktree, "DESIGN.md", "# Spec, edited\n", "docs: spec");
    writeFileSync(join(run.worktree, "stray.txt"), "left behind");
    expect(verifyPort(run, before)).toMatchObject({ ok: false, reason: "It committed, but left 1 file(s) uncommitted: stray.txt" });
    rmSync(join(run.worktree, "stray.txt"));
    expect(verifyPort(run, before)).toMatchObject({ ok: true, commits: [{ subject: "docs: spec" }] });

    before = headOf(run);
    writeFileSync(join(run.worktree, "tokens.css"), "a{}\n");
    expect(commitAll(run, "style(tokens): merge")).toBe(true);
    expect(commitAll(run, "nothing")).toBe(false);
    expect(verifyPort(run, before).ok).toBe(true);

    expect(await runCheck(run, "git log -1 --format=%s")).toMatchObject({ ok: true, output: "style(tokens): merge\n" });
    expect((await runCheck(run, "echo broken >&2; exit 3")).ok).toBe(false);
    // the developer's checkout never saw any of it
    expect(readFileSync(join(fx.repo, "DESIGN.md"), "utf8")).not.toContain("edited");
  });

  it("merges by fast-forward, by merge commit, or not at all", () => {
    const fx = makeFixture();
    const ff = createWorktree(fx.ctx, "run-ff");
    expect(ff.branch).toBe("design-sync/run-ff");
    commitIn(ff.worktree, "a.txt", "a\n", "feat: a");
    expect(mergeRun(fx.ctx, ff)).toBe("fast-forward");
    removeWorktree(fx.ctx, ff, true);
    expect(existsSync(ff.worktree)).toBe(false);
    expect(git(fx.repo, ["branch", "--list", ff.branch]).trim()).toBe("");
    expect(readFileSync(join(fx.repo, "a.txt"), "utf8")).toBe("a\n");

    // the developer committed meanwhile: a merge commit
    const mc = createWorktree(fx.ctx, "mc");
    commitIn(mc.worktree, "b.txt", "b\n", "feat: b");
    commitIn(fx.repo, "c.txt", "c\n", "feat: c");
    expect(mergeRun(fx.ctx, mc)).toBe("merge");
    removeWorktree(fx.ctx, mc, true);

    // both edited the same line: nothing changes, and the branch stays for a look
    const cf = createWorktree(fx.ctx, "cf");
    commitIn(cf.worktree, "a.txt", "from the run\n", "feat: run");
    commitIn(fx.repo, "a.txt", "from the developer\n", "feat: dev");
    const head = git(fx.repo, ["rev-parse", "HEAD"]).trim();
    expect(() => mergeRun(fx.ctx, cf)).toThrow(/Couldn't merge design-sync\/run-cf into main/);
    expect(git(fx.repo, ["rev-parse", "HEAD"]).trim()).toBe(head);
    expect(git(fx.repo, ["status", "--porcelain"]).trim()).toBe("");
    expect(existsSync(cf.worktree)).toBe(true);

    // a different branch checked out: refused
    git(fx.repo, ["checkout", "-qb", "elsewhere"]);
    expect(() => mergeRun(fx.ctx, cf)).toThrow(/on elsewhere now/);
  });

  it("discards a kept branch with its worktree", () => {
    const fx = makeFixture();
    const jobs = new Jobs(fx.ctx);
    const run = createWorktree(fx.ctx, "kept");
    const job = jobs.create("run", "kept", { app: { ...run, state: "failed", reason: "npm run check failed" } });
    jobs.finish(job, "failed", "npm run check failed");
    expect(jobs.discard(job.id)).toBe(true);
    expect(job.app?.state).toBe("discarded");
    expect(existsSync(run.worktree)).toBe(false);
    expect(git(fx.repo, ["branch", "--list", run.branch]).trim()).toBe("");
    expect(jobs.discard(job.id)).toBe(false);
  });
});

describe("staging copies", () => {
  it("live only while their run waits for approval", () => {
    const fx = makeFixture();
    const cmp = compare(fx.ctx, { base: listSyncPoints(fx.ctx)[0]! });
    const jobs = new Jobs(fx.ctx);
    const uploaded = jobs.create("run", "uploaded", { stage: createStage(fx.ctx, cmp, "run-a") });
    jobs.finish(uploaded, "awaiting-approval");
    expect(existsSync(uploaded.stage!)).toBe(true);
    jobs.finish(uploaded, "done");
    expect(existsSync(uploaded.stage!)).toBe(false);

    const waiting = jobs.create("run", "waiting", { stage: createStage(fx.ctx, cmp, "run-b") });
    jobs.finish(waiting, "awaiting-approval");
    const discarded = jobs.create("run", "discarded", { stage: createStage(fx.ctx, cmp, "run-c") });
    jobs.finish(discarded, "awaiting-approval");
    expect(jobs.discard(discarded.id)).toBe(true);
    expect(discarded.state).toBe("cancelled");
    expect(existsSync(discarded.stage!)).toBe(false);
    expect(jobs.discard(uploaded.id)).toBe(false);

    // a restart prunes leftovers but keeps the copy a run still waits on
    const orphan = createStage(fx.ctx, cmp, "run-orphan");
    new Jobs(fx.ctx);
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(waiting.stage!)).toBe(true);
  });
});

describe("the target project", () => {
  it("reads a project id from a pasted link or a bare id", () => {
    const id = "13419b94-fc55-494b-8a6d-e08632bb71e0";
    expect(projectUrl(id)).toBe(`https://claude.ai/design/p/${id}`);
    expect(parseProjectRef(` https://claude.ai/design/p/${id}?tab=files `)).toBe(id);
    expect(parseProjectRef(id)).toBe(id);
    expect(parseProjectRef("https://claude.ai/design")).toBeNull();
    expect(parseProjectRef("not an id")).toBeNull();
  });
  it("finds a project on the account, and says when the listing never came", async () => {
    const fx = makeFixture();
    const runner = fakeRunner(fx.designNowDir, fx.repo);
    expect(await findProject(fx.ctx, runner, "fake-2")).toMatchObject({ name: "Other Design System" });
    expect(await findProject(fx.ctx, runner, "nope")).toBeNull();
    const silent: Runner = async () => ({ type: "done", ok: true, result: "DONE" });
    await expect(findProject(fx.ctx, silent, "fake")).rejects.toThrow(/signed in/);
  });
});

describe("the mapping", () => {
  it("sorts every file into the lane of the unit it belongs to, on both sides", () => {
    const fx = makeFixture();
    const cmp = compare(fx.ctx, { base: listSyncPoints(fx.ctx)[0]! });
    for (const u of cmp.units) {
      for (const p of u.app.paths) expect([u.id, laneOf(fx.ctx.config, "app", p)]).toEqual([u.id, u.kind]);
      for (const p of u.design.paths) expect([u.id, laneOf(fx.ctx.config, "design", p)]).toEqual([u.id, u.kind]);
    }
    expect(laneOf(fx.ctx.config, "design", "_ds_bundle.js")).toBe("other");
    expect(laneOf(fx.ctx.config, "app", "src/server/index.ts")).toBe("other");
    expect(laneRules(fx.ctx.config).map((l) => l.id)).toEqual(LANE_ORDER);
  });
  it("reads recent moves from snapshots, merges and sync points, with each move's files per lane", () => {
    const fx = makeFixture();
    const up = deriveSnapshot(fx.ctx, fx.nowSnapshot, { "components/core/Chip.jsx": "x", "tokens/themes/minimal-components.css": "y" }, "After upload (2 files)", "upload");
    const merged = git(fx.repo, ["log", "-1", "--format=%h"]).trim();
    const jobs = new Jobs(fx.ctx);
    const run = jobs.create("run", "Sync 1 feature(s)");
    jobs.update(run, { app: { worktree: "/gone", branch: "design-sync/run-x", base: merged, into: "main", commits: [{ hash: merged, subject: "feat" }], state: "merged" } });
    jobs.finish(run, "done", "merged");
    const h = mappingHistory(fx.ctx, jobs.list());
    const upload = h.find((e) => e.id === `snapshot:${up.id}`)!;
    expect(upload).toMatchObject({ kind: "upload", moves: [{ flow: "to-design", side: "design", lanes: { component: 1, tokens: 1 } }] });
    expect(upload.moves[0]!.files.sort()).toEqual(["components/core/Chip.jsx", "tokens/themes/minimal-components.css"]);
    const merge = h.find((e) => e.kind === "merge")!;
    expect(merge.moves[0]).toMatchObject({ flow: "to-app", side: "app" });
    expect(merge.moves[0]!.files.length).toBeGreaterThan(0);
    // the first snapshot brought every file; the next only what changed
    const pulls = h.filter((e) => e.kind === "import");
    expect(pulls.map((e) => e.detail)).toEqual([expect.stringMatching(/^\d+ files changed/), expect.stringMatching(/^First snapshot/)]);
    expect(h.some((e) => e.kind === "sync-point")).toBe(true);
    // newest first
    expect(h.map((e) => e.at)).toEqual([...h.map((e) => e.at)].sort().reverse());
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
