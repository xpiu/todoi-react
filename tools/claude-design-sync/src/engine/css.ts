// Deterministic three-way merge for token CSS, the one place both sides speak the same language.
// One side's changes since the sync point (sourceBase → sourceNow) are replayed onto the other
// side's current file (target): added rules land after the same neighbour, removed rules go only
// when the target still has them unedited, and edited rules merge property by property.

export interface Stmt {
  /** Selector (or at-rule prelude) for rules; the comment text for comments */
  key: string;
  /** Trimmed statement text */
  text: string;
  kind: "rule" | "comment" | "other";
  /** Whitespace before the statement in its file (kept so merges never reformat the target) */
  lead?: string;
}

/** Split a stylesheet into top-level statements (rules, at-rule blocks, comments) */
export function parseCss(css: string): Stmt[] {
  const out: Stmt[] = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    const ws = i;
    while (i < n && /\s/.test(css[i]!)) i++;
    if (i >= n) break;
    const start = i;
    const lead = css.slice(ws, start);
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      const text = css.slice(start, i).trim();
      out.push({ key: `comment:${text}`, text, kind: "comment", lead });
      continue;
    }
    let depth = 0;
    let quote: string | null = null;
    while (i < n) {
      const c = css[i]!;
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (css.startsWith("/*", i)) {
        const end = css.indexOf("*/", i + 2);
        i = end < 0 ? n : end + 1;
      } else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth <= 0) {
          i++;
          break;
        }
      } else if (c === ";" && depth === 0) {
        i++;
        break;
      }
      i++;
    }
    const text = css.slice(start, i).trim();
    const brace = text.indexOf("{");
    const key = (brace < 0 ? text : text.slice(0, brace)).replace(/\s+/g, " ").trim();
    out.push({ key, text, kind: brace < 0 ? "other" : "rule", lead });
  }
  return out;
}

const bodyOf = (rule: string) => rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));
const isNested = (rule: string) => /\{[^}]*\{/.test(rule.slice(rule.indexOf("{")));

/** Declarations of a flat rule, in order: [property, full declaration text] */
export function declarations(rule: string): Array<[string, string]> {
  const body = bodyOf(rule);
  const out: Array<[string, string]> = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (body.startsWith("/*", i)) {
      const end = body.indexOf("*/", i + 2);
      cur += body.slice(i, end < 0 ? body.length : end + 2);
      i = end < 0 ? body.length : end + 1;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ";" && depth === 0) {
      push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  push(cur);
  return out;
  function push(d: string) {
    const t = d.trim();
    if (!t) return;
    const prop = t.replace(/^\/\*[\s\S]*?\*\/\s*/, "").split(":")[0]!.trim();
    out.push([prop, t]);
  }
}

function rebuildRule(selector: string, decls: Array<[string, string]>, sample: string): string {
  const multiline = /\{\s*\n/.test(sample);
  if (!multiline) return `${selector}{${decls.map((d) => d[1]).join(";")}}`;
  return `${selector}{\n${decls.map((d) => d[1]).join(";\n")};\n}`;
}

export interface MergeResult {
  text: string;
  added: number;
  removed: number;
  updated: number;
  /** Changes the target had already edited differently; left as the target has them */
  conflicts: string[];
}

export function mergeCss(sourceBase: string, sourceNow: string, target: string): MergeResult {
  const b = parseCss(sourceBase);
  const s = parseCss(sourceNow);
  const t = parseCss(target);
  const bByKey = new Map(b.map((x) => [x.key, x]));
  const sKeys = new Set(s.map((x) => x.key));
  const result: Stmt[] = [...t];
  const indexOfKey = (k: string) => result.findIndex((x) => x.key === k);
  let added = 0;
  let removed = 0;
  let updated = 0;
  const conflicts: string[] = [];

  // Removals: in base, gone from source now
  for (const old of b) {
    if (sKeys.has(old.key)) continue;
    const at = indexOfKey(old.key);
    if (at < 0) continue;
    if (result[at]!.text === old.text) {
      result.splice(at, 1);
      removed++;
    } else conflicts.push(`kept "${old.key}": removed on one side, edited on the other`);
  }

  // Additions and edits, walking the source in order so anchors resolve
  let anchor: string | null = null;
  for (const cur of s) {
    const was = bByKey.get(cur.key);
    if (was && was.text === cur.text) {
      anchor = cur.key;
      continue;
    }
    const at = indexOfKey(cur.key);
    if (!was) {
      if (at >= 0) {
        if (result[at]!.text !== cur.text) conflicts.push(`kept "${cur.key}": added on both sides with different content`);
      } else {
        const after = anchor ? indexOfKey(anchor) : -1;
        const pos = anchor === null ? 0 : after >= 0 ? after + 1 : result.length;
        result.splice(pos, 0, { ...cur, lead: pos === 0 ? "" : "\n" });
        added++;
      }
      anchor = cur.key;
      continue;
    }
    // edited since base
    if (at < 0) {
      conflicts.push(`skipped "${cur.key}": edited on one side, removed on the other`);
    } else if (result[at]!.text === was.text) {
      result[at] = { ...cur, lead: result[at]!.lead };
      updated++;
    } else if (cur.kind === "rule" && !isNested(cur.text) && !isNested(result[at]!.text)) {
      // both edited: merge declaration by declaration
      const baseD = new Map(declarations(was.text));
      const srcD = declarations(cur.text);
      const srcMap = new Map(srcD);
      const tgt = declarations(result[at]!.text);
      const tgtMap = new Map(tgt);
      const merged = [...tgt];
      let changed = false;
      for (const [p, d] of srcD) {
        if (baseD.get(p) === d) continue;
        if (!tgtMap.has(p)) {
          merged.push([p, d]);
          changed = true;
        } else if (tgtMap.get(p) === baseD.get(p)) {
          merged[merged.findIndex((x) => x[0] === p)] = [p, d];
          changed = true;
        } else if (tgtMap.get(p) !== d) conflicts.push(`kept ${p} in "${cur.key}": changed differently on both sides`);
      }
      for (const [p, d] of baseD) {
        if (srcMap.has(p)) continue;
        const k = merged.findIndex((x) => x[0] === p);
        if (k >= 0 && merged[k]![1] === d) {
          merged.splice(k, 1);
          changed = true;
        }
      }
      if (changed) {
        result[at] = { ...cur, lead: result[at]!.lead, text: rebuildRule(cur.key, merged, result[at]!.text) };
        updated++;
      }
    } else if (result[at]!.text !== cur.text) conflicts.push(`kept "${cur.key}": edited differently on both sides`);
    anchor = cur.key;
  }

  return { text: joinCss(result, target), added, removed, updated, conflicts };
}

/** Rules present in `now` that were not in `base` (count) — evidence for the UI */
export function ruleDelta(base: string | null, now: string | null): { added: number; removed: number; changed: number } {
  const b = new Map(parseCss(base ?? "").map((x) => [x.key, x.text]));
  const n = new Map(parseCss(now ?? "").map((x) => [x.key, x.text]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [k, v] of n) {
    if (!b.has(k)) added++;
    else if (b.get(k) !== v) changed++;
  }
  for (const k of b.keys()) if (!n.has(k)) removed++;
  return { added, removed, changed };
}

function joinCss(stmts: Stmt[], sample: string): string {
  const body = stmts.map((x, i) => (i === 0 ? (x.lead ?? "") : x.lead || "\n") + x.text).join("");
  return body + (sample.endsWith("\n") ? "\n" : "");
}
