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
  app: { componentRoot: string; tokensRoot: string; spec: string; screensRoot: string; ignore: string[]; check: string };
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
  return JSON.parse(readFileSync(file, "utf8")) as Config;
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
