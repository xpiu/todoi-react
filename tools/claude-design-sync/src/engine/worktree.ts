// App-side ports never touch the developer's checkout: they run in a git worktree on a branch of their
// own, every edit must end in a commit, the repo's check runs there, and nothing reaches the developer's
// branch until they press Merge.
import { z } from "zod";

import { fileWithin } from "./fsutil";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import type { Ctx } from "./config";
import type { FidelityFinding } from "./approvals";
import { git } from "./git";
import { runCommand } from "./process";

export interface AppRun {
  /** The worktree folder (outside the repo, so the repo's own tools never pick it up) */
  worktree: string;
  branch: string;
  /** Full rev the run started from */
  base: string;
  /** The developer's branch it merges into */
  into: string;
  commits: Array<{ hash: string; subject: string }>;
  check?: { command: string; ok: boolean; output: string };
  /**
   * AI ports from the kit are drafts: what the architecture scan found on the branch, and whether the
   * developer confirmed their review. Merge refuses a draft until then. (Token-only runs are deterministic
   * and carry no review.)
   */
  review?: { findings: FidelityFinding[]; reviewedAt?: string };
  /** working → ready (verified, waiting for Merge) → merged; failed runs are kept for a look until discarded */
  state: "working" | "ready" | "failed" | "merged" | "discarded";
  reason?: string;
  /** Last clean HEAD saved after a completed step; resume refuses unexpected branch edits. */
  checkpoint?: string;
}

/** A worktree on a new branch from HEAD, with the repo's node_modules linked in so its check can run */
export function createWorktree(ctx: Ctx, runId: string): AppRun {
  let into: string;
  try {
    into = git(ctx.repo, ["symbolic-ref", "--short", "HEAD"]).trim();
  } catch {
    throw new Error("The App repo has no branch checked out (detached HEAD). Check out the branch the work should land on, then run again.");
  }
  const base = git(ctx.repo, ["rev-parse", "HEAD"]).trim();
  const id = createHash("sha1").update(ctx.repo).digest("hex").slice(0, 6);
  const worktree = join(tmpdir(), "cds-runs", `${basename(ctx.repo)}-${id}`, runId);
  const branch = `design-sync/${runId.startsWith("run-") ? runId : `run-${runId}`}`;
  mkdirSync(dirname(worktree), { recursive: true });
  git(ctx.repo, ["worktree", "add", "-q", "-b", branch, worktree, base]);
  const modules = join(ctx.repo, "node_modules");
  if (existsSync(modules)) symlinkSync(modules, join(worktree, "node_modules"), "dir");
  return { worktree, branch, base, into, commits: [], state: "working", checkpoint: base };
}

/** Commits on the run's branch since `since` (default: since the run started), oldest first */
export function commitsSince(run: AppRun, since = run.base): Array<{ hash: string; subject: string }> {
  const out = git(run.worktree, ["log", "--reverse", "--format=%h%x09%s", `${since}..HEAD`]).trim();
  return out ? out.split("\n").map((l) => ({ hash: l.split("\t")[0]!, subject: l.split("\t").slice(1).join("\t") })) : [];
}

export const headOf = (run: AppRun) => git(run.worktree, ["rev-parse", "HEAD"]).trim();

/** Files left uncommitted in the worktree (the linked node_modules aside) */
export function leftovers(run: AppRun): string[] {
  const out = git(run.worktree, ["status", "--porcelain", "--untracked-files=all"]).trimEnd();
  return out ? out.split("\n").map((l) => l.slice(3)).filter((p) => p !== "node_modules") : [];
}

const alreadyImplementedSchema = z.object({
  units: z.array(z.object({
    id: z.string().min(1),
    evidence: z.array(z.object({ path: z.string().min(1), reason: z.string().trim().min(20) })).min(1),
  })).min(1),
});
export type AlreadyImplemented = z.infer<typeof alreadyImplementedSchema>;
export const ALREADY_IMPLEMENTED_MARKER = "CDS_ALREADY_IMPLEMENTED=";

