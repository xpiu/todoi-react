// The App's own component workshop, read instead of retyped: a static Storybook build gives every
// component's props (react-docgen) and stories (as JSX snippets) in manifests/components.json, and renders
// any story alone at iframe.html?id=…. Kit drafts (kitDraft.ts) and visual comparisons (visual.ts) read it.
// Builds are cached by the content of the files Storybook reads, so an unchanged App builds once.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { Ctx } from "./config";
import { hashAll, listFiles, readText } from "./fsutil";
import { runCommand } from "./process";

export interface ManifestProp {
  required?: boolean;
  tsType?: { name: string; raw?: string };
  description?: string;
  defaultValue?: { value: string };
}

export interface ManifestComponent {
  id: string;
  name: string;
  /** The stories file, "./src/…stories.tsx" */
  path: string;
  stories: Array<{ id: string; name: string; snippet?: string }>;
  reactDocgen?: { description?: string; definedInFile?: string; props?: Record<string, ManifestProp> };
}

export interface Storybook {
  /** The static build: serve it to render a story alone (iframe.html?id=<story id>) */
  dir: string;
  components: ManifestComponent[];
}

/** What Storybook reads: the component folder and its own config */
function inputs(ctx: Ctx): string[] {
  const roots = [ctx.config.app.componentRoot, ".storybook"];
  return roots.flatMap((r) => listFiles(join(ctx.repo, r)).map((p) => join(ctx.repo, r, p)));
}

/** The App's Storybook build for its current files: reused when nothing it reads changed, else built (~10 s) */
export async function storybook(ctx: Ctx, signal?: AbortSignal): Promise<Storybook | null> {
  const cmd = ctx.config.app.storybook?.build;
  if (!cmd) return null;
  const files = inputs(ctx);
  const key = hashAll([cmd, ...files, ...files.map(readText)]) ?? "empty";
  const root = join(ctx.state, "storybook");
  const dir = join(root, key);
  const manifest = join(dir, "manifests", "components.json");
  if (!existsSync(manifest)) {
    mkdirSync(root, { recursive: true });
    const r = await runCommand(ctx.repo, cmd.replaceAll("{out}", `'${dir}'`), signal);
    if (!r.ok || !existsSync(manifest)) throw new Error(`Storybook didn't build (${cmd}): ${r.output.trim().split("\n").slice(-3).join(" ") || "no manifest written"}`);
    // keep only the newest build
    for (const old of readdirSync(root)) if (old !== key) rmSync(join(root, old), { recursive: true, force: true });
  }
  const data = JSON.parse(readFileSync(manifest, "utf8")) as { components: Record<string, ManifestComponent> };
  return { dir, components: Object.values(data.components) };
}

/** The manifest entry for an App component, found by its stories file or the file react-docgen read */
export function componentFor(sb: Storybook, appPaths: string[]): ManifestComponent | null {
  return sb.components.find((c) => appPaths.includes(c.path.replace(/^\.\//, "")) || appPaths.some((p) => c.reactDocgen?.definedInFile?.endsWith(`/${p}`))) ?? null;
}
