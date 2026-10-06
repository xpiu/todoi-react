// Kit tooling: build a local stand-in for Claude Design's component bundle, write Minimal twins of
// preview cards, and render cards in Chromium to catch errors before anything is uploaded.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, resolve } from "node:path";

import { TOOL_DIR } from "./config";
import { fileWithin, listFiles } from "./fsutil";

/** Minimal twin = html theme/mode attrs, " · Minimal" group and name, square corners and hairline rings in the card's style */
export function twinOf(card: string): string {
  const nl = card.indexOf("\n");
  let head = card.slice(0, nl);
  let rest = card.slice(nl + 1);
  head = head.replace(/group="([^"]*)"/, (_, g) => `group="${g} · Minimal"`).replace(/name="([^"]*)"/, (_, n) => `name="${n} · Minimal"`).replace(/subtitle="([^"]*)"/, (_, s) => `subtitle="Minimal theme (light) — ${s}"`);
  rest = rest.replace("<html>", '<html data-mode="light" data-theme="minimal">');
  const i = rest.indexOf("<style>");
  const j = rest.indexOf("</style>", i);
  if (i >= 0 && j > i) rest = rest.slice(0, i) + rest.slice(i, j).replaceAll("border-radius:var(--radius-lg,7px)", "border-radius:0").replaceAll("box-shadow:var(--shadow-card)", "box-shadow:0 0 0 1px var(--border-divider)") + rest.slice(j);
  return `${head}\n${rest}`;
}

export function writeTwin(cardPath: string, out?: string): string {
  const dest = out ?? cardPath.replace(/\.card\.html$/, "-minimal.card.html");
  writeFileSync(dest, twinOf(readFileSync(cardPath, "utf8")));
  return dest;
}

/** Every components/**\/*.jsx with all exports on window.<namespace> — previews only, never uploaded */
export async function buildBundle(projectDir: string): Promise<string> {
  const root = resolve(projectDir);
  const { build } = await import("esbuild");
  const manifest = join(root, "_ds_manifest.json");
  const ns = existsSync(manifest) ? (JSON.parse(readFileSync(manifest, "utf8")) as { namespace: string }).namespace : "FlowboardDesignSystem_13419b";
  const files = listFiles(join(root, "components")).filter((f) => f.endsWith(".jsx"));
  const entry = files.map((f, i) => `import * as m${i} from "./components/${f}";`).join("\n") + `\nconst ns = (window.${ns} = window.${ns} || {});\n` + files.map((_, i) => `Object.assign(ns, m${i});`).join("\n");
  await build({
    stdin: { contents: entry, resolveDir: root, loader: "js" },
    bundle: true,
    format: "iife",
    outfile: join(root, "_ds_bundle.js"),
    loader: { ".jsx": "jsx" },
    jsx: "transform",
    // the repo's tsconfig would switch JSX to React 19's automatic runtime; cards load React 18 UMD
    tsconfigRaw: "{}",
    logLevel: "silent",
    plugins: [
      {
        name: "react-globals",
        setup(b) {
          b.onResolve({ filter: /^react(-dom)?$/ }, (a) => ({ path: a.path, namespace: "g" }));
          b.onLoad({ filter: /.*/, namespace: "g" }, (a) => ({ contents: `module.exports = window.${a.path === "react" ? "React" : "ReactDOM"};`, loader: "js" }));
        },
      },
    ],
  });
  return `bundled ${files.length} components → _ds_bundle.js (${ns})`;
}

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png" };

/** A kit file, or — for binary assets a pull skips — the App's identical copy (config design.assetFallbacks) */
export function resolveKitFile(root: string, rel: string, fallbacks: Record<string, string> = {}, repo?: string): string | null {
  const p = fileWithin(root, rel);
  if (p) return p;
  for (const [prefix, to] of Object.entries(fallbacks)) {
    if (!repo || !rel.startsWith(prefix)) continue;
    const alt = fileWithin(resolve(repo, to), rel.slice(prefix.length));
    if (alt) return alt;
  }
  return null;
}

/** Serve a project folder on a free localhost port */
export function serveDir(dir: string, fallbacks?: Record<string, string>, repo?: string): Promise<{ url: string; server: Server }> {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const p = resolveKitFile(root, decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\//, ""), fallbacks, repo);
    if (!p) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server })));
}

const CDN_DIR = () => join(process.env.CDS_STATE ?? join(TOOL_DIR, ".state"), "cdn");
const cdnFile = (u: string) => join(CDN_DIR(), u.replace("https://unpkg.com/", "").replace(/[/@]/g, "_"));

export interface CardCheck {
  card: string;
  errors: string[];
  screenshot?: string;
}

/** Render cards in Chromium (CDN scripts cached locally — unpkg times out) and report page/console errors */
export async function checkCards(projectDir: string, cards: string[], shotsDir?: string, assets?: { fallbacks?: Record<string, string>; repo?: string }): Promise<CardCheck[]> {
  const { chromium } = await import("@playwright/test");
  mkdirSync(CDN_DIR(), { recursive: true });
  const { url, server } = await serveDir(projectDir, assets?.fallbacks, assets?.repo);
  const out: CardCheck[] = [];
  try {
    const browser = await chromium.launch();
    try {
      for (const card of cards) {
        const html = readFileSync(join(projectDir, card), "utf8");
        const [, w = "1000", h = "600"] = /viewport="(\d+)x(\d+)"/.exec(html) ?? [];
        const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]!));
        page.on("console", (m) => {
          // missing files are reported once, with their URL, by the response listener below
          if (m.type() === "error" && !/favicon|DevTools|Failed to load resource/.test(m.text())) errors.push(m.text().split("\n")[0]!.slice(0, 200));
        });
        page.on("response", (r) => {
          if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`${r.status()} ${r.url().replace(url + "/", "")}`);
        });
        await page.route("https://unpkg.com/**", async (route) => {
          const f = cdnFile(route.request().url());
          if (!existsSync(f)) {
            const res = await fetch(route.request().url()).catch(() => null);
            if (res?.ok) writeFileSync(f, Buffer.from(await res.arrayBuffer()));
          }
          if (existsSync(f)) await route.fulfill({ path: f, contentType: "application/javascript" });
          else await route.continue();
        });
        await page.goto(`${url}/${card}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(700);
        if (await page.evaluate(() => (document.getElementById("root")?.children.length ?? 1) === 0)) errors.push("The card rendered nothing");
        let screenshot: string | undefined;
        if (shotsDir) {
          mkdirSync(shotsDir, { recursive: true });
          screenshot = join(shotsDir, card.replace(/\//g, "__") + ".png");
          await page.screenshot({ path: screenshot });
        }
        out.push({ card, errors, screenshot });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return out;
}
