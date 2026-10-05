// App-side ports never touch the developer's checkout: they run in a git worktree on a branch of their
// own, every port must end in a commit, the repo's check runs there, and nothing reaches the developer's
// branch until they press Merge.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import type { Ctx } from "./config";
import { git } from "./git";

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
  /** working → ready (verified, waiting for Merge) → merged; failed runs are kept for a look until discarded */
  state: "working" | "ready" | "failed" | "merged" | "discarded";
  reason?: string;
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
  return { worktree, branch, base, into, commits: [], state: "working" };
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

/** Did one port do its job: at least one commit since `before`, and nothing left uncommitted? */
export function verifyPort(run: AppRun, before: string): { ok: true; commits: Array<{ hash: string; subject: string }> } | { ok: false; reason: string } {
  const commits = commitsSince(run, before);
  const dirty = leftovers(run);
  if (!commits.length) return { ok: false, reason: dirty.length ? `It changed ${dirty.length} file(s) but made no commit` : "It made no commit, so nothing was ported" };
  if (dirty.length) return { ok: false, reason: `It committed, but left ${dirty.length} file(s) uncommitted: ${dirty.slice(0, 5).join(", ")}${dirty.length > 5 ? "…" : ""}` };
  return { ok: true, commits };
}

/** Commit what the tool itself wrote (a deterministic token merge) on the run's branch */
export function commitAll(run: AppRun, message: string): boolean {
  git(run.worktree, ["add", "-A", "--", ".", ":!node_modules"]);
  if (!git(run.worktree, ["status", "--porcelain", "--", ".", ":!node_modules"]).trim()) return false;
  git(run.worktree, ["-c", "user.name=Claude Design Sync", "-c", "user.email=design-sync@localhost", "commit", "-q", "-m", message]);
  return true;
}

/** Run the repo's check (e.g. `npm run check`) in the worktree; keeps the last part of its output */
export function runCheck(run: AppRun, command: string, signal?: AbortSignal): Promise<{ command: string; ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd: run.worktree, env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const keep = (d: Buffer) => {
      output = (output + d.toString().replace(/\x1b\[[0-9;]*m/g, "")).slice(-6000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    signal?.addEventListener("abort", () => child.kill("SIGTERM"));
    child.on("error", (e) => resolve({ command, ok: false, output: `Couldn't start: ${e.message}` }));
    child.on("close", (code) => resolve({ command, ok: code === 0, output }));
  });
}

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
