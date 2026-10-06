// Pictures instead of a React 18 vs React 19 text diff: the App's component as its Storybook stories render
// it, beside the kit's preview cards that show the same component, in both themes. Rounded pairs a story at
// theme:rounded with a card (which renders Rounded without attributes), Minimal pairs theme:minimal with the
// card's Minimal twin; both modes follow the kit's cards (Rounded dark, Minimal light).
// Shots are cached by the Storybook build, the snapshot and the unit, under .state/visual/<key>/.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Ctx } from "./config";
import { hash, listFiles, readText } from "./fsutil";
import { cardInfo } from "./inventory";
import { buildBundle, checkCards, serveDir } from "./kit";
import { kitHome, twinPath } from "./kitDraft";
import { snapshotFilesDir } from "./snapshots";
import { componentFor, storybook } from "./storybook";
import type { Unit } from "./types";

export type Theme = "rounded" | "minimal";

export interface Shot {
  theme: Theme;
  /** Story name, or the card's name */
  label: string;
  /** File name under the comparison's folder */
  file: string;
  /** Size in CSS pixels: shots are taken at 2× and shown 1:1, so both sides compare at the same scale */
  width: number;
  height: number;
  /** Cards: how many times the card renders the component */
  shows?: number;
  /** What went wrong rendering it, when something did */
  errors?: string[];
}

export interface VisualComparison {
  key: string;
  app: Shot[];
  design: Shot[];
  /** Why a side has no pictures (no stories, no card shows the component, no Storybook configured) */
  notes: { app?: string; design?: string };
}

/** How many stories and cards a comparison shows: enough to judge, few enough to read */
const MAX = 4;
const SCALE = 2;

/** A PNG's size in CSS pixels (its IHDR width and height over the device scale) */
const cssSize = (png: string) => {
  const b = readFileSync(png);
  return { width: Math.round(b.readUInt32BE(16) / SCALE), height: Math.round(b.readUInt32BE(20) / SCALE) };
};

/** Kit cards that show a component, the ones that show it most first (its own card, then the card that renders it most often) */
export function cardsShowing(snapDir: string, componentRoot: string, name: string): Array<{ path: string; shows: number }> {
  const tag = new RegExp(`<${name}\\b`, "g");
  return listFiles(join(snapDir, componentRoot))
    .filter((p) => p.endsWith(".card.html") && !/-minimal\.card\.html$/.test(p))
    .map((p) => {
      const html = readText(join(snapDir, componentRoot, p)) ?? "";
      return { path: `${componentRoot}/${p}`, own: p.endsWith(`/${name.toLowerCase()}.card.html`), uses: cardInfo(html).uses, shows: (html.match(tag) ?? []).length };
    })
    .filter((c) => c.uses.includes(name) && c.shows > 0)
    .sort((a, b) => Number(b.own) - Number(a.own) || b.shows - a.shows || a.uses.length - b.uses.length || a.path.localeCompare(b.path))
    .slice(0, MAX)
    .map(({ path, shows }) => ({ path, shows }));
}

const inFlight = new Map<string, Promise<VisualComparison>>();