/** An explicit, per-unit no-change report. A clean checkout alone cannot prove a port succeeded. */
export function alreadyImplementedReport(result: string, units: string[], repo: string): AlreadyImplemented | null {
  const lines = result.split("\n").filter((l) => l.startsWith(ALREADY_IMPLEMENTED_MARKER));
  if (lines.length !== 1) return null;
  try {
    const report = alreadyImplementedSchema.parse(JSON.parse(lines[0]!.slice(ALREADY_IMPLEMENTED_MARKER.length)));
    const ids = report.units.map((u) => u.id);
    if (ids.length !== units.length || new Set(ids).size !== ids.length || units.some((id) => !ids.includes(id))) return null;
    if (report.units.some((u) => u.evidence.some((e) => !fileWithin(repo, e.path)))) return null;
    return report;
  } catch {
    return null;
  }
}

/** A port commits its edits, or explicitly accounts for every unit it found already implemented. */
export function verifyPort(run: AppRun, before: string, outcome?: { result: string; units: string[] }):
  | { ok: true; commits: Array<{ hash: string; subject: string }>; alreadyImplemented?: AlreadyImplemented }
  | { ok: false; reason: string } {
  const commits = commitsSince(run, before);
  const dirty = leftovers(run);
  if (dirty.length) return { ok: false, reason: commits.length
    ? `It committed, but left ${dirty.length} file(s) uncommitted: ${dirty.slice(0, 5).join(", ")}${dirty.length > 5 ? "…" : ""}`
    : `It changed ${dirty.length} file(s) but made no commit` };
  if (commits.length) return { ok: true, commits };
  if (headOf(run) !== before) return { ok: false, reason: "It moved the branch backwards instead of porting the feature" };
  const report = outcome && alreadyImplementedReport(outcome.result, outcome.units, run.worktree);
  if (report) return { ok: true, commits: [], alreadyImplemented: report };
  return { ok: false, reason: "No commit or valid already-implemented report; the feature is still unverified" };
}

/** Edits after the last saved step (an interrupted port's, or the developer's): resume refuses them unless they are set aside */
export class ResumeDrift extends Error {
  constructor(message: string, readonly files: string[]) {
    super(message);
  }
}

/**
 * Validate the saved worktree before any resumed work starts. Returns the files changed after the last
 * saved step when `allowDrift` (the caller sets them aside); otherwise they make it throw `ResumeDrift`.
 */
export function verifyResume(run: AppRun, { allowDrift = false } = {}): string[] {
  if (!existsSync(run.worktree)) throw new Error("The saved App worktree is missing. Start a new run.");
  const branch = git(run.worktree, ["symbolic-ref", "--short", "HEAD"]).trim();
  if (branch !== run.branch) throw new Error("The saved worktree is on a different branch. Restore its branch before resuming.");
  git(run.worktree, ["merge-base", "--is-ancestor", run.base, "HEAD"]);
  const since = run.checkpoint ?? headOf(run);
  try {
    git(run.worktree, ["merge-base", "--is-ancestor", since, "HEAD"]);
  } catch {
    throw new Error("The App branch was rewritten after its last saved step. Review it by hand, or discard the run and start a new one.");
  }
  const committed = git(run.worktree, ["diff", "--name-only", since, "HEAD"]).trim();
  const dirty = leftovers(run);
  const files = [...new Set([...(committed ? committed.split("\n") : []), ...dirty])];
  if (allowDrift || !files.length) return files;
  throw new ResumeDrift(committed
    ? "The App branch changed after its last saved step. Set those edits aside to resume (they're saved as a patch), or review them first."
    : "The App worktree has uncommitted files, usually from a port that was interrupted. Set them aside to resume (they're saved as a patch), or review them first.", files);
}

// Wildcards avoid Git treating an ignored node_modules symlink as an explicitly named path.
// Exclude both the link itself and directory contents, even in repos without a dependency ignore.
const OWN_PATHS = [".", ":(exclude,glob)**/node_modules", ":(exclude,glob)**/node_modules/**"];

