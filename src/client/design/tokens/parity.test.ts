// Theme-parity audit (DESIGN.md › Themes × modes, "keep it green"): every colour / shadow token is
// defined in all four theme × mode scopes, the token SET is identical between themes, no scope declares
// a token the others lack, and component CSS never carries a raw hex or a bare z-index.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
/** CSS variables Base UI writes on its positioner / popup elements. */
const BASE_UI_VARS = new Set(["transform-origin", "anchor-width", "anchor-height", "available-width", "available-height", "positioner-width", "positioner-height", "popup-width", "popup-height"]);
const read = (p: string) => readFileSync(join(here, p), "utf8");

/** All `--name: value` declarations inside a `selector{…}` block of a stylesheet. */
function tokensInScope(css: string, selectorStart: string): Set<string> {
  const start = css.indexOf(selectorStart);
  if (start < 0) throw new Error(`scope not found: ${selectorStart}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Set([...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

const standard = read("themes/standard.css");
const minimal = read("themes/minimal.css");
const SCOPES = {
  "standard dark": tokensInScope(standard, ":root,[data-theme=\"standard\"]"),
  "standard light": tokensInScope(standard, '[data-theme="standard"][data-mode="light"]'),
  "minimal dark": tokensInScope(minimal, '[data-theme="minimal"]{'),
  "minimal light": tokensInScope(minimal, '[data-theme="minimal"][data-mode="light"]'),
};

describe("theme parity", () => {
  const names = Object.keys(SCOPES) as Array<keyof typeof SCOPES>;
  const union = new Set(names.flatMap((n) => [...SCOPES[n]]));

  it("defines a sensible number of tokens", () => {
    expect(union.size).toBeGreaterThan(50);
  });

  for (const n of names) {
    it(`${n} defines every token (no missing values, no orphans)`, () => {
      const missing = [...union].filter((t) => !SCOPES[n].has(t));
      expect(missing, `missing in ${n}`).toEqual([]);
    });
  }

  it("fixed-ink tokens live only in colors.css and are marked", () => {
    const colors = read("colors.css");
    const fixed = [...colors.matchAll(/--([a-z0-9-]+):[^;]*\/\*fixed\*\//g)].map((m) => m[1]!);
    expect(fixed).toContain("chrome-selected-text");
    for (const t of fixed) expect(union.has(t), `${t} should not be redefined per scope`).toBe(false);
  });
});

describe("component CSS adherence", () => {
  const root = join(here, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        if (f !== "tokens") walk(p);
      } else if (f.endsWith(".css")) files.push(p);
    }
  };
  walk(root);

  it("has component stylesheets to audit", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("uses no raw hex colours, bare z-index values or @media rules", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (/#[0-9a-fA-F]{3,8}\b/.test(css)) offenders.push(`${f}: hex`);
      if (/z-index\s*:\s*-?\d/.test(css)) offenders.push(`${f}: z-index`);
      if (/@media/.test(css)) offenders.push(`${f}: @media`);
    }
    expect(offenders).toEqual([]);
  });

  it("references only tokens that exist", () => {
    const defined = new Set<string>();
    for (const f of ["colors.css", "typography.css", "spacing.css", "radius.css", "elevation.css", "motion.css", "themes/standard.css", "themes/minimal.css"]) {
      for (const m of read(f).matchAll(/--([a-z0-9-]+)\s*:/g)) defined.add(m[1]!);
    }
    const unknown = new Set<string>();
    for (const f of files) {
      const css = readFileSync(f, "utf8");
      for (const m of css.matchAll(/var\(--([a-z0-9-]+)/g)) {
        const t = m[1]!;
        // Component-local custom properties start with td-; Base UI sets the positioner variables.
        if (!t.startsWith("td-") && !BASE_UI_VARS.has(t) && !defined.has(t)) unknown.add(`${t} (${f.split("/").pop()})`);
      }
    }
    expect([...unknown]).toEqual([]);
  });
});
