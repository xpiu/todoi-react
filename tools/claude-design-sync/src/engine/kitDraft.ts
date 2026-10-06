// The kit files a push needs that are mechanical, written by the tool instead of an AI:
// - for a component the kit doesn't have yet, a .d.ts contract (react-docgen's props), a .prompt.md usage
//   note and a preview card (one figure per story), all from the App's Storybook manifest; the AI refines
//   them and writes the .jsx;
// - every changed card's Minimal twin, after the AI's step: the card's edit is carried into the existing
//   twin by a three-way merge (keeping the twin's own Minimal tweaks), and a new card gets a fresh twin.
// Never overwrites a file the kit or the AI already wrote; the kit stays hand-authored, file by file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Ctx } from "./config";
import { listFiles, readText } from "./fsutil";
import { mergeText } from "./git";
import { isStoryFile } from "./inventory";
import { twinOf } from "./kit";
import type { ManifestComponent, ManifestProp, Storybook } from "./storybook";
import { componentFor } from "./storybook";
import type { Unit } from "./types";

/** Where a component lives in the kit: its existing .jsx, else the App's area and name */
export function kitHome(ctx: Ctx, u: Pick<Unit, "area" | "name" | "design">): { dir: string; name: string } {
  const jsx = u.design.paths.find((p) => p.endsWith(".jsx"));
  if (jsx) return { dir: dirname(jsx), name: jsx.replace(/^.*\//, "").replace(/\.jsx$/, "") };
  return { dir: `${ctx.config.design.componentRoot}/${u.area}`, name: u.name };
}

/**
 * The files the tool drafts from Storybook before a push's AI step: a component the kit lacks, whose App
 * side has stories, gets each of .d.ts, .prompt.md and card that `exists` says is missing. Pure, so the
 * brief (at plan time) and the run agree.
 */
export function plannedDrafts(ctx: Ctx, u: Unit, exists: (kitPath: string) => boolean): string[] {
  if (u.kind !== "component" || !ctx.config.app.storybook || !u.app.paths.some(isStoryFile)) return [];
  if (u.design.paths.some((p) => p.endsWith(".jsx"))) return [];
  const { dir, name } = kitHome(ctx, u);
  return [`${dir}/${name}.d.ts`, `${dir}/${name}.prompt.md`, `${dir}/${name.toLowerCase()}.card.html`].filter((p) => !exists(p));
}

const typeText = (t?: ManifestProp["tsType"] & { elements?: Array<ManifestProp["tsType"]> }): string => {
  if (!t) return "unknown";
  if (t.name === "Array" && t.elements?.[0]) return `Array<${typeText(t.elements[0])}>`;
  return t.raw ?? t.name;
};

export function draftContract(c: ManifestComponent): string {
  const d = c.reactDocgen;
  const props = Object.entries(d?.props ?? {});
  // one line per doc comment, as the kit's contracts write them
  const doc = (text: string, indent: string) => `${indent}/** ${text.replace(/\s+/g, " ").replace(/\*\//g, "*\\/")} */`;
  const about = d?.description?.trim().replace(/\s+/g, " ");
  const lines = [
    ...(about ? ["/**", ` * ${about}`, " */"] : []),
    `export interface ${c.name}Props {`,
    ...props.flatMap(([n, p]) => {
      const note = [p.description?.trim(), p.defaultValue && !/@default/.test(p.description ?? "") ? `@default ${p.defaultValue.value}` : ""].filter(Boolean).join(" ");
      return [...(note ? [doc(note, "  ")] : []), `  ${n}${p.required ? "" : "?"}: ${typeText(p.tsType)};`];
    }),
    "}",
    `export declare function ${c.name}(props: ${c.name}Props): JSX.Element;`,
  ];
  return lines.join("\n") + "\n";
}

/** A story's JSX: the snippet's body after `=>`, without the closing semicolon */
const storyJsx = (snippet: string) => snippet.slice(snippet.indexOf("=>") + 2).trim().replace(/;\s*$/, "");

export function draftUsage(c: ManifestComponent): string {
  const stories = c.stories.filter((s) => s.snippet);
  return [
    `# ${c.name}`,
    "",
    ...(c.reactDocgen?.description?.trim() ? [c.reactDocgen.description.trim(), ""] : []),
    "```jsx",
    ...stories.map((s) => storyJsx(s.snippet!)),
    "```",
    "",
  ].join("\n");
}

/** The <head> the kit's cards share, from an existing card in the project (its own <style> left out) */
function cardHead(projectDir: string, componentRoot: string): string {
  for (const p of listFiles(join(projectDir, componentRoot))) {
    if (!p.endsWith(".card.html") || /-minimal\.card\.html$/.test(p)) continue;
    const html = readFileSync(join(projectDir, componentRoot, p), "utf8");
    const end = html.indexOf("</head>");
    if (end > 0) return html.slice(html.indexOf("\n") + 1, end + "</head>".length).replace(/<style>[\s\S]*?<\/style>/g, "");
  }
  return '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../../styles.css">\n<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>\n<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>\n<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>\n<script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.min.js"></script>\n<script src="../../_ds_bundle.js"></script>\n</head>';
}

/**
 * A preview card with one labelled figure per story. Each story renders inside its own error boundary, so a
 * story that uses something the kit lacks shows the error in its figure (and the card check reports it)
 * while the others still render. `fn()` (Storybook's spy) becomes a no-op; `args` is empty.
 */
export function draftCard(c: ManifestComponent, head: string, namespace: string): string {
  const stories = c.stories.filter((s) => s.snippet);
  // two columns of stories, each at the component's own width
  const height = Math.min(900, 70 + Math.ceil(stories.length / 2) * 120);
  return `<!-- @dsCard group="Components" viewport="760x${height}" name="${c.name}" subtitle="${stories.map((s) => s.name).join(", ")}" -->
${head}<body style="margin:12px"><div id="root"></div>
<script type="text/babel">
const {${c.name}}=window.${namespace};
const fn=()=>()=>{};const args={};
const ERR={margin:0,font:"12px/1.4 var(--font-ui,system-ui,sans-serif)",color:"var(--danger,#c5221f)"};
function Render({story}){return story();}
class Story extends React.Component{constructor(p){super(p);this.state={error:null};}static getDerivedStateFromError(error){return {error};}render(){return <figure style={{margin:0,display:"grid",gap:6,alignContent:"start"}}><figcaption style={{font:"500 11px/1.4 var(--font-ui,system-ui,sans-serif)",color:"var(--ink-400,#707070)"}}>{this.props.name}</figcaption>{this.state.error?<p style={ERR}>{String(this.state.error.message)}</p>:<div><Render story={this.props.story}/></div>}</figure>;}}
function Demo(){if(typeof ${c.name}==="undefined")return <p style={ERR}>${c.name} isn't in the kit's bundle yet: its stories render once ${c.name}.jsx exports it.</p>;return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:"20px 24px"}}>
${stories.map((s) => `<Story name=${JSON.stringify(s.name)} story={()=>(${storyJsx(s.snippet!)})}/>`).join("\n")}
</div>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Demo/>);
</script></body></html>
`;
}

/** Write the planned drafts into the stage (never over a file that exists there); returns what it wrote */
export function writeDrafts(ctx: Ctx, sb: Storybook, u: Unit, stage: string): string[] {
  const planned = plannedDrafts(ctx, u, (p) => existsSync(join(stage, p)));
  const c = planned.length ? componentFor(sb, u.app.paths) : null;
  if (!c) return [];
  const manifest = readText(join(stage, "_ds_manifest.json"));
  const namespace = manifest ? (JSON.parse(manifest) as { namespace?: string }).namespace ?? "FlowboardDesignSystem_13419b" : "FlowboardDesignSystem_13419b";
  const out: string[] = [];
  for (const p of planned) {
    const text = p.endsWith(".d.ts") ? draftContract(c) : p.endsWith(".prompt.md") ? draftUsage(c) : c.stories.some((s) => s.snippet) ? draftCard(c, cardHead(stage, ctx.config.design.componentRoot), namespace) : null;
    if (text == null) continue;
    mkdirSync(dirname(join(stage, p)), { recursive: true });
    writeFileSync(join(stage, p), text);
    out.push(p);
  }
  return out;
}

export const twinPath = (card: string) => card.replace(/\.card\.html$/, "-minimal.card.html");

/**
 * Bring each changed card's Minimal twin along: a twin the AI didn't touch gets the card's edit replayed onto
 * it (base = the card before, ours = the twin, theirs = the card now), so its own Minimal tweaks stay; a
 * card without a twin gets a fresh one. `before` reads the snapshot the stage started from.
 */
export function syncTwins(stage: string, cards: string[], before: (path: string) => string | null): { written: string[]; conflicts: string[] } {
  const written: string[] = [];
  const conflicts: string[] = [];
  for (const card of cards) {
    if (!card.endsWith(".card.html") || /-minimal\.card\.html$/.test(card)) continue;
    const twin = twinPath(card);
    const now = readText(join(stage, card));
    if (now == null) continue;
    const twinNow = readText(join(stage, twin));
    const twinBefore = before(twin);
    // the AI (or a person) already edited the twin: leave it
    if (twinNow != null && twinBefore != null && twinNow !== twinBefore) continue;
    const cardBefore = before(card);
    let text: string;
    if (twinNow == null || cardBefore == null) text = twinOf(now);
    else {
      const r = mergeText(cardBefore, twinNow, now);
      if (r.conflicts) {
        conflicts.push(twin);
        continue;
      }
      text = r.text;
    }
    if (text === twinNow) continue;
    writeFileSync(join(stage, twin), text);
    written.push(twin);
  }
  return { written, conflicts };
}