/** Commit what the tool itself wrote (a deterministic token merge) on the run's branch */
export function commitAll(run: AppRun, message: string): boolean {
  git(run.worktree, ["add", "-A", "--", ...OWN_PATHS]);
  if (!git(run.worktree, ["status", "--porcelain", "--", ...OWN_PATHS]).trim()) return false;
  git(run.worktree, ["-c", "user.name=Claude Design Sync", "-c", "user.email=design-sync@localhost", "commit", "-q", "-m", message]);
  return true;
}

/**
 * Move everything on the branch past `since` (commits and uncommitted files) into a patch file, then
 * return the worktree to `since`. Nothing is lost: `git apply <patch>` brings it back. Returns the files
 * the patch holds, or null when there was nothing to set aside.
 */
export function setAside(run: AppRun, since: string, patch: string): string[] | null {
  git(run.worktree, ["merge-base", "--is-ancestor", since, "HEAD"]);
  git(run.worktree, ["add", "-A", "--", ...OWN_PATHS]);
  const files = git(run.worktree, ["diff", "--cached", "--name-only", since, "--", ...OWN_PATHS]).trim();
  if (files) {
    mkdirSync(dirname(patch), { recursive: true });
    writeFileSync(patch, git(run.worktree, ["diff", "--cached", "--binary", since, "--", ...OWN_PATHS]));
  }
  git(run.worktree, ["reset", "-q", "--hard", since]);
  git(run.worktree, ["clean", "-fdq", "-e", "node_modules"]);
  return files ? files.split("\n") : null;
}

/** Run the repo's check (e.g. `npm run check`) in the worktree; keeps the last part of its output */
export const runCheck = (run: AppRun, command: string, signal?: AbortSignal) => runCommand(run.worktree, command, signal);

/**
 * Merge the run's branch into the developer's branch: fast-forward when possible, else a merge commit.
 * Conflicts abort the merge and leave everything as it was. The checkout must still be on `into`.
 */
export function mergeRun(ctx: Ctx, run: AppRun): "fast-forward" | "merge" {
  const now = git(ctx.repo, ["symbolic-ref", "--short", "HEAD"]).trim();
  if (now !== run.into) throw new Error(`The App repo is on ${now} now; this run merges into ${run.into}. Check out ${run.into} first.`);
  try {
    git(ctx.repo, ["merge", "--ff-only", "-q", run.branch]);
    return "fast-forward";
  } catch {
    /* the developer committed meanwhile: a real merge */
  }
  try {
    git(ctx.repo, ["merge", "--no-ff", "--no-edit", "-q", run.branch]);
    return "merge";
  } catch (e) {
    try {
      git(ctx.repo, ["merge", "--abort"]);
    } catch {
      /* the merge never started (e.g. it would overwrite uncommitted changes) */
    }
    const msg = String((e as { stderr?: string }).stderr ?? (e as Error).message).trim().split("\n").slice(0, 4).join(" ");
    throw new Error(`Couldn't merge ${run.branch} into ${run.into}: ${msg}. Nothing changed; merge it by hand (git merge ${run.branch}) or discard the run.`);
  }
}

/** Push `branch` to origin (hosted servers, so CI/CD sees the merge); never forced */
export function pushBranch(ctx: Ctx, branch: string): void {
  try {
    git(ctx.repo, ["push", "-q", "origin", branch]);
  } catch (e) {
    throw new Error(String((e as { stderr?: string }).stderr ?? (e as Error).message).trim().split("\n").slice(0, 4).join(" "));
  }
}

/** Remove the worktree; `dropBranch` also deletes the branch (after a merge it's fully contained) */
export function removeWorktree(ctx: Ctx, run: AppRun, dropBranch: boolean): void {
  try {
    git(ctx.repo, ["worktree", "remove", "--force", run.worktree]);
  } catch {
    git(ctx.repo, ["worktree", "prune"]);
  }
  if (dropBranch) {
    try {
      git(ctx.repo, ["branch", "-D", run.branch]);
    } catch {
      /* already gone */
    }
  }
}