/** Pictures of one component on both sides; concurrent requests for the same comparison share one render */
export function visualCompare(ctx: Ctx, snapshotId: string, unit: Unit, signal?: AbortSignal): Promise<VisualComparison> {
  const run = async (): Promise<VisualComparison> => {
    const sb = await storybook(ctx, signal);
    const key = hash([sb?.dir ?? "no-storybook", snapshotId, unit.id].join("|"))!;
    const dir = join(ctx.state, "visual", key);
    const done = join(dir, "comparison.json");
    if (existsSync(done)) return JSON.parse(readFileSync(done, "utf8")) as VisualComparison;
    const pending = inFlight.get(key);
    if (pending) return pending;
    const work = (async () => {
      mkdirSync(dir, { recursive: true });
      const out: VisualComparison = { key, app: [], design: [], notes: {} };

      // the App: each story alone, in Storybook's own frame, per theme
      const component = sb ? componentFor(sb, unit.app.paths) : null;
      if (!sb) out.notes.app = "No Storybook is configured (app.storybook in config.json).";
      else if (!component) out.notes.app = "This component has no stories, so there's nothing of the App's to picture.";
      else {
        const { chromium } = await import("@playwright/test");
        const { url, server } = await serveDir(sb.dir);
        const browser = await chromium.launch();
        try {
          for (const story of component.stories.slice(0, MAX)) {
            for (const theme of ["rounded", "minimal"] as Theme[]) {
              const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: SCALE });
              const errors: string[] = [];
              page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]!));
              await page.goto(`${url}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`theme:${theme};mode:${theme === "rounded" ? "dark" : "light"}`)}`, { waitUntil: "networkidle" });
              await page.waitForTimeout(400);
              const file = `app-${story.id.replace(/[^\w-]/g, "_")}-${theme}.png`;
              // crop to what the story drew (the root itself spans the page), with a little air
              const box = await page.evaluate(() => {
                // step through wrappers as wide as their parent (the root, the preview's <main>) to what the story drew
                let n = document.querySelector("#storybook-root");
                while (n && n.children.length === 1 && n.children[0]!.getBoundingClientRect().width >= n.getBoundingClientRect().width - 1) n = n.children[0]!;
                if (!n) return null;
                // popups (dialogs, menus, popovers) render in portals outside the root: they count too
                const portals = [...document.body.children].filter((e) => e.id !== "storybook-root" && !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(e.tagName) && !e.contains(document.querySelector("#storybook-root")));
                // a portal's own box may be empty (display: contents, fixed children): measure what it holds
                const inPortals = portals.flatMap((p) => [p, ...p.querySelectorAll("*")]);
                const els = [...(n.children.length ? [...n.children] : [n]), ...inPortals].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 1 && r.height > 1);
                if (!els.length) return null;
                const x = Math.min(...els.map((r) => r.left)), y = Math.min(...els.map((r) => r.top));
                return { x, y, width: Math.max(...els.map((r) => r.right)) - x, height: Math.max(...els.map((r) => r.bottom)) - y };
              });
              const pad = 8;
              if (box) await page.screenshot({ path: join(dir, file), clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } });
              else await page.screenshot({ path: join(dir, file) });
              out.app.push({ theme, label: story.name, file, ...cssSize(join(dir, file)), ...(errors.length ? { errors } : {}) });
              await page.close();
            }
          }
        } finally {
          await browser.close();
          await new Promise<void>((ok) => server.close(() => ok()));
        }
      }

      // Design: the cards that show the component, and their Minimal twins
      const snapDir = snapshotFilesDir(ctx, snapshotId);
      const name = kitHome(ctx, unit).name;
      const cards = cardsShowing(snapDir, ctx.config.design.componentRoot, name);
      if (!cards.length) out.notes.design = `No preview card in the kit renders <${name}> directly.`;
      else {
        const shots = join(dir, "cards");
        const shows = new Map(cards.flatMap((c) => [[c.path, c.shows], [twinPath(c.path), c.shows]] as const));
        const twins = cards.map((c) => twinPath(c.path)).filter((t) => existsSync(join(snapDir, t)));
        // pulls leave the generated bundle out; cards need the local stand-in, as the /kit previews do
        if (!existsSync(join(snapDir, "_ds_bundle.js"))) await buildBundle(snapDir);
        const checked = await checkCards(snapDir, [...cards.map((c) => c.path), ...twins], shots, { fallbacks: ctx.config.design.assetFallbacks, repo: ctx.repo }, SCALE);
        for (const c of checked) {
          if (!c.screenshot) continue;
          const file = `design-${c.card.replace(/[^\w.-]/g, "_")}.png`;
          writeFileSync(join(dir, file), readFileSync(c.screenshot));
          const twin = /-minimal\.card\.html$/.test(c.card);
          out.design.push({ theme: twin ? "minimal" : "rounded", label: cardInfo(readText(join(snapDir, c.card))).name || c.card, file, ...cssSize(join(dir, file)), shows: shows.get(c.card), ...(c.errors.length ? { errors: c.errors } : {}) });
        }
        rmSync(shots, { recursive: true, force: true });
        if (!twins.length) out.notes.design = "These cards have no Minimal twin, so Minimal shows nothing from Design.";
      }
      writeFileSync(done, JSON.stringify(out));
      return out;
    })();
    inFlight.set(key, work);
    try {
      return await work;
    } finally {
      inFlight.delete(key);
    }
  };
  return run();
}
