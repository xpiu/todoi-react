// Stands in for `storybook build` in the fixture world (which has no Storybook install): reads the repo's
// *.stories.tsx files and writes what a real static build offers the tool, in the same shapes:
// manifests/components.json (props, story snippets), index.json, and an iframe.html that renders one story
// (?id=…&globals=theme:minimal;mode:light) as plain text, so screenshots have something to show.
// Usage (from the repo root): node fake-storybook.mjs <out>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const out = process.argv[2];
const root = process.cwd();
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const components = {};
const entries = {};
for (const file of walk(join(root, "src/client/design")).filter((f) => /\.stories\.tsx$/.test(f))) {
  const name = file.replace(/^.*\//, "").replace(/\.stories\.tsx$/, "");
  const area = relative(join(root, "src/client/design"), file).split("/")[0];
  const id = `${area}-${name.toLowerCase()}`;
  const source = readFileSync(file.replace(/\.stories\.tsx$/, ".tsx"), "utf8");
  const props = {};
  for (const m of source.matchAll(/^\s+(\w+)(\?)?:\s*([^;]+);/gm)) props[m[1]] = { required: !m[2], tsType: { name: m[3].trim() }, description: "" };
  const stories = [...readFileSync(file, "utf8").matchAll(/export const (\w+)\s*=/g)].map((m) => ({
    id: `${id}--${kebab(m[1])}`,
    name: m[1].replace(/([a-z])([A-Z])/g, "$1 $2"),
    snippet: `const ${m[1]} = () => <${name} onClick={fn()} />;`,
  }));
  components[id] = { id, name, path: `./${relative(root, file)}`, stories, reactDocgen: { description: `${name}, as the App ships it.`, definedInFile: join(root, relative(root, file).replace(/\.stories\.tsx$/, ".tsx")), props } };
  for (const s of stories) entries[s.id] = { type: "story", id: s.id, name: s.name, title: `${area}/${name}`, importPath: components[id].path, componentPath: components[id].path.replace(/\.stories\.tsx$/, ".tsx") };
}

mkdirSync(join(out, "manifests"), { recursive: true });
writeFileSync(join(out, "manifests", "components.json"), JSON.stringify({ v: 0, components }, null, 1));
writeFileSync(join(out, "index.json"), JSON.stringify({ v: 5, entries }, null, 1));
writeFileSync(
  join(out, "iframe.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:13px/1.4 system-ui}html[data-theme=minimal] .story{border-radius:0}.story{display:inline-block;margin:16px;padding:10px 14px;border:1px solid #888;border-radius:7px}</style></head><body><div id="storybook-root"></div><script>
const q=new URLSearchParams(location.search);const g=Object.fromEntries((q.get("globals")||"").split(";").filter(Boolean).map(p=>p.split(":")));
document.documentElement.dataset.theme=g.theme||"rounded";document.documentElement.dataset.mode=g.mode||"light";
document.getElementById("storybook-root").innerHTML='<span class="story">App story '+q.get("id")+' · '+(g.theme||"rounded")+'</span>';
</script></body></html>
`,
);
