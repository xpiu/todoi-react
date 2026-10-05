// The mapping, lane by lane: which files on each side make up each kind of unit, how they pair up, and
// how work moves across. The words come from config.json, so the Mapping page always shows the rules the
// inventory (inventory.ts) and the plan (plan.ts) actually apply.
import type { Config, MapEntry } from "./config";
import { isIgnored } from "./fsutil";
import type { Side, UnitKind } from "./types";

/** A unit kind, or "other": files outside every lane (ignored, or outside the mapped roots) */
export type LaneId = UnitKind | "other";

export interface Technique {
  id: "merge-css" | "ai-port";
  label: string;
  detail: string;
}

export interface LaneRule {
  id: LaneId;
  title: string;
  /** Where the lane's files live on each side (null: the side has none) */
  app: string | null;
  design: string | null;
  /** How a file on one side finds its twin */
  match: string;
  /** How work crosses, per receiving side (null: never moves that way) */
  toApp: Technique | null;
  toDesign: Technique | null;
  /** Pairs pinned in config.json (renames, screens) */
  pairs?: MapEntry[];
  /** Design-only material that is read, never ported */
  reference?: boolean;
  /** Extra rules worth knowing (ignore lists, asset fallbacks) */
  notes?: string[];
}

export const LANE_ORDER: LaneId[] = ["tokens", "component", "spec", "screen", "card", "guideline", "other"];

export function laneRules(config: Config): LaneRule[] {
  const A = config.app;
  const D = config.design;
  const merge: Technique = { id: "merge-css", label: "CSS merge", detail: "Deterministic, no AI: the other side's rule changes since the sync point are replayed onto this side's file. A rule both sides changed keeps this side's value and is reported." };
  const portApp: Technique = { id: "ai-port", label: "AI port into a worktree", detail: `Claude Code translates the kit's React 18 JSX into typed React 19 and plain CSS on a branch in its own worktree. Every port must commit and ${A.check} must pass; nothing reaches your checkout until you merge.` };
  const portDesign: Technique = { id: "ai-port", label: "AI port into staging", detail: "Claude Code ports the App's work into a staging copy of the kit. Changed preview cards are rendered; you approve the exact upload list; the upload is checked against newer Design edits and read back." };
  const fallbacks = Object.entries(D.assetFallbacks ?? {});
  return [
    { id: "tokens", title: "Tokens", app: `${A.tokensRoot}/**/*.css`, design: `${D.tokensRoot}/**/*.css`, match: "Same path under each tokens folder.", toApp: merge, toDesign: merge, notes: ["A token file that exists on one side only is ported by AI instead."] },
    {
      id: "component",
      title: "Components",
      app: `${A.componentRoot}/<area>/<Name>.tsx + .css + .stories.ts(x) + .mdx / .md / .prompt.md`,
      design: `${D.componentRoot}/<area>/<Name>.jsx + .d.ts + .prompt.md`,
      match: `Same area and name (case-insensitive), else a name that is unique in the App.${config.renames.length ? ` ${config.renames.length === 1 ? "One pair is" : `${config.renames.length} pairs are`} pinned in config.json.` : ""}`,
      toApp: portApp,
      toDesign: portDesign,
      pairs: config.renames,
      notes: ["Stories and colocated documentation belong to their component. Translate useful examples into kit usage notes and preview cards; Storybook runtime code stays in the App's development tooling."],
    },
    { id: "spec", title: "Spec", app: `${A.spec} § "## heading"`, design: `${D.spec} § "## heading"`, match: "Same ## heading; differences in whitespace don't count.", toApp: portApp, toDesign: portDesign },
    {
      id: "screen",
      title: "Screens",
      app: `${A.screensRoot}/*.tsx`,
      design: `${D.screensRoot}/*.jsx`,
      match: `${config.screens.length === 1 ? "One pair is" : `${config.screens.length} pairs are`} listed in config.json. Other kit screens stay Design-only.`,
      toApp: portApp,
      toDesign: portDesign,
      pairs: config.screens,
    },
    { id: "card", title: "Preview cards", app: null, design: `${D.componentRoot}/**/*.card.html (+ Minimal twin)`, match: "Design only: a card and its Minimal twin are one unit.", toApp: null, toDesign: null, reference: true, notes: ["Never ported. Ports into Design update a component's cards with it; ports into the App read them as examples."] },
    { id: "guideline", title: "Guidelines", app: null, design: "guidelines/**/*.html, explorations/**/*.html", match: "Design only.", toApp: null, toDesign: null, reference: true, notes: ["Shown as Design work, never ported."] },
    {
      id: "other",
      title: "Left out",
      app: A.ignore.length ? `${A.ignore.join(", ")}, and everything outside the mapped folders` : "Everything outside the mapped folders",
      design: D.ignore.join(", "),
      match: "Never compared, never moved.",
      toApp: null,
      toDesign: null,
      reference: true,
      notes: fallbacks.length ? [`Binary kit assets aren't pulled; previews borrow the App's copies: ${fallbacks.map(([d, a]) => `${d} → ${a}`).join(", ")}.`] : undefined,
    },
  ];
}

/** Which lane a file belongs to on one side, by the same path rules the inventory uses */
export function laneOf(config: Config, side: Side, path: string): LaneId {
  if (side === "design") {
    const D = config.design;
    if (isIgnored(path, D.ignore)) return "other";
    if (path.startsWith(`${D.tokensRoot}/`) && path.endsWith(".css")) return "tokens";
    if (path.startsWith(`${D.componentRoot}/`)) {
      if (/\.(jsx|d\.ts|prompt\.md)$/.test(path)) return "component";
      if (path.endsWith(".html")) return "card";
    }
    if (path === D.spec) return "spec";
    if (path.startsWith(`${D.screensRoot}/`) && path.endsWith(".jsx")) return "screen";
    if (/^(guidelines|explorations)\/.*\.html$/.test(path)) return "guideline";
    return "other";
  }
  const A = config.app;
  if (isIgnored(path, A.ignore)) return "other";
  const bare = path.replace(/\.css$/, ".tsx");
  if (config.renames.some((r) => r.app === path || r.app === bare)) return "component";
  if (path.startsWith(`${A.tokensRoot}/`)) return path.endsWith(".css") ? "tokens" : "other";
  if (path.startsWith(`${A.componentRoot}/`) && /\.(tsx|ts|css|mdx|md)$/.test(path)) return "component";
  if (path === A.spec) return "spec";
  if (config.screens.some((s) => s.app === path)) return "screen";
  return "other";
}

/** Files per lane */
export function tally(config: Config, side: Side, paths: string[]): Partial<Record<LaneId, number>> {
  const out: Partial<Record<LaneId, number>> = {};
  for (const p of paths) {
    const l = laneOf(config, side, p);
    out[l] = (out[l] ?? 0) + 1;
  }
  return out;
}
