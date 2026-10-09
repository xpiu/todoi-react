// The three-way comparison: App now vs App at the sync point (git), Design now vs Design at the sync
// point (snapshots), per unit — then units grouped into features the developer decides on.
import { join } from "node:path";

import type { Ctx } from "./config";
import { ruleDelta } from "./css";
import { hashAll, listFiles, readText } from "./fsutil";
import { commitsAfter, head, showAt, type Commit } from "./git";
import { buildInventory, cardInfo, normaliseSpec, propsOf, sections, type UnitDef } from "./inventory";
import { getSnapshot, latestSnapshot, snapshotFilesDir } from "./snapshots";
import { appMoved, designMoved, directionsFor } from "./directions";
import type { Baseline, Comparison, Direction, Feature, SideState, SnapshotMeta, SyncPoint, Unit, UnitStatus } from "./types";

export interface Readers {
  appNow: (p: string) => string | null;
  appBase: ((p: string) => string | null) | null;
  designNow: (p: string) => string | null;
  designBase: ((p: string) => string | null) | null;
}

/** Baselines are immutable; memoize reads only within this comparison, including missing files. */
function cachedReader(read: Readers["appNow"]): Readers["appNow"] {
  const contents = new Map<string, string | null>();
  return (path) => {
    if (!contents.has(path)) contents.set(path, read(path));
    return contents.get(path) ?? null;
  };
}

export function readersFor(ctx: Ctx, base: Pick<Baseline, "rev" | "designSnapshot"> | null, snapshot: SnapshotMeta | null): Readers {
  const snapDir = snapshot ? snapshotFilesDir(ctx, snapshot.id) : null;
  const baseSnap = base?.designSnapshot ? getSnapshot(ctx, base.designSnapshot) : null;
  const baseDir = baseSnap ? snapshotFilesDir(ctx, baseSnap.id) : null;
  return {
    appNow: (p) => readText(join(ctx.repo, p)),
    appBase: base ? cachedReader((p) => showAt(ctx.repo, base.rev, p)) : null,
    designNow: (p) => (snapDir ? readText(join(snapDir, p)) : null),
    designBase: baseDir ? cachedReader((p) => readText(join(baseDir, p))) : null,
  };
}

/** The text that identifies a unit on one side (spec units read just their section) */
function unitText(def: UnitDef, paths: string[], read: (p: string) => string | null): Array<string | null> {
  if (def.kind === "spec") {
    const p = paths[0];
    const sec = p ? sections(read(p)).get(def.section!) : undefined;
    return [sec == null ? null : normaliseSpec(sec)];
  }
  return paths.map(read);
}

function sideState(def: UnitDef, side: "app" | "design", r: Readers): SideState {
  const paths = side === "app" ? def.appPaths : def.designPaths;
  const now = side === "app" ? r.appNow : r.designNow;
  const base = side === "app" ? r.appBase : r.designBase;
  const nowText = unitText(def, paths, now);
  const exists = paths.length > 0 && nowText.some((t) => t != null);
  const baseText = base ? unitText(def, paths, base) : null;
  const existedAtBase = baseText ? baseText.some((t) => t != null) : null;
  const changed = baseText ? hashAll(nowText) !== hashAll(baseText) : null;
  // a spec unit reads one section of one file, so only its whole text compares
  const changedPaths = baseText && def.kind !== "spec" ? paths.filter((_, i) => nowText[i] !== baseText[i]) : undefined;
  return { paths, exists, changed: exists || existedAtBase ? changed : false, added: existedAtBase === false && exists, evidence: [], ...(changedPaths ? { changedPaths } : {}) };
}

