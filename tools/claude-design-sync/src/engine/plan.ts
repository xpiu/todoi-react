// From decisions to work: each feature's direction becomes steps — deterministic CSS merges where both
// sides speak the same language, AI port briefs where they don't, and an upload that waits for approval.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Ctx } from "./config";
import { mergeCss } from "./css";
import { listFiles, readText } from "./fsutil";
import { createTag, diffNoIndex, diffSince, head, resolveRev, showAt, syncTags } from "./git";
import { isStoryFile, sections } from "./inventory";
import { getSnapshot, saveSyncPoint, snapshotFilesDir } from "./snapshots";
import { appMoved, designMoved, featureDirection, unitDirection } from "./directions";
import { unitBaseline } from "./compare";
import type { Baseline, Comparison, Direction, Feature, SyncPoint, Unit } from "./types";

export type StepKind = "merge-css" | "ai-pull" | "ai-push" | "upload";

export interface Step {
  id: string;
  featureId: string;
  featureTitle: string;
  kind: StepKind;
  /** "to-app" writes into the repo, "to-design" into the staging copy of the Design project */
  target: "app" | "design";
  title: string;
  units: string[];
  /** The AI brief (ai-* steps) */
  brief?: string;
}

const flows = (u: Unit, d: Direction): Array<"app" | "design"> => {
  const out: Array<"app" | "design"> = [];
  // "to design" carries App work; "to app" carries Design work
  if (appMoved(u.status) && (d === "both" || d === "app-to-design")) out.push("design");
  if (designMoved(u.status) && (d === "both" || d === "design-to-app")) out.push("app");
  return out;
};

/** The effective direction of a feature under a global mode, honouring what the feature allows */
export function effectiveDirection(f: Feature, global: Direction, override?: Direction): Direction {
  return featureDirection(f.directions, global, override);
}

/** Every unit's direction: its own override, else its feature's choice as far as the unit allows */
export function unitChoicesFor(cmp: Comparison, global: Direction, featureOverrides: Record<string, Direction> = {}, unitOverrides: Record<string, Direction> = {}): Record<string, Direction> {
  const out: Record<string, Direction> = {};
  for (const f of cmp.features) for (const u of f.units) out[u.id] = unitDirection(f.directions, u.status, global, featureOverrides[f.id], unitOverrides[u.id], u.kind);
  return out;
}

/** Steps for the chosen directions. `choices` are per feature; `unitChoices` (from unitChoicesFor) win per subfeature. */
export function planSteps(ctx: Ctx, cmp: Comparison, choices: Record<string, Direction>, unitChoices: Record<string, Direction> = {}): Step[] {
  const steps: Step[] = [];
  for (const f of cmp.features) {
    const fd = choices[f.id] ?? "skip";
    const dir = (u: Unit) => unitChoices[u.id] ?? (fd === "skip" ? "skip" : unitDirection(f.directions, u.status, fd, undefined, undefined, u.kind));
    if (f.units.every((u) => dir(u) === "skip")) continue;
    const toDesign = f.units.filter((u) => flows(u, dir(u)).includes("design"));
    const toApp = f.units.filter((u) => flows(u, dir(u)).includes("app"));
    for (const [target, units] of [["app", toApp], ["design", toDesign]] as const) {
      const css = units.filter((u) => u.mergeable && u.app.exists && u.design.exists);
      const ai = units.filter((u) => !css.includes(u));
      for (const u of css) steps.push({ id: `${f.id}:css:${target}:${u.id}`, featureId: f.id, featureTitle: f.title, kind: "merge-css", target, title: `Merge ${u.name} rules into ${target === "app" ? "the App" : "Design"}`, units: [u.id] });
      if (ai.length) {
        const kind = target === "app" ? "ai-pull" : "ai-push";
        steps.push({ id: `${f.id}:${kind}`, featureId: f.id, featureTitle: f.title, kind, target, title: target === "app" ? `Port “${f.title}” from the kit into the App` : `Port “${f.title}” into the kit`, units: ai.map((u) => u.id), brief: briefFor(ctx, cmp, f, target, ai) });
      }
    }
  }
  if (steps.some((s) => s.target === "design")) steps.push({ id: "upload", featureId: "*", featureTitle: "Upload", kind: "upload", target: "design", title: "Upload the staged kit files to Claude Design (shows the file list first)", units: [] });
  return steps;
}

// ── Deterministic merges ─────────────────────────────────────────────────────────────────────

