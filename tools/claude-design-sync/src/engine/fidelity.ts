// A port from the kit into the App is a draft. `npm run check` proves it compiles, lints and passes tests,
// not that it kept the App's architecture: an AI translating React 18 mockups can swap a Base UI primitive
// for a div, stop forwarding refs, drop ARIA, or subscribe to a whole Zustand store and still pass. This
// reads the draft's diff for exactly those regressions, deterministically, so the review starts from them.
import type { FidelityFinding } from "./approvals";
import { git, showAt } from "./git";

export type { FidelityFinding, FidelityRule } from "./approvals";

const SOURCE = /\.(tsx|ts)$/;
const TEST = /\.(test|spec|stories)\.tsx?$/;

/** Named Base UI parts a file imports: `Menu` from "@base-ui/react/menu", `* as Popover`, … */
export function baseUiParts(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/import\s+(?:type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']@base-ui\/react(?:\/([\w-]+))?["']/g)) {
    const what = m[1]!;
    if (what.startsWith("{")) for (const n of what.slice(1, -1).split(",")) {
      const name = n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (name) out.add(name);
    }
    else out.add(what.replace(/^\*\s+as\s+/, "").trim());
  }
  return out;
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
/** `ref={…}`, `ref,` / `ref }` in a destructure, `ref?:` in a type, forwardRef, render props */
const FORWARDING = /\bref\s*=\s*\{|\bref\s*\??:|[{,]\s*ref\s*[,}]|\bforwardRef\b|\brender\s*=\s*\{|\brender\s*\??:/g;
const ARIA = /\baria-[a-z]+\s*=|\brole\s*=/g;
/** A Zustand hook called with nothing: the component re-renders on every change to the store */
const WHOLE_STORE = /\buse[A-Z]\w*Store\(\s*\)/g;
/** A click handler on an element that isn't interactive, without a role to make it one */
const CLICK_TARGET = /<(div|span|li|p|section|article)\b(?![^>]*\brole=)[^>]*\bonClick=/g;

/** Lines the draft added (whole-file comparison; good enough for counting new patterns) */
const added = (before: string, after: string) => {
  const was = new Set(before.split("\n").map((l) => l.trim()));
  return after.split("\n").filter((l) => !was.has(l.trim())).join("\n");
};

/** Review one file's before/after text */
export function reviewFile(file: string, before: string, after: string): FidelityFinding[] {
  const out: FidelityFinding[] = [];
  if (!SOURCE.test(file) || TEST.test(file)) return out;
  const lost = [...baseUiParts(before)].filter((p) => !baseUiParts(after).has(p));
  if (lost.length) out.push({ rule: "base-ui", file, detail: `No longer imports Base UI ${lost.join(", ")}: check the behaviour it gave (focus, dismissal, keyboard) still exists` });
  const [fb, fa] = [count(before, FORWARDING), count(after, FORWARDING)];
  if (fa < fb) out.push({ rule: "forwarding", file, detail: `Forwards fewer refs or render props (${fb} → ${fa})` });
  const [ab, aa] = [count(before, ARIA), count(after, ARIA)];
  if (aa < ab) out.push({ rule: "aria", file, detail: `Fewer roles and ARIA attributes (${ab} → ${aa})` });
  const fresh = added(before, after);
  for (const m of new Set(fresh.match(WHOLE_STORE) ?? [])) out.push({ rule: "store", file, detail: `${m} reads the whole store, so the component re-renders on any change: select the fields it uses` });
  for (const m of fresh.matchAll(CLICK_TARGET)) out.push({ rule: "click-target", file, detail: `A <${m[1]}> with onClick and no role: use a button (or Base UI), or add a role and keyboard handling` });
  return out;
}

/** Review a draft branch: every App source file it changed between `base` and `head` */
export function reviewDraft(repo: string, base: string, head: string): FidelityFinding[] {
  const files = git(repo, ["diff", "--name-only", `${base}..${head}`]).split("\n").filter(Boolean);
  const out: FidelityFinding[] = [];
  for (const f of files) out.push(...reviewFile(f, showAt(repo, base, f) ?? "", showAt(repo, head, f) ?? ""));
  // a component whose behaviour changed while its stories stayed put: Storybook no longer shows what ships
  for (const f of files.filter((x) => /\.tsx$/.test(x) && !TEST.test(x))) {
    const stories = [".stories.tsx", ".stories.ts"].map((s) => f.replace(/\.tsx$/, s)).find((s) => showAt(repo, head, s) != null);
    if (stories && !files.includes(stories)) out.push({ rule: "story", file: f, detail: `${stories.split("/").pop()} wasn't updated with it` });
  }
  return out;
}
