// What exists on each side, as comparable units with the files that make them up.
// Design paths are project-relative (as in a snapshot); App paths are repo-relative.
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Ctx } from "./config";
import { isIgnored, listFiles, readText } from "./fsutil";
import type { UnitKind } from "./types";

export interface UnitDef {
  id: string;
  kind: UnitKind;
  area: string;
  name: string;
  appPaths: string[];
  designPaths: string[];
  /** Spec sections live inside one file; this is the heading that picks the section */
  section?: string;
  /** Preview cards: the kit components a card destructures from the bundle */
  uses?: string[];
}

const base = (p: string) => p.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
const dirOf = (p: string) => p.replace(/\/[^/]*$/, "");
const areaOf = (p: string, root: string) => p.slice(root.length + 1).split("/")[0] ?? "";

export function sections(markdown: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!markdown) return out;
  let head = "(intro)";
  let buf: string[] = [];
  const flush = () => {
    const prev = out.get(head);
    out.set(head, (prev ? prev + "\n" : "") + buf.join("\n").trim());
  };
  for (const line of markdown.split("\n")) {
    const m = /^## (.+)$/.exec(line);
    if (m) {
      flush();
      head = m[1]!.trim();
      buf = [];
    } else buf.push(line);
  }
  flush();
  return out;
}

/** Normalise section text so path renames between readme.md and DESIGN.md don't count as drift */
export function normaliseSpec(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function cardInfo(html: string | null): { name: string; group: string; uses: string[] } {
  const head = /<!--\s*@dsCard([^>]*)-->/.exec(html ?? "")?.[1] ?? "";
  const attr = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(head)?.[1] ?? "";
  const uses = new Set<string>();
  for (const m of (html ?? "").matchAll(/const\s*\{([^}]+)\}\s*=\s*window\.[A-Za-z0-9_]+/g)) for (const n of m[1]!.split(",")) if (n.trim()) uses.add(n.trim().split(":")[0]!.trim());
  return { name: attr("name").replace(/ · Minimal$/, ""), group: attr("group").replace(/ · Minimal$/, ""), uses: [...uses] };
}

