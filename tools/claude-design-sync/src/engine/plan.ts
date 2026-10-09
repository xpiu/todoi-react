// From decisions to work: each feature's direction becomes steps — deterministic CSS merges where both
// sides speak the same language, AI port briefs where they don't, and an upload that waits for approval.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Ctx } from "./config";
import { ADAPTATION_BRIEF } from "./adaptation";
import { mergeCss } from "./css";
import { hash, listFiles, readText } from "./fsutil";
import { createTag, diffNoIndex, diffSince, head, resolveRev, showAt, syncTags } from "./git";
import { sections } from "./inventory";
import { examplesOnly, isExampleFile } from "./paths";
import { plannedDrafts } from "./kitDraft";
import { saveSyncPoint, snapshotFilesDir } from "./snapshots";
import { appMoved, designMoved, featureDirection, REFERENCE_KINDS, unitDirection } from "./directions";
import { partsTitle, unitBaseline } from "./compare";
import type { Baseline, Comparison, Direction, Feature, SyncPoint, Unit } from "./types";

export type StepKind = "merge-css" | "ai-pull" | "ai-push" | "leave-examples" | "upload";

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
  /** Every feature a kit port carries when it ports several in one session (`featureId` is the first) */
  featureIds?: string[];
}

/** How the plan ports App work into the kit */
export interface PlanOptions {
  /**
   * Components whose App side changed only in their stories and docs get no AI port: a "leave-examples"
   * step settles them instead, and the run records them synced like the rest. Their kit cards keep the
   * figures they have, and the briefs of other ports skip translating stories into cards.
   */
  leaveExamples?: boolean;
}

/** The features a step works on */
export const stepFeatures = (s: Pick<Step, "featureId" | "featureIds">) => s.featureIds ?? [s.featureId];

