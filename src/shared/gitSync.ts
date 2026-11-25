// Git sync requests and responses, shared by the API (validation) and the client (types and the form's checks).
import { z } from "zod";

import { CODECS, FILE_FORMATS, type FileFormat } from "./projectDoc/codecs";
import type { MergeConflict } from "./projectDoc/merge";

/** GitHub's own rules: an account is 1–39 letters, digits or single hyphens; a repository adds dots and underscores. */
const owner = z.string().trim().regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, "Use the GitHub account or organisation name, like todoi-com");
const repo = z.string().trim().regex(/^[A-Za-z0-9._-]{1,100}$/, "Use the repository name, like plans").refine((r) => r !== "." && r !== "..", "Use the repository name, like plans");
const branch = z.string().trim().min(1, "Name a branch, like main").max(255).refine((b) => !/\s|\.\.|[~^:?*[\\]|^\/|\/$|\.lock$|@\{/.test(b), "That isn't a valid branch name");
/** A file path in the repository: relative, no "..", ending in a format's extension. */
export const repoPath = z
  .string()
  .trim()
  .min(1, "Name the file, like todo/website.md")
  .max(300)
  .refine((p) => !p.startsWith("/") && !p.split("/").some((s) => s === ".." || s === "." || s === ""), "Use a path inside the repository, like todo/website.md")
  .refine((p) => /\.(md|markdown|json|ya?ml)$/i.test(p), "End the file name in .md, .json or .yaml");
const token = z.string().trim().min(20, "Paste the whole token").max(400);

export const gitCheckSchema = z.object({ token, owner, repo, branch, path: repoPath });
export const gitConnectSchema = gitCheckSchema
  .extend({
    format: z.enum(FILE_FORMATS),
    mode: z.enum(["store", "use"]),
    conflictPolicy: z.enum(["ask", "todoi", "file"]).optional(),
  })
  .refine((v) => CODECS[v.format].extensions.some((e) => v.path.toLowerCase().endsWith(e)), { path: ["path"], message: "The file's extension doesn't match the format" });
export const gitSettingsSchema = z.object({
  conflictPolicy: z.enum(["ask", "todoi", "file"]).optional(),
  autoSync: z.boolean().optional(),
  token: token.optional(),
});
export const gitSyncSchema = z.object({
  choices: z.record(z.string().max(200), z.enum(["ours", "theirs"])).optional(),
  resolveAll: z.enum(["ours", "theirs"]).optional(),
});
export type GitCheckInput = z.infer<typeof gitCheckSchema>;
export type GitConnectInput = z.infer<typeof gitConnectSchema>;

export interface GitRunView {
  id: string;
  trigger: "connect" | "manual" | "webhook" | "auto" | "resolve" | "undo";
  outcome: "pushed" | "pulled" | "merged" | "unchanged" | "conflict" | "failed" | "undone";
  pulled: number;
  pushed: number;
  conflicts: number;
  error: string | null;
  notes: string[];
  undoable: boolean;
  commitSha: string | null;
  at: string;
}
export interface GitConnectionView {
  id: string;
  projectId: string;
  projectName: string;
  provider: "github";
  owner: string;
  repo: string;
  branch: string;
  path: string;
  format: FileFormat;
  tokenHint: string;
  state: "ok" | "conflict" | "error";
  lastError: string | null;
  lastSyncedAt: string | null;
  conflictPolicy: "ask" | "todoi" | "file";
  autoSync: boolean;
  webhook: boolean;
  conflicts: MergeConflict[];
  runs: GitRunView[];
}

/** "acme/plans", "github.com/acme/plans" or a full URL (with .git, /tree/branch/…) → owner, repo and what else it names. */
export function parseRepoInput(input: string): { owner: string; repo: string; branch?: string; path?: string } | null {
  const s = input.trim().replace(/^git@github\.com:/, "github.com/").replace(/^https?:\/\//, "").replace(/^(www\.)?github\.com\//, "");
  const m = /^([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s]+)(?:\/(.+))?)?\/?$/.exec(s);
  if (!m || !owner.safeParse(m[1]).success || !repo.safeParse(m[2]).success) return null;
  return { owner: m[1]!, repo: m[2]!, ...(m[3] ? { branch: m[3] } : {}), ...(m[4] ? { path: m[4] } : {}) };
}

/** The format a path's extension names. */
export const formatForPath = (path: string): FileFormat | null => (/\.(md|markdown)$/i.test(path) ? "embridge" : /\.json$/i.test(path) ? "json" : /\.ya?ml$/i.test(path) ? "yaml" : null);
