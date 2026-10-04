// Loads config.json and resolves the tool's paths. Every module takes a Ctx so tests can point the
// engine at fixture trees instead of the real repo and state folder.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface MapEntry {
  design: string;
  app: string;
  name?: string;
}

export interface Config {
  design: { projectId: string; projectName: string; componentRoot: string; tokensRoot: string; spec: string; screensRoot: string; ignore: string[]; assetFallbacks?: Record<string, string> };
  app: { componentRoot: string; tokensRoot: string; spec: string; screensRoot: string; ignore: string[] };
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
}

export const TOOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadConfig(file = join(TOOL_DIR, "config.json")): Config {
  return JSON.parse(readFileSync(file, "utf8")) as Config;
}

export function defaultCtx(): Ctx {
  const repo = process.env.CDS_REPO ? resolve(process.env.CDS_REPO) : resolve(TOOL_DIR, "../..");
  const state = process.env.CDS_STATE ? resolve(process.env.CDS_STATE) : join(TOOL_DIR, ".state");
  const config = loadConfig(process.env.CDS_CONFIG ? resolve(process.env.CDS_CONFIG) : undefined);
  return { repo, state, config };
}