/** Replay one side's token changes onto the other side's file; returns the new text for `target` */
export function cssMergeFor(ctx: Ctx, cmp: Comparison, unit: Unit, target: "app" | "design"): { text: string; summary: string } {
  const base = unitBaseline(cmp, unit);
  if (!base) throw new Error("A deterministic merge needs a sync point to diff from");
  const appPath = unit.app.paths[0]!;
  const designPath = unit.design.paths[0]!;
  const snap = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
  const baseSnap = base.designSnapshot ? snapshotFilesDir(ctx, base.designSnapshot) : null;
  const designNow = snap ? readText(join(snap, designPath)) ?? "" : "";
  const designBase = baseSnap ? readText(join(baseSnap, designPath)) ?? "" : designNow;
  const appNow = readText(join(ctx.repo, appPath)) ?? "";
  const appBase = showAt(ctx.repo, base.rev, appPath) ?? "";
  const r = target === "app" ? mergeCss(designBase, designNow, appNow) : mergeCss(appBase, appNow, designNow);
  const bits = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`].filter(Boolean).join(", ") || "nothing to apply";
  return { text: r.text, summary: `${unit.name}: ${bits}${r.conflicts.length ? ` · ${r.conflicts.length} left as the target has them` : ""}` };
}

// ── Staging (the Design side of a run) ───────────────────────────────────────────────────────

/** A run's working copy of the Design project: the current snapshot, editable, diffable */
export function createStage(ctx: Ctx, cmp: Comparison, runId: string): string {
  const dir = join(ctx.state, "stage", runId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    try {
      if (cmp.designSnapshot) cpSync(snapshotFilesDir(ctx, cmp.designSnapshot.id), dir, { recursive: true });
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
  return dir;
}

/** Files the run added or changed in its stage, relative to the snapshot it started from */
export function stagedChanges(ctx: Ctx, cmp: Comparison, stageDir: string): Array<{ path: string; status: "new" | "changed" }> {
  const snap = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
  const out: Array<{ path: string; status: "new" | "changed" }> = [];
  for (const p of listFiles(stageDir)) {
    if (p === "_ds_bundle.js") continue; // the local preview bundle is never uploaded
    const before = snap ? readText(join(snap, p)) : null;
    const now = readFileSync(join(stageDir, p), "utf8");
    if (before == null) out.push({ path: p, status: "new" });
    else if (before !== now) out.push({ path: p, status: "changed" });
  }
  return out;
}

// ── Sync points ──────────────────────────────────────────────────────────────────────────────

/**
 * Record App HEAD + a Design snapshot as the new starting line. `hold` keeps units open (skipped, not
 * synced): they go on comparing against the baseline they had under `from`, the sync point being replaced.
 */
export function recordSyncPoint(ctx: Ctx, o: { label: string; snapshotId: string | null; tag?: boolean; rev?: string; from?: SyncPoint | null; hold?: string[] }): SyncPoint {
  const rev = o.rev ? resolveRev(ctx.repo, o.rev) ?? o.rev : head(ctx.repo);
  const date = new Date().toISOString().slice(0, 10);
  let id = `sp-${date}-${rev}`;
  if (o.tag) {
    const existing = new Set(syncTags(ctx.repo, ctx.config.syncTagPrefix).map((t) => t.tag));
    let tag = `${ctx.config.syncTagPrefix}${date}`;
    for (let i = 2; existing.has(tag); i++) tag = `${ctx.config.syncTagPrefix}${date}.${i}`;
    createTag(ctx.repo, tag, `Sync point with Claude Design project ${ctx.config.design.projectId}${o.snapshotId ? ` (snapshot ${o.snapshotId})` : ""}: ${o.label}`);
    id = tag;
  }
  const from = o.from;
  const held: Record<string, Baseline> = {};
  if (from) for (const u of o.hold ?? []) held[u] = from.held?.[u] ?? { rev: from.rev, designSnapshot: from.designSnapshot, label: from.label };
  const point: SyncPoint = { id, label: o.label, rev, designSnapshot: o.snapshotId, createdAt: new Date().toISOString(), ...(Object.keys(held).length ? { held } : {}) };
  saveSyncPoint(ctx, point);
  return point;
}

// ── AI briefs ────────────────────────────────────────────────────────────────────────────────

const CAP = 40_000;
const capped = (s: string, n = CAP) => (s.length > n ? `${s.slice(0, n)}\n… (truncated — read the files for the rest)\n` : s);

function designDiff(ctx: Ctx, cmp: Comparison, u: Unit): string {
  const snap = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
  const b = unitBaseline(cmp, u);
  const baseSnap = b?.designSnapshot ? getSnapshot(ctx, b.designSnapshot) : null;
  if (!snap) return "";
  if (u.kind === "spec") {
    const now = sections(readText(join(snap, u.design.paths[0] ?? ""))).get(u.name) ?? "";
    const was = baseSnap ? sections(readText(join(snapshotFilesDir(ctx, baseSnap.id), u.design.paths[0] ?? ""))).get(u.name) ?? "" : "";
    return textDiff(was, now, `readme.md § ${u.name}`);
  }
  return u.design.paths
    .map((p) => {
      const now = join(snap, p);
      const was = baseSnap ? join(snapshotFilesDir(ctx, baseSnap.id), p) : null;
      return was && existsSync(was) ? diffNoIndex(was, now) : `New file ${p}:\n${readText(now) ?? ""}`;
    })
    .join("\n");
}

function textDiff(a: string, b: string, label: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cds-diff-"));
  try {
    const fa = join(dir, "before");
    const fb = join(dir, "after");
    writeFileSync(fa, a + "\n");
    writeFileSync(fb, b + "\n");
    return `${label}\n${diffNoIndex(fa, fb)}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const KIT_RULES = `Kit conventions (Claude Design project, files under the staging folder):
- Production architecture comes first, Claude Design readability second. Adapt exports to the kit runtime; never reshape the application to match it.
- App .stories.ts/.stories.tsx and colocated .mdx/.md/.prompt.md are component examples and usage guidance, not additional components. Translate their relevant variants and compositions into the existing .prompt.md and preview cards. Do not copy Storybook imports, decorators, spies, or tests into the kit runtime.
- Each component is components/<area>/<Name>.jsx (React 18 UMD at runtime, imported as "react"), with a <Name>.d.ts prop contract (a doc comment that explains behaviour, one interface, \`export declare function\`) and a <Name>.prompt.md usage note with a JSX example.
- Styles live in the .jsx as a css string injected once: \`const css=\\\`…\\\`; if(typeof document!=="undefined"&&!document.getElementById("td-css-<name>")){…}\`. Tokens only, written var(--token,fallback). No hex outside var() fallbacks, no new fonts.
- Hooks that must reach card scripts also export a capitalised alias (\`export const UseThing=useThing\`).
- Preview cards: components/<area>/<name>.card.html, first line \`<!-- @dsCard group="Components" viewport="WxH" name="…" subtitle="…" -->\`, the same <head> scripts as existing cards (React 18 UMD, Babel standalone, lucide, ../../_ds_bundle.js), and a text/babel script that destructures components from window.FlowboardDesignSystem_13419b. Every card ships a Minimal twin: run \`npm run design-sync -- twin <card>\`.
- A new component ships its Minimal rules in tokens/themes/minimal-components.css (html[data-theme="minimal"] .td-…): grey words that go ink on hover, square corners, hairline rings, no fills.
- Update readme.md (the long spec) where the behaviour is specified, and add new components to its components/<area>/ file map.
- Change files on top of what is there; never rewrite a file wholesale or drop content Design added.
- Check your work: \`npm run design-sync -- bundle <stage>\` then \`npm run design-sync -- check-cards <stage> <cards…>\` must show no errors.`;

const APP_RULES = `App conventions (this repo, React 19 + TypeScript; read CLAUDE.md and DESIGN.md first):
- Production architecture comes first, Claude Design readability second. Storybook and this sync tool adapt to the application. Follow React purity and state ownership, Base UI composition with refs/behavioral props, server-side Hono validation/authorization, and focused Zustand selectors.
- Preserve the boundary between design components, application screens, client data access, and server code. TanStack Query owns server data; Zustand owns shared client state; local interaction state stays local.
- Colocated .stories.ts/.stories.tsx and .mdx/.md/.prompt.md belong to their component. Maintain relevant stories when behavior changes, using the actual component with props/providers/mocks in development tooling. Keep Storybook code outside the production import graph. Do not downgrade React 19 APIs or replace Base UI behavior to match the Design kit.
- Components live in src/client/design/<area>/<Name>.tsx with a co-located <Name>.css (td-* classes, tokens only: no hex, no bare z-index, no @media in components). Behaviour comes from Base UI (@base-ui/react) where the kit has Popover/Menu/Select/Dialog. Icons via the explicit map in src/client/design/core/icons.ts (lucide-react).
- The kit's .d.ts is the prop contract; translate its React-18 UMD idioms (React.createElement, injected css strings, window globals) into typed React 19 components and plain CSS. Reuse existing helpers (core/text.tsx, ShortcutHint Keys, usePersistedFlag…) instead of duplicating.
- Minimal theme rules go in src/client/design/tokens/themes/minimal-components.css.
- DESIGN.md is the spec; update the matching section when behaviour changes.
- Run \`npm run check\` until it passes, then commit with a conventional message (feat:/fix:/style:) ending with the Co-Authored-By line your harness uses.`;

export function briefFor(ctx: Ctx, cmp: Comparison, f: Feature, target: "app" | "design", units: Unit[]): string {
  const base = cmp.base;
  const stage = "<STAGE>";
  const lines: string[] = [];
  lines.push(`# ${target === "app" ? "Pull into the App" : "Push to Claude Design"}: ${f.title}`);
  lines.push("");
  lines.push(target === "app"
    ? `Bring the Claude Design kit's changes for this feature into the React 19 app in this repository (${ctx.repo}). The kit is a different framework: translate, don't copy.`
    : `Bring the App's changes for this feature into the Claude Design kit. Work ONLY inside the staging folder ${stage} — a full copy of the current Design project. Do not upload anything: the developer reviews the staged files and uploads them from the Claude Design Sync tool.`);
  lines.push("");
  lines.push(`Sync point: ${base ? `${base.label} (App rev ${base.rev})` : "none recorded"} · App now: ${cmp.appHead} · Design snapshot: ${cmp.designSnapshot?.label ?? "none"}`);
  if (f.appWork.length) lines.push(`App work since then: ${f.appWork.join("; ")}`);
  if (f.designWork.length) lines.push(`Design work since then: ${f.designWork.join("; ")}`);
  lines.push("");
  lines.push("## Subfeatures");
  for (const u of units) {
    lines.push(`- **${u.name}** (${u.kind}, ${u.status}) — App: ${u.app.paths.join(", ") || "none"} · Design: ${u.design.paths.join(", ") || "none"}`);
    for (const e of [...u.app.evidence.map((x) => `App: ${x}`), ...u.design.evidence.map((x) => `Design: ${x}`)]) lines.push(`  - ${e}`);
  }
  lines.push("");
  lines.push(target === "app" ? KIT_RULES.replace("files under the staging folder", "the snapshot under " + (cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : "(no snapshot)")) : APP_RULES);
  lines.push("");
  lines.push(target === "app" ? APP_RULES : KIT_RULES);
  lines.push("");
  let budget = CAP;
  const examples = units.filter((u) => u.kind === "component").flatMap((u) => u.app.paths.filter((p) => isStoryFile(p) || /\.mdx?$/.test(p)));
  if (examples.length) {
    lines.push("## Component examples (reference)");
    lines.push("Read these as usage guidance; translate relevant examples into the receiving environment.");
    for (const p of examples) {
      const content = readText(join(ctx.repo, p));
      if (content == null) continue;
      const chunk = capped(content, Math.min(8000, budget));
      lines.push(`### ${p}`, "```", chunk, "```");
      budget -= chunk.length;
      if (budget <= 0) break;
    }
    lines.push("");
  }
  lines.push("## What changed");
  for (const u of units) {
    const ub = unitBaseline(cmp, u);
    const src = target === "app" ? designDiff(ctx, cmp, u) : ub ? diffSince(ctx.repo, ub.rev, u.app.paths) : u.app.paths.map((p) => `File ${p}:\n${readText(join(ctx.repo, p)) ?? ""}`).join("\n");
    if (!src.trim()) continue;
    const chunk = capped(src, Math.max(4000, budget));
    budget -= chunk.length;
    lines.push(`### ${u.name}`);
    lines.push("```diff");
    lines.push(chunk.trimEnd());
    lines.push("```");
    if (budget <= 0) {
      lines.push("(More diffs omitted for length — read the files listed above.)");
      break;
    }
  }
  lines.push("");
  lines.push("## Done means");
  if (target === "app") lines.push("- The App renders the feature the way the kit specifies, in both themes (Rounded, Minimal) and modes.", "- `npm run check` passes; one commit per feature.", "- Nothing outside this feature changed.");
  else lines.push(`- The kit files for every subfeature are updated in ${stage} (component .jsx/.d.ts/.prompt.md, preview card + Minimal twin, readme.md, Minimal rules).`, "- The local bundle builds and every touched card renders without errors.", "- Reply with the list of files you changed.");
  return lines.join("\n");
}

export const fillStage = (brief: string, stage: string) => brief.replaceAll("<STAGE>", stage);