function statusOf(u: Pick<Unit, "app" | "design">): UnitStatus {
  const { app, design } = u;
  // One-sided units drift only when they are new or changed since the sync point; a long-standing
  // one-sided unit (an App helper the kit never had, a kit-only card) is a steady state, not work.
  if (app.exists && !design.exists) {
    if (app.added) return "app-only";
    if (app.changed) return "app-ahead";
    if (design.changed) return "design-ahead"; // removed from Design since the sync point
    return app.changed === null ? "app-only" : "in-sync";
  }
  if (design.exists && !app.exists) {
    if (design.added) return "design-only";
    if (design.changed) return "design-ahead";
    if (app.changed) return "app-ahead";
    return design.changed === null ? "design-only" : "in-sync";
  }
  if (!app.exists && !design.exists) return app.changed ? "app-ahead" : design.changed ? "design-ahead" : "in-sync";
  if (app.changed && design.changed) return "both";
  if (app.changed) return "app-ahead";
  if (design.changed) return "design-ahead";
  if (app.changed === null || design.changed === null) return "unknown";
  return "in-sync";
}

const PREFIX = /^(feat|fix|style|refactor|chore|docs|test|perf)(\([^)]*\))?!?:\s*/i;
export const cleanSubject = (s: string) => {
  const t = s.replace(PREFIX, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** A feature named by its parts: "TopNavbar", "Avatar and Badge", "AuthShell, InvitePage and 3 more" (spec headings in sentence case) */
export function partsTitle(units: Array<Pick<Unit, "kind" | "name">>): string {
  const names = units.map((u) => (u.kind === "spec" ? `${u.name.replace(/^[A-Z0-9][A-Z0-9 ,&/-]*[A-Z0-9](?![a-z])/, (m) => m.charAt(0) + m.slice(1).toLowerCase())} spec` : u.name));
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * The comments a kit edit added (up to two, first clause each): Claude Design explains its changes in
 * comments, which describe the work better than "edited". A `//` inside a URL is not a comment, and a
 * comment's second line starts mid-sentence.
 */
function kitNotes(before: string, after: string): string[] {
  const had = new Set(before.split("\n").map((l) => l.trim()));
  const lines = after.split("\n").map((l) => l.trim());
  const out: string[] = [];
  for (const [i, t] of lines.entries()) {
    if (had.has(t) || (t.startsWith("//") && lines[i - 1]?.startsWith("//"))) continue;
    const text = /(?:^|[\s;{}])(?:\/\*+|\/\/)\s*(.+?)\s*(?:\*\/.*)?$/.exec(t)?.[1]?.split(/(?<!\b(?:e\.g|i\.e))[.:;](?:\s|$)/)[0]?.trim();
    if (!text || text.length < 16 || !text.includes(" ") || /^(eslint|@ts-|prettier)/.test(text)) continue;
    out.push(text.length > 90 ? `${text.slice(0, 89).replace(/\s+\S*$/, "")}…` : text);
    if (out.length === 2) break;
  }
  return out;
}

/** Commits that touched a unit (spec sections share DESIGN.md, so they never claim its commits) */
const unitCommits = (def: UnitDef, log: Commit[]) => (def.kind === "spec" ? [] : log.filter((c) => c.files.some((f) => def.appPaths.includes(f))));

function evidence(def: UnitDef, unit: Unit, r: Readers, base: Pick<Baseline, "rev"> | null, log: Commit[]) {
  if (base && unit.app.exists && unit.app.changed && def.kind !== "spec") {
    const commits = unitCommits(def, log);
    unit.app.evidence.push(...commits.slice(0, 6).map((c) => cleanSubject(c.subject)));
    if (commits.length > 6) unit.app.evidence.push(`+${commits.length - 6} more commits`);
    if (!commits.length) unit.app.evidence.push("Uncommitted changes");
  }
  if (unit.app.added) unit.app.evidence.unshift("New since the sync point");
  if (unit.design.added) unit.design.evidence.unshift("New since the sync point");
  if (def.kind === "tokens") {
    for (const side of ["app", "design"] as const) {
      const s = unit[side];
      const b = side === "app" ? r.appBase : r.designBase;
      const n = side === "app" ? r.appNow : r.designNow;
      if (!s.changed || !b || !s.paths[0]) continue;
      const d = ruleDelta(b(s.paths[0]), n(s.paths[0]));
      const bits = [d.added && `${d.added} rule${d.added === 1 ? "" : "s"} added`, d.changed && `${d.changed} edited`, d.removed && `${d.removed} removed`].filter(Boolean);
      if (bits.length) s.evidence.push(bits.join(", "));
    }
  }
  if (def.kind === "component") {
    const appProps = propsOf(def.appPaths.map(r.appNow).join("\n"));
    const designProps = propsOf(def.designPaths.map(r.designNow).join("\n"));
    unit.app.props = appProps;
    unit.design.props = designProps;
    if (r.designBase && unit.design.changed && !unit.design.added) {
      const before = new Set(propsOf(def.designPaths.map(r.designBase).join("\n")));
      const gained = designProps.filter((p) => !before.has(p));
      if (gained.length) unit.design.evidence.push(`New props: ${gained.slice(0, 5).join(", ")}${gained.length > 5 ? "…" : ""}`);
      unit.design.evidence.push(...kitNotes(def.designPaths.map((p) => r.designBase!(p) ?? "").join("\n"), def.designPaths.map((p) => r.designNow(p) ?? "").join("\n")).map((n) => `Kit note: ${n}`));
    }
    if (unit.design.changed && !unit.design.evidence.length) unit.design.evidence.push("Kit source edited");
    if (unit.app.exists && unit.design.exists) {
      const onlyApp = appProps.filter((p) => !designProps.includes(p) && !["ref", "className", "style", "children"].includes(p));
      if (onlyApp.length && unit.app.changed) unit.app.evidence.push(`Props not in the kit: ${onlyApp.slice(0, 5).join(", ")}${onlyApp.length > 5 ? "…" : ""}`);
    }
  }
  if (def.kind === "card" && unit.design.changed) {
    const info = cardInfo(r.designNow(def.designPaths[0]!));
    const twins = def.designPaths.filter((p) => /-minimal/.test(p));
    const onlyTwin = !unit.design.added && !!r.designBase && twins.length > 0 && twins.every((p) => r.designBase!(p) == null) && def.designPaths.filter((p) => !twins.includes(p)).every((p) => r.designBase!(p) === r.designNow(p));
    unit.design.evidence.push(unit.design.added ? `New preview card “${info.name}”` : onlyTwin ? "Minimal twin added" : `Preview card “${info.name}” edited`);
  }
  if ((def.kind === "spec" || def.kind === "screen" || def.kind === "guideline") && unit.design.changed && !unit.design.evidence.length) unit.design.evidence.push(def.kind === "spec" ? "Spec text edited" : "Edited");
  if (def.kind === "spec" && unit.app.changed && !unit.app.evidence.some((e) => !e.startsWith("New"))) unit.app.evidence.push("DESIGN.md section edited");
}

export function featureStatus(units: Unit[]): UnitStatus {
  const app = units.some((u) => appMoved(u.status));
  const design = units.some((u) => designMoved(u.status));
  if (app && design) return "both";
  if (app) return units.every((u) => u.status === "app-only") ? "app-only" : "app-ahead";
  if (design) return units.every((u) => u.status === "design-only") ? "design-only" : "design-ahead";
  return units.some((u) => u.status === "unknown") ? "unknown" : "in-sync";
}

const DRIFT: UnitStatus[] = ["app-ahead", "design-ahead", "both", "app-only", "design-only"];
const AREA_TITLE: Record<string, string> = { core: "Core components", board: "Board", list: "List view", calendar: "Calendar", overlay: "Item overlay", navigation: "Navigation", project: "Projects", auth: "Sign-in & guests", settings: "Settings", tokens: "Tokens & themes", spec: "Design spec", screens: "UI kit screens", guidelines: "Guidelines", explorations: "Explorations" };

/** Group drifting units into features: App commits and Design preview cards, merged where they share a unit */
export function groupFeatures(defs: Map<string, UnitDef>, units: Unit[], base: SyncPoint | null, r: Readers, logFor: (unitId: string) => Commit[]): Feature[] {
  const drifting = units.filter((u) => DRIFT.includes(u.status) || (u.status === "unknown" && (u.app.changed || u.design.changed)));
  const ids = new Set(drifting.map((u) => u.id));
  /** `touched`: the units a commit group's commit itself changed (cards merged in later add units it didn't) */
  type Group = { title: string; source: Feature["source"]; units: Set<string>; appWork: Set<string>; designWork: Set<string>; touched?: Set<string> };
  const groups: Group[] = [];

  // App: one group per commit since the sync point
  if (base) {
    const byCommit = new Map<string, Group>();
    for (const u of drifting) {
      if (!u.app.changed) continue;
      for (const c of unitCommits(defs.get(u.id)!, logFor(u.id))) {
        const g = byCommit.get(c.hash) ?? { title: cleanSubject(c.subject), source: "commit" as const, units: new Set<string>(), appWork: new Set([cleanSubject(c.subject)]), designWork: new Set<string>(), touched: new Set<string>() };
        g.units.add(u.id);
        g.touched!.add(u.id);
        byCommit.set(c.hash, g);
      }
    }
    groups.push(...byCommit.values());
  }

  // Design: cards whose only change is a new Minimal twin are one piece of work
  const twinOnly = drifting.filter((u) => u.kind === "card" && u.design.evidence.includes("Minimal twin added"));
  if (twinOnly.length) groups.push({ title: `Minimal versions of ${twinOnly.length} preview card${twinOnly.length === 1 ? "" : "s"}`, source: "card", units: new Set(twinOnly.map((u) => u.id)), appWork: new Set(), designWork: new Set([`${twinOnly.length} Minimal twin card${twinOnly.length === 1 ? "" : "s"} added`]) });

  // Design: one group per changed preview card, with the changed components it shows
  for (const u of drifting) {
    if (u.kind !== "card" || !u.design.changed || twinOnly.includes(u)) continue;
    const info = cardInfo(r.designNow(u.design.paths[0]!));
    const g: Group = { title: info.name || u.name, source: "card", units: new Set([u.id]), appWork: new Set(), designWork: new Set([`Preview card “${info.name || u.name}”`]) };
    for (const name of info.uses) for (const v of drifting) if (v.kind === "component" && v.name === name && (v.design.changed || v.status === "design-only")) g.units.add(v.id);
    groups.push(g);
  }

  // A Design card and the App commits that touched the same (non-hub) units are one feature; commits
  // never merge with each other — each is its own piece of work.
  const degree = new Map<string, number>();
  for (const g of groups) for (const id of g.units) degree.set(id, (degree.get(id) ?? 0) + 1);
  const merged: Group[] = groups.filter((g) => g.source !== "card").map((g) => ({ ...g, units: new Set(g.units), appWork: new Set(g.appWork), designWork: new Set(g.designWork) }));
  for (const card of groups.filter((g) => g.source === "card")) {
    const shared = (g: Group) => [...card.units].filter((id) => id.startsWith("component:") && g.units.has(id) && (degree.get(id) ?? 0) <= 4).length;
    const best = merged.filter((g) => g.source === "commit" && shared(g) > 0).sort((a, b) => shared(b) / b.units.size - shared(a) / a.units.size || shared(b) - shared(a) || a.units.size - b.units.size)[0];
    if (!best) {
      merged.push({ ...card, units: new Set(card.units), appWork: new Set(), designWork: new Set(card.designWork) });
      continue;
    }
    for (const id of card.units) best.units.add(id);
    for (const w of card.designWork) best.designWork.add(w);
    Object.assign(best, { title: card.title, source: "card" });
  }

  // Every drifting unit belongs to exactly one feature: the smallest group that holds it
  const finals = merged;
  const assigned = new Map<string, Group>();
  for (const id of ids) {
    // a Design card names a whole feature, so it keeps its own components; otherwise the most specific group wins
    const holders = finals.filter((g) => g.units.has(id)).sort((a, b) => Number(b.source === "card") - Number(a.source === "card") || a.units.size - b.units.size);
    if (holders[0]) assigned.set(id, holders[0]);
  }

  // A spec section joins the feature that holds the component its edit names (the changed lines first, then
  // the whole section); otherwise it stands alone. Only PascalCase names count: modules like `text` are prose words too.
  const components = drifting.filter((u) => u.kind === "component" && /^[A-Z]/.test(u.name) && assigned.has(u.id));
  const mostNamed = (text: string) => components
    .map((v) => ({ v, at: text.search(new RegExp(`\\b${v.name}\\b`)), n: text.split(new RegExp(`\\b${v.name}\\b`)).length - 1 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.at - b.at)[0]?.v;
  for (const u of drifting) {
    if (u.kind !== "spec") continue;
    const def = defs.get(u.id)!;
    const sides = [[r.designNow, r.designBase, def.designPaths[0]], [r.appNow, r.appBase, def.appPaths[0]]] as const;
    const now = sides.map(([read, , p]) => (p ? sections(read(p)).get(u.name) ?? "" : ""));
    const changed = sides.map(([, was, p], i) => {
      const before = new Set(p && was ? (sections(was(p)).get(u.name) ?? "").split("\n") : []);
      return now[i]!.split("\n").filter((l) => !before.has(l)).join("\n");
    });
    const named = mostNamed(changed.join("\n")) ?? mostNamed(now.join("\n"));
    const home = named ? assigned.get(named.id)! : { title: u.name, source: "spec" as const, units: new Set<string>(), appWork: new Set<string>(), designWork: new Set<string>() };
    if (!named) finals.push(home);
    home.units.add(u.id);
    assigned.set(u.id, home);
  }

  for (const u of drifting) {
    if (assigned.has(u.id)) continue;
    const area = u.kind === "guideline" ? u.area.split("/")[0]! : u.area;
    const title = `${AREA_TITLE[area] ?? area}`;
    let g = finals.find((x) => x.source === "area" && x.title === title);
    if (!g) {
      g = { title, source: "area", units: new Set(), appWork: new Set(), designWork: new Set() };
      finals.push(g);
    }
    g.units.add(u.id);
    assigned.set(u.id, g);
  }

  const byId = new Map(units.map((u) => [u.id, u]));
  const features: Feature[] = [];
  for (const g of finals) {
    const own = [...g.units].filter((id) => assigned.get(id) === g).map((id) => byId.get(id)!).filter(Boolean);
    if (!own.length) continue;
    const status = featureStatus(own);
    // a feature can go wherever at least one of its parts can (reference-only parts never move)
    const ORDER: Direction[] = ["both", "app-to-design", "design-to-app", "skip"];
    const can = new Set(own.flatMap((u) => directionsFor(u.status, u.kind).directions));
    const directions = ORDER.filter((d) => can.has(d) || d === "skip");
    const suggested = directions.includes(directionsFor(status).suggested) ? directionsFor(status).suggested : (directions[0] ?? "skip");
    const kindOrder = ["component", "tokens", "card", "screen", "spec", "guideline"];
    own.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.name.localeCompare(b.name));
    // A commit names its feature only when it changed one of the parts the feature ended up with
    const namesake = !g.touched || own.some((u) => g.touched!.has(u.id));
    const title = namesake ? g.title : partsTitle(own);
    features.push({
      id: `f-${slug(title)}-${own[0]!.id.length.toString(36)}${own.length}`,
      title,
      source: namesake ? g.source : "parts",
      status,
      units: own,
      appWork: namesake ? [...g.appWork] : [],
      designWork: [...g.designWork, ...own.filter((u) => u.kind === "spec" && u.design.changed).map((u) => `Spec: ${u.name}`)],
      directions,
      suggested,
    });
  }
  const order: UnitStatus[] = ["both", "design-ahead", "design-only", "app-ahead", "app-only", "unknown", "in-sync"];
  return features.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.units.length - a.units.length || a.title.localeCompare(b.title));
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** The baseline a unit is compared against: its own when it was kept open, else the sync point's */
export const unitBaseline = (cmp: Pick<Comparison, "base">, u: Pick<Unit, "heldFrom">): Pick<Baseline, "rev" | "designSnapshot"> | null => u.heldFrom ?? cmp.base;

export function compare(ctx: Ctx, opts: { base: SyncPoint | null; snapshotId?: string | null }): Comparison {
  const snapshot = opts.snapshotId ? getSnapshot(ctx, opts.snapshotId) : latestSnapshot(ctx);
  const r = readersFor(ctx, opts.base, snapshot);
  // units kept open at the sync point compare against their own, older baseline (readers and commits per baseline)
  const held = opts.base?.held ?? {};
  const baseOf = (id: string): Pick<Baseline, "rev" | "designSnapshot"> | null => held[id] ?? opts.base;
  const memo = <T,>(make: (b: Pick<Baseline, "rev" | "designSnapshot">) => T) => {
    const m = new Map<string, T>();
    return (b: Pick<Baseline, "rev" | "designSnapshot">) => {
      const k = `${b.rev}|${b.designSnapshot}`;
      if (!m.has(k)) m.set(k, make(b));
      return m.get(k)!;
    };
  };
  const readersAt = memo((b) => readersFor(ctx, b, snapshot));
  const logAt = memo((b) => commitsAfter(ctx.repo, b.rev));
  const readersOf = (id: string) => (held[id] ? readersAt(held[id]) : r);
  const logOf = (id: string) => (baseOf(id) ? logAt(baseOf(id)!) : []);
  const designFiles = snapshot ? listFiles(snapshotFilesDir(ctx, snapshot.id)) : [];
  const defs = buildInventory(ctx, designFiles, r.designNow);
  const defMap = new Map(defs.map((d) => [d.id, d]));
  const carried = new Set(snapshot?.unpulled?.carried ?? []);
  const units: Unit[] = defs.map((def) => {
    const ur = readersOf(def.id);
    const app = sideState(def, "app", ur);
    const design = snapshot ? sideState(def, "design", ur) : { paths: def.designPaths, exists: false, changed: null, added: false, evidence: [] };
    const u: Unit = { id: def.id, kind: def.kind, area: def.area, name: def.name, app, design, status: "in-sync", mergeable: def.kind === "tokens", ...(held[def.id] ? { heldFrom: held[def.id] } : {}), ...(def.related ? { related: def.related } : {}), ...(def.preview ? { preview: def.preview } : {}) };
    u.status = statusOf(u);
    evidence(def, u, ur, baseOf(def.id), logOf(def.id));
    if (u.heldFrom) for (const s of [u.app, u.design]) if (s.changed) s.evidence.unshift(`Kept open since ${u.heldFrom.label}`);
    if (u.design.paths.some((p) => carried.has(p))) u.design.evidence.push(`Not pulled: compared as of ${snapshot?.unpulled?.from ?? "an earlier snapshot"}`);
    return u;
  });
  const counts = Object.fromEntries((["in-sync", "app-ahead", "design-ahead", "both", "app-only", "design-only", "unknown"] as UnitStatus[]).map((s) => [s, units.filter((u) => u.status === s).length])) as Record<UnitStatus, number>;
  return {
    base: opts.base,
    appRev: opts.base?.rev ?? "",
    appHead: head(ctx.repo),
    designSnapshot: snapshot,
    features: groupFeatures(defMap, units, opts.base, r, logOf),
    units,
    counts,
    generatedAt: new Date().toISOString(),
  };
}