const flows = (u: Unit, d: Direction): Array<"app" | "design"> => {
  const out: Array<"app" | "design"> = [];
  // references (previews, screens, guidelines) never move, whatever a request asks for
  if (REFERENCE_KINDS.includes(u.kind)) return out;
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

/** What a pull brings in: a commit subject names App work, so the kit's side of that feature is named by its parts */
const pullName = (f: Feature, units: Unit[]) => (f.source === "commit" ? `the kit's changes to ${partsTitle(units)}` : `“${f.title}” from the kit`);

/** Steps for the chosen directions. `choices` are per feature; `unitChoices` (from unitChoicesFor) win per subfeature. */
export function planSteps(ctx: Ctx, cmp: Comparison, choices: Record<string, Direction>, unitChoices: Record<string, Direction> = {}, opts: PlanOptions = {}): Step[] {
  const steps: Step[] = [];
  for (const f of cmp.features) {
    const fd = choices[f.id] ?? "skip";
    const dir = (u: Unit) => unitChoices[u.id] ?? (fd === "skip" ? "skip" : unitDirection(f.directions, u.status, fd, undefined, undefined, u.kind));
    if (f.units.every((u) => dir(u) === "skip")) continue;
    const toDesign = f.units.filter((u) => flows(u, dir(u)).includes("design"));
    const toApp = f.units.filter((u) => flows(u, dir(u)).includes("app"));
    for (const [target, units] of [["app", toApp], ["design", toDesign]] as const) {
      const css = units.filter((u) => u.mergeable && u.app.exists && u.design.exists);
      const left = target === "design" && opts.leaveExamples ? units.filter((u) => !css.includes(u) && examplesOnly(u)) : [];
      const ai = units.filter((u) => !css.includes(u) && !left.includes(u));
      for (const u of css) steps.push({ id: `${f.id}:css:${target}:${u.id}`, featureId: f.id, featureTitle: f.title, kind: "merge-css", target, title: `Merge ${u.name} rules into ${target === "app" ? "the App" : "Design"}`, units: [u.id] });
      if (left.length) steps.push({ id: `${f.id}:leave-examples`, featureId: f.id, featureTitle: f.title, kind: "leave-examples", target, title: `Leave ${partsTitle(left)}'s new Storybook examples out of the kit`, units: left.map((u) => u.id) });
      if (ai.length) {
        const kind = target === "app" ? "ai-pull" : "ai-push";
        steps.push({ id: `${f.id}:${kind}`, featureId: f.id, featureTitle: f.title, kind, target, title: target === "app" ? `Draft ${pullName(f, ai)} for your review` : `Port “${f.title}” into the kit`, units: ai.map((u) => u.id), brief: briefFor(ctx, cmp, [{ f, units: ai }], target, opts) });
      }
    }
  }
  if (steps.some((s) => s.target === "design")) steps.push({ id: "upload", featureId: "*", featureTitle: "Upload", kind: "upload", target: "design", title: "Upload the staged kit files to Claude Design (shows the file list first)", units: [] });
  return steps;
}

/** The area most of a feature's parts live in, so ports of one area share a session */
const mainArea = (units: Unit[]) => {
  const count = new Map<string, number>();
  for (const u of units) count.set(u.area, (count.get(u.area) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

/**
 * Kit ports `size` features to a Claude Code session, grouped by area: each session reads the kit's rules
 * and spec, builds the bundle and checks its cards once for all its features. Done when a run starts, on
 * the steps it runs, so a single feature's run never takes others along. Other steps keep their order;
 * a session takes the place of its first port.
 */
export function batchPorts(ctx: Ctx, cmp: Comparison, steps: Step[], size: number, opts: PlanOptions = {}): Step[] {
  const ports = steps.filter((s) => s.kind === "ai-push");
  if (size < 2 || ports.length < 2) return steps;
  const parts = (s: Step) => ({ f: cmp.features.find((f) => f.id === s.featureId)!, units: cmp.units.filter((u) => s.units.includes(u.id)) });
  const byArea = ports.map((s, i) => ({ s, i, area: mainArea(parts(s).units) })).sort((a, b) => a.area.localeCompare(b.area) || a.i - b.i).map((x) => x.s);
  const sessions = new Map<Step, Step>();
  for (let i = 0; i < byArea.length; i += size) {
    const group = byArea.slice(i, i + size);
    const first = ports.find((s) => group.includes(s))!;
    if (group.length === 1) {
      sessions.set(first, first);
      continue;
    }
    const titles = group.map((s) => s.featureTitle);
    sessions.set(first, {
      id: `${group[0]!.featureId}+${group.length - 1}:ai-push`, featureId: group[0]!.featureId, featureIds: group.map((s) => s.featureId),
      featureTitle: titles.join(" · "), kind: "ai-push", target: "design",
      title: `Port ${group.length} features into the kit in one session: ${titles.map((t) => `“${t}”`).join(", ")}`,
      units: group.flatMap((s) => s.units), brief: briefFor(ctx, cmp, group.map(parts), "design", opts),
    });
  }
  return steps.flatMap((s) => (s.kind !== "ai-push" ? [s] : sessions.has(s) ? [sessions.get(s)!] : []));
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
//
// A brief says what changed and where to read it, never the changes themselves: the agent has Read and
// Bash, so it reads every diff and file whole with the exact commands listed here. Nothing is cut off, and
// the brief stays the same size however large the feature is. A spec section lives inside one long file no
// command can slice, so its two versions are written to content-addressed files (.state/sections/) and the
// brief gives a word diff of those: the kit's spec writes a paragraph per line, so word diffs stay short.

/** Lines added and removed in a unified diff */
function diffStat(diff: string): string {
  let add = 0;
  let del = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("+")) add++;
    else if (l.startsWith("-")) del++;
  }
  return `+${add} −${del}`;
}

const lineCount = (text: string | null) => (text ? text.replace(/\n$/, "").split("\n").length : 0);
const q = (p: string) => (/^[\w./@+-]+$/.test(p) ? p : `'${p.replaceAll("'", "'\\''")}'`);

/** How to read one side's change of a unit: commands to run (with their size), files to read whole, files for context */
interface Reading {
  run: string[];
  read: string[];
  context: string[];
}

function changeLines(ctx: Ctx, cmp: Comparison, u: Unit, side: "app" | "design", leaveExamples = false): Reading {
  const r: Reading = { run: [], read: [], context: [] };
  const b = unitBaseline(cmp, u);
  // one file of the unit, before and now; `diff` is how a command shows the change
  const add = (now: string, was: string | null, diff: () => { cmd: string; text: string }) => {
    if (was == null) return r.read.push(`\`${now}\` (new, ${lineCount(readText(now))} lines)`);
    const d = diff();
    if (!d.text.trim()) return r.context.push(`\`${now}\``);
    r.run.push(`${d.cmd}   # ${diffStat(d.text)}`);
    r.read.push(`\`${now}\``);
  };
  if (side === "app") {
    if (u.kind === "spec") return specReading(ctx, b ? showAt(ctx.repo, b.rev, u.app.paths[0] ?? "") : null, readText(join(ctx.repo, u.app.paths[0] ?? "")), u.name);
    for (const p of u.app.paths) {
      // examples left out of the kit are named, not read: the port doesn't translate them
      if (leaveExamples && isExampleFile(p)) r.context.push(`\`${join(ctx.repo, p)}\``);
      else add(join(ctx.repo, p), b ? showAt(ctx.repo, b.rev, p) : null, () => ({ cmd: `git -C ${q(ctx.repo)} diff ${b!.rev} -- ${q(p)}`, text: diffSince(ctx.repo, b!.rev, [p]) }));
    }
    return r;
  }
  const snap = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
  const baseSnap = b?.designSnapshot ? snapshotFilesDir(ctx, b.designSnapshot) : null;
  if (!snap) return r;
  if (u.kind === "spec") return specReading(ctx, baseSnap ? readText(join(baseSnap, u.design.paths[0] ?? "")) : null, readText(join(snap, u.design.paths[0] ?? "")), u.name);
  for (const p of u.design.paths) {
    const was = baseSnap && existsSync(join(baseSnap, p)) ? join(baseSnap, p) : null;
    add(join(snap, p), was, () => ({ cmd: `git diff --no-index ${q(was!)} ${q(join(snap, p))}`, text: diffNoIndex(was!, join(snap, p)) }));
  }
  return r;
}

/** A spec section's two versions as files (named by their content), and the word diff that reads them */
function specReading(ctx: Ctx, was: string | null, now: string | null, name: string): Reading {
  const before = sections(was).get(name) ?? "";
  const after = sections(now).get(name) ?? "";
  if (before === after) return { run: [], read: [], context: [] };
  const dir = join(ctx.state, "sections");
  mkdirSync(dir, { recursive: true });
  const [a, b] = [before, after].map((text) => {
    const f = join(dir, `${hash(text)}.md`);
    // touched on reuse: the job sweep keeps sections a brief used within the last day
    if (!existsSync(f)) writeFileSync(f, `${text}\n`);
    else utimesSync(f, new Date(), new Date());
    return f;
  });
  // the spec writes a paragraph per line, so a word diff stays short
  return { run: [`git diff --no-index --word-diff ${q(a!)} ${q(b!)}   # § ${name}, ${diffStat(diffNoIndex(a!, b!))} lines`], read: [`\`${b}\` (§ ${name} as it is now)`], context: [] };
}

const KIT_RULES = `Kit conventions (Claude Design project, files under the staging folder):
- Production architecture comes first, Claude Design readability second. Adapt exports to the kit runtime; never reshape the application to match it.
- App .stories.ts/.stories.tsx and colocated .mdx/.md/.prompt.md are component examples and usage guidance, not additional components. Translate their relevant variants and compositions into the existing .prompt.md and preview cards. Do not copy Storybook imports, decorators, spies, or tests into the kit runtime.
- Each component is components/<area>/<Name>.jsx (React 18 UMD at runtime, imported as "react"), with a <Name>.d.ts prop contract (a doc comment that explains behaviour, one interface, \`export declare function\`) and a <Name>.prompt.md usage note with a JSX example.
- Styles live in the .jsx as a css string injected once: \`const css=\\\`…\\\`; if(typeof document!=="undefined"&&!document.getElementById("td-css-<name>")){…}\`. Tokens only, written var(--token,fallback). No hex outside var() fallbacks, no new fonts.
- Hooks that must reach card scripts also export a capitalised alias (\`export const UseThing=useThing\`).
- Preview cards: components/<area>/<name>.card.html, first line \`<!-- @dsCard group="Components" viewport="WxH" name="…" subtitle="…" -->\`, the same <head> scripts as existing cards (React 18 UMD, Babel standalone, lucide, ../../_ds_bundle.js), and a text/babel script that destructures components from window.FlowboardDesignSystem_13419b.
- Don't write or edit Minimal twins (*-minimal.card.html): when you finish, the tool replays your card edits onto each twin (keeping its Minimal tweaks) and writes the twin of a new card.
- A new component ships its Minimal rules in tokens/themes/minimal-components.css (html[data-theme="minimal"] .td-…): grey words that go ink on hover, square corners, hairline rings, no fills.
- Update readme.md (the long spec) where the behaviour is specified, and add new components to its components/<area>/ file map.
- Change files on top of what is there; never rewrite a file wholesale or drop content Design added.
- Check your work: \`npm run design-sync -- bundle STAGE\` then \`npm run design-sync -- check-cards STAGE <cards…>\` must show no errors.`;

const APP_RULES = `App conventions (this repo, React 19 + TypeScript; read CLAUDE.md and DESIGN.md first):
- Production architecture comes first, Claude Design readability second. Storybook and this sync tool adapt to the application. Follow React purity and state ownership, Base UI composition with refs/behavioral props, server-side Hono validation/authorization, and focused Zustand selectors.
- Preserve the boundary between design components, application screens, client data access, and server code. TanStack Query owns server data; Zustand owns shared client state; local interaction state stays local.
- Colocated .stories.ts/.stories.tsx and .mdx/.md/.prompt.md belong to their component. Maintain relevant stories when behavior changes, using the actual component with props/providers/mocks in development tooling. Keep Storybook code outside the production import graph. Do not downgrade React 19 APIs or replace Base UI behavior to match the Design kit.
- Components live in src/client/design/<area>/<Name>.tsx with a co-located <Name>.css (td-* classes, tokens only: no hex, no bare z-index, no @media in components). Behaviour comes from Base UI (@base-ui/react) where the kit has Popover/Menu/Select/Dialog. Icons via the explicit map in src/client/design/core/icons.ts (lucide-react).
- The kit's .d.ts is the prop contract; translate its React-18 UMD idioms (React.createElement, injected css strings, window globals) into typed React 19 components and plain CSS. Reuse existing helpers (core/text.tsx, ShortcutHint Keys, usePersistedFlag…) instead of duplicating.
- Minimal theme rules go in src/client/design/tokens/themes/minimal-components.css.
- DESIGN.md is the spec; update the matching section when behaviour changes.
- Run \`npm run check\` until it passes; when files changed, commit with a conventional message (feat:/fix:/style:) ending with the Co-Authored-By line your harness uses.`;

/** One feature's parts in a brief */
type BriefPart = { f: Feature; units: Unit[] };

/** A brief for one feature's port, or for several kit ports in one session (each feature gets its own section) */
export function briefFor(ctx: Ctx, cmp: Comparison, parts: BriefPart[], target: "app" | "design", opts: PlanOptions = {}): string {
  const base = cmp.base;
  const stage = "STAGE";
  // a pull carries Design's work into the App; a push carries the App's work into the kit
  const from = target === "app" ? "design" : "app";
  const leaveExamples = target === "design" && !!opts.leaveExamples;
  const units = parts.flatMap((p) => p.units);
  const many = parts.length > 1;
  const lines: string[] = [];
  lines.push(many ? `# Push to Claude Design: ${parts.length} features in one session` : `# ${target === "app" ? `Draft into the App: ${pullName(parts[0]!.f, units)}` : `Push to Claude Design: ${parts[0]!.f.title}`}`);
  lines.push("");
  lines.push(target === "app"
    ? `Bring the Claude Design kit's changes for this feature into the React 19 app in this repository (${ctx.repo}). The kit is a different framework: translate, don't copy. Your work is a draft: the developer reviews it against the App's architecture before it merges.`
    : `Bring the App's changes for ${many ? "these features" : "this feature"} into the Claude Design kit. Work ONLY inside the staging folder ${stage} — a full copy of the current Design project. Do not upload anything: the developer reviews the staged files and uploads them from the Claude Design Sync tool.`);
  if (many) lines.push("", "Port the features one after another, in the order below. They share the kit's rules, its spec (readme.md) and its preview cards: read those once, and build the bundle and check the cards once, after the last feature.");
  lines.push("");
  lines.push(`Sync point: ${base ? `${base.label} (App rev ${base.rev})` : "none recorded"} · App now: ${cmp.appHead} · Design snapshot: ${cmp.designSnapshot?.label ?? "none"}`);
  const work = (f: Feature) => [...(f.appWork.length ? [`App work since then: ${f.appWork.join("; ")}`] : []), ...(f.designWork.length ? [`Design work since then: ${f.designWork.join("; ")}`] : [])];
  const subfeatures = (heading: string, featureUnits: Unit[]) => {
    lines.push(heading);
    for (const u of featureUnits) {
      lines.push(`- **${u.name}** (${u.kind}, ${u.status}) — App: ${u.app.paths.join(", ") || "none"} · Design: ${u.design.paths.join(", ") || "none"}`);
      lines.push(`  - Subfeature id: ${u.id}`);
      for (const e of [...u.app.evidence.map((x) => `App: ${x}`), ...u.design.evidence.map((x) => `Design: ${x}`)]) lines.push(`  - ${e}`);
    }
  };
  const reading = (heading: string, u: Unit) => {
    const r = changeLines(ctx, cmp, u, from, leaveExamples);
    lines.push("", `${heading} ${u.name}`);
    if (r.run.length) lines.push("```sh", ...r.run, "```");
    if (r.read.length) lines.push(`- Read in full: ${r.read.join(", ")}`);
    if (r.context.length) lines.push(`- Unchanged, for context: ${r.context.join(", ")}`);
    // the receiving side as it is now, to change on top of: App files relative to the checkout the port
    // runs in (a worktree), kit files in the stage
    const into = target === "app" ? u.app.paths : u.design.paths.map((p) => join(stage, p));
    if (into.length && u.kind !== "spec") lines.push(`- ${target === "app" ? "Change on top of the App's current files (relative to the repository root)" : "Change on top of the kit's current files"}: ${into.map((p) => `\`${p}\``).join(", ")}`);
    if (u.status === "both") {
      const receiving = changeLines(ctx, cmp, u, target);
      lines.push("- Both sides changed. Read the receiving side's changes too, and reconcile their intent:");
      if (receiving.run.length) lines.push("```sh", ...receiving.run, "```");
      if (u.kind === "spec" && receiving.read.length) lines.push(`- Read in full: ${receiving.read.join(", ")}`);
    }
  };
  if (!many) {
    lines.push(...work(parts[0]!.f), "");
    subfeatures("## Subfeatures", units);
    lines.push("");
  }
  lines.push(`## Read the changes first`);
  lines.push(`The ${from === "design" ? "kit's" : "App's"} changes are not pasted here. Before you edit anything${many ? " for a feature" : ""}, run each command (each line ends with the lines it adds and removes) and read each file in full, with your own tools. Paths are absolute, so the commands work from any folder.`);
  if (target === "design") lines.push(`STAGE is the staging folder: the run creates it as a copy of the newest Design snapshot${cmp.designSnapshot ? ` (${snapshotFilesDir(ctx, cmp.designSnapshot.id)})` : ""}. To run this brief yourself, copy that folder and use the copy as STAGE.`);
  if (leaveExamples) lines.push("This run leaves the App's Storybook examples out of the kit: story and docs files are named for context only. Don't add or rework preview-card figures or .prompt.md examples for new stories; port the components' own changes.");
  if (!many) for (const u of units) reading("###", u);
  else for (const [i, { f, units: featureUnits }] of parts.entries()) {
    lines.push("", `## Feature ${i + 1} of ${parts.length}: ${f.title}`, ...work(f), "");
    subfeatures("### Subfeatures", featureUnits);
    for (const u of featureUnits) reading("####", u);
  }
  if (target === "design") {
    // what the tool writes from Storybook before this step: the agent refines these instead of authoring them
    const snap = cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : null;
    const drafted = units.flatMap((u) => plannedDrafts(ctx, u, (p) => !!snap && existsSync(join(snap, p))));
    if (drafted.length) lines.push("", "## Drafted for you from Storybook", "Before you start, the tool writes these from the App's Storybook manifest (react-docgen props, one card figure per story). They are already in the stage: refine them and write the component's .jsx to match, don't start them over.", ...drafted.map((p) => `- \`${join(stage, p)}\``));
  }
  const examples = leaveExamples ? [] : units.filter((u) => u.kind === "component").flatMap((u) => u.app.paths.filter(isExampleFile));
  if (examples.length) {
    lines.push("", "## Component examples (reference)", "Usage guidance: read these whole and translate the relevant examples into the receiving environment.");
    for (const p of examples) lines.push(`- \`${join(ctx.repo, p)}\` (${lineCount(readText(join(ctx.repo, p)))} lines)`);
  }
  lines.push("");
  lines.push(target === "app" ? KIT_RULES.replace("files under the staging folder", "the snapshot under " + (cmp.designSnapshot ? snapshotFilesDir(ctx, cmp.designSnapshot.id) : "(no snapshot)")) : APP_RULES);
  lines.push("");
  lines.push(target === "app" ? APP_RULES : KIT_RULES);
  lines.push("", ADAPTATION_BRIEF);
  lines.push("");
  lines.push("## Done means");
  if (target === "app") lines.push("- You read every change listed above, whole.", "- The App renders the feature the way the kit specifies, in both themes (Rounded, Minimal) and modes.", "- Base UI primitives, ref and render-prop forwarding, focused Zustand selectors and ARIA/keyboard behaviour are kept: the tool scans the draft for their loss, and the developer reviews it.", '- `npm run check` passes; commit actual changes. If every selected subfeature is already implemented, make no empty commit or cosmetic edit: explain the evidence and include one line alongside the adaptation report: CDS_ALREADY_IMPLEMENTED={"units":[{"id":"<exact subfeature id>","evidence":[{"path":"<existing App file, relative to worktree>","reason":"<specific existing behavior satisfying the kit change>"}]}]}. Include exactly every selected subfeature id, each once, with concrete file evidence. The tool checks the unchanged worktree and runs its final gate; the developer reviews this report.', "- Nothing outside this feature changed.");
  else lines.push("- You read every change listed above, whole.", `- The kit files for every subfeature${many ? " of every feature" : ""} are updated in ${stage} (component .jsx/.d.ts/.prompt.md, preview card, readme.md, Minimal rules); Minimal twins are the tool's.`, "- The local bundle builds and every touched card renders without errors.", `- Reply with the list of files you changed${many ? ", and one adaptation report covering every subfeature id above" : ""}.`);
  return lines.join("\n");
}

export const fillStage = (brief: string, stage: string) => brief.replace(/\bSTAGE\b/g, stage);