export function propsOf(text: string | null): string[] {
  if (!text) return [];
  const props = new Set<string>();
  for (const m of text.matchAll(/export (?:declare )?interface \w*Props(?:\s+extends[^{]+)?\s*\{([\s\S]*?)\n\}/g)) for (const p of m[1]!.matchAll(/^\s{2}(?:readonly\s+)?["']?([A-Za-z_$][\w$-]*)["']?\??\s*:/gm)) props.add(p[1]!);
  // kit .jsx: destructured function params `export function X({a,b=1,...rest})`
  for (const m of text.matchAll(/export function [A-Z]\w*\(\{([^}]*)\}/g)) for (const p of m[1]!.split(",")) {
    const n = p.replace(/[=:][\s\S]*$/, "").replace(/["']/g, "").trim();
    if (n && !n.startsWith("...")) props.add(n);
  }
  return [...props].sort();
}

/** Units for one comparison. `designFiles` = the snapshot's file list; App files come from the working tree. */
export function buildInventory(ctx: Ctx, designFiles: string[], readDesign: (path: string) => string | null): UnitDef[] {
  const { config, repo } = ctx;
  const D = config.design;
  const A = config.app;
  const appFiles = listFiles(join(repo, A.componentRoot)).map((p) => `${A.componentRoot}/${p}`).filter((p) => !isIgnored(p, A.ignore));
  const dFiles = designFiles.filter((p) => !isIgnored(p, D.ignore));
  const units: UnitDef[] = [];
  const usedApp = new Set<string>();

  // Components
  const appByKey = new Map<string, string>(); // "area/lowername" → app path
  const appByName = new Map<string, string[]>();
  for (const p of appFiles) {
    if (!/\.(tsx|ts)$/.test(p) || p.startsWith(A.tokensRoot + "/")) continue;
    const k = `${areaOf(p, A.componentRoot)}/${base(p).toLowerCase()}`;
    // a .tsx wins over a same-named .ts helper
    if (!appByKey.has(k) || p.endsWith(".tsx")) appByKey.set(k, p);
    appByName.set(base(p).toLowerCase(), [...(appByName.get(base(p).toLowerCase()) ?? []), p]);
  }
  const renames = new Map(config.renames.map((r) => [r.design, r.app]));
  const appCompanions = (p: string) => [p, p.replace(/\.tsx?$/, ".css")].filter((f) => existsSync(join(repo, f)));
  for (const p of dFiles) {
    if (!p.startsWith(D.componentRoot + "/") || !p.endsWith(".jsx")) continue;
    const area = areaOf(p, D.componentRoot);
    const name = base(p);
    const designPaths = [p, p.replace(/\.jsx$/, ".d.ts"), p.replace(/\.jsx$/, ".prompt.md")].filter((f) => dFiles.includes(f));
    let app = renames.get(p) ?? appByKey.get(`${area}/${name.toLowerCase()}`);
    if (!app) {
      const any = appByName.get(name.toLowerCase());
      if (any?.length === 1) app = any[0];
    }
    if (app && !existsSync(join(repo, app))) app = undefined;
    if (app) usedApp.add(app);
    units.push({ id: `component:${area}/${name}`, kind: "component", area, name, designPaths, appPaths: app ? appCompanions(app) : [] });
  }
  for (const p of appFiles) {
    if (!p.endsWith(".tsx") || usedApp.has(p) || p.startsWith(A.tokensRoot + "/")) continue;
    const area = areaOf(p, A.componentRoot);
    units.push({ id: `component:${area}/${base(p)}`, kind: "component", area, name: base(p), designPaths: [], appPaths: appCompanions(p) });
  }

  // Tokens: same relative path on both sides
  const appTokens = listFiles(join(repo, A.tokensRoot)).filter((p) => p.endsWith(".css"));
  const designTokens = dFiles.filter((p) => p.startsWith(D.tokensRoot + "/") && p.endsWith(".css")).map((p) => p.slice(D.tokensRoot.length + 1));
  for (const rel of [...new Set([...appTokens, ...designTokens])].sort()) {
    units.push({
      id: `tokens:${rel}`,
      kind: "tokens",
      area: "tokens",
      name: rel,
      appPaths: appTokens.includes(rel) ? [`${A.tokensRoot}/${rel}`] : [],
      designPaths: designTokens.includes(rel) ? [`${D.tokensRoot}/${rel}`] : [],
    });
  }

  // Spec sections: readme.md (Design) ↔ DESIGN.md (App), matched by "## " heading
  const appSpec = sections(readText(join(repo, A.spec)));
  const designSpec = sections(dFiles.includes(D.spec) ? readDesign(D.spec) : null);
  for (const h of new Set([...appSpec.keys(), ...designSpec.keys()])) {
    if (h === "(intro)") continue;
    units.push({ id: `spec:${h}`, kind: "spec", area: "spec", name: h, section: h, appPaths: appSpec.has(h) ? [A.spec] : [], designPaths: designSpec.has(h) ? [D.spec] : [] });
  }

  // Screens
  for (const s of config.screens) {
    const inDesign = dFiles.includes(s.design);
    const inApp = existsSync(join(repo, s.app));
    units.push({ id: `screen:${base(s.design)}`, kind: "screen", area: "screens", name: s.name ?? base(s.design), designPaths: inDesign ? [s.design] : [], appPaths: inApp ? [s.app] : [] });
  }
  for (const p of dFiles) if (p.startsWith(D.screensRoot + "/") && p.endsWith(".jsx") && !config.screens.some((s) => s.design === p)) units.push({ id: `screen:${base(p)}`, kind: "screen", area: "screens", name: base(p), designPaths: [p], appPaths: [] });

  // Preview cards (Design only): a card and its Minimal twin are one unit
  const cards = new Map<string, string[]>();
  for (const p of dFiles) {
    if (!/\.card\.html$|^components\/.*\.html$/.test(p)) continue;
    const key = p.replace(/-minimal(\.card)?\.html$/, "$1.html");
    cards.set(key, [...(cards.get(key) ?? []), p]);
  }
  for (const [key, paths] of cards) {
    if (!key.startsWith(D.componentRoot + "/")) continue;
    units.push({ id: `card:${key}`, kind: "card", area: areaOf(key, D.componentRoot), name: base(key).replace(/\.card$/, ""), designPaths: paths.sort(), appPaths: [] });
  }

  // Guidelines and explorations (Design only)
  for (const p of dFiles) if (/^(guidelines|explorations)\/.*\.html$/.test(p)) units.push({ id: `guideline:${p}`, kind: "guideline", area: dirOf(p), name: base(p), designPaths: [p], appPaths: [] });

  return units;
}
