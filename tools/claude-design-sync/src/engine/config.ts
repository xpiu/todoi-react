// Loads config.json and resolves the tool's paths. Every module takes a Ctx so tests can point the
// engine at fixture trees instead of the real repo and state folder.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface MapEntry {
  design: string;
  app: string;
  name?: string;
}

export interface Config {
  design: { projectId: string; projectName: string; componentRoot: string; tokensRoot: string; spec: string; screensRoot: string; ignore: string[]; assetFallbacks?: Record<string, string> };
  /** `check`: the command that must pass in a run's worktree before its branch can be merged (e.g. npm run check) */
  app: {
    componentRoot: string; tokensRoot: string; spec: string; screensRoot: string; ignore: string[]; check: string;
    /** `build`: the command that writes a static Storybook build (with its components manifest) to `{out}` */
    storybook?: { build: string };
  };
  syncTagPrefix: string;
  renames: MapEntry[];
  screens: MapEntry[];
  harness: { implement: "claude" | "codex"; claudeBin: string; codexBin: string; pullModel: string; implementModel: string };
}

export interface Ctx {
  /** The app repository (git working tree) */
  repo: string;
  /** Where snapshots, sync points, staging and job logs live (gitignored) */
  state: string;
  config: Config;
  /** Where `config` was read from, so the GUI can save a new target project (unset in tests that build a Ctx by hand) */
  configFile?: string;
}

export const TOOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadConfig(file = join(TOOL_DIR, "config.json")): Config {
  const config = JSON.parse(readFileSync(file, "utf8")) as Config;
  const problems = pairingProblems(config);
  if (problems.length) throw new Error(`${file}: ${problems.join(" ")}`);
  return config;
}

/**
 * `renames` pair files that port into each other, so each side's file may appear once: a production file
 * fed by two kit files would be rewritten from each in turn. (`screens` may share an App screen: they are
 * references, read side by side, never ported.)
 */
export function pairingProblems(config: Pick<Config, "renames">): string[] {
  const out: string[] = [];
  for (const side of ["app", "design"] as const) {
    const seen = new Map<string, string[]>();
    for (const r of config.renames) seen.set(r[side], [...(seen.get(r[side]) ?? []), r[side === "app" ? "design" : "app"]]);
    for (const [path, others] of seen) if (others.length > 1) out.push(`renames pairs ${path} with ${others.length} files (${others.join(", ")}); a rename must pair one ${side === "app" ? "App" : "kit"} file with one ${side === "app" ? "kit" : "App"} file.`);
  }
  return out;
}

export function defaultCtx(): Ctx {
  const repo = process.env.CDS_REPO ? resolve(process.env.CDS_REPO) : resolve(TOOL_DIR, "../..");
  const state = process.env.CDS_STATE ? resolve(process.env.CDS_STATE) : join(TOOL_DIR, ".state");
  const configFile = process.env.CDS_CONFIG ? resolve(process.env.CDS_CONFIG) : join(TOOL_DIR, "config.json");
  return { repo, state, config: loadConfig(configFile), configFile };
}

/** Write the config back where it came from (same 2-space JSON the file is kept in) */
export function saveConfig(ctx: Ctx): void {
  if (!ctx.configFile) throw new Error("This session has no config file to save to");
  writeFileSync(ctx.configFile, JSON.stringify(ctx.config, null, 2) + "\n");
}
