// The App side's history: sync-point tags, file contents at a rev, commits touching a path.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const git = (repo: string, args: string[]): string => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

export function head(repo: string): string {
  return git(repo, ["rev-parse", "--short", "HEAD"]).trim();
}

export function resolveRev(repo: string, rev: string): string | null {
  try {
    return git(repo, ["rev-parse", "--short", `${rev}^{commit}`]).trim();
  } catch {
    return null;
  }
}

/** Sync-point tags, newest first, with their commit and date */
export function syncTags(repo: string, prefix: string): Array<{ tag: string; rev: string; date: string; message: string }> {
  const out = git(repo, ["for-each-ref", "--sort=-creatordate", "--format=%(refname:short)\t%(objectname:short)\t%(*objectname:short)\t%(creatordate:iso-strict)\t%(contents:subject)", `refs/tags/${prefix}*`]).trim();
  if (!out) return [];
  return out.split("\n").map((l) => {
    const [tag = "", obj = "", peeled = "", date = "", message = ""] = l.split("\t");
    return { tag, rev: peeled || obj, date, message };
  });
}

/** File content at a rev, or null when the file didn't exist there */
export function showAt(repo: string, rev: string, path: string): string | null {
  try {
    return git(repo, ["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
}

/** Subjects of commits after `rev` that touched any of `paths` (newest first) */
export function commitsSince(repo: string, rev: string, paths: string[]): Array<{ hash: string; subject: string; date: string }> {
  if (!paths.length) return [];
  const out = git(repo, ["log", "--no-merges", "--format=%h\t%ad\t%s", "--date=short", `${rev}..HEAD`, "--", ...paths]).trim();
  if (!out) return [];
  return out.split("\n").map((l) => {
    const [hash = "", date = "", subject = ""] = l.split("\t");
    return { hash, date, subject };
  });
}

export interface Commit {
  hash: string;
  date: string;
  subject: string;
  files: string[];
}

/** Every commit after `rev` with the files it touched, newest first — read once per comparison */
export function commitsAfter(repo: string, rev: string): Commit[] {
  const out = git(repo, ["log", "--no-merges", "--format=%x00%h%x09%ad%x09%s", "--date=short", "--name-only", `${rev}..HEAD`]);
  return out
    .split("\u0000")
    .filter((b) => b.trim())
    .map((b) => {
      const [first = "", ...rest] = b.split("\n");
      const [hash = "", date = "", subject = ""] = first.split("\t");
      return { hash, date, subject, files: rest.map((l) => l.trim()).filter(Boolean) };
    });
}

/** Unified diff of App paths between rev and the working tree */
export function diffSince(repo: string, rev: string, paths: string[]): string {
  if (!paths.length) return "";
  try {
    return git(repo, ["diff", "--no-color", rev, "--", ...paths]);
  } catch {
    return "";
  }
}

/** Unified diff of two directories or files outside git (Design snapshots) */
export function diffNoIndex(a: string, b: string): string {
  try {
    return execFileSync("git", ["diff", "--no-index", "--no-color", a, b], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // exit 1 means "differences found"; stdout carries the diff
    const out = (e as { stdout?: string }).stdout;
    return typeof out === "string" ? out : "";
  }
}

/** Three-way merge of text (git merge-file): `ours` and `theirs` both started from `base` */
export function mergeText(base: string, ours: string, theirs: string): { text: string; conflicts: number } {
  const dir = mkdtempSync(join(tmpdir(), "cds-merge-"));
  try {
    const [o, b, t] = (["ours", "base", "theirs"] as const).map((n, i) => {
      const f = join(dir, n);
      writeFileSync(f, [ours, base, theirs][i]!);
      return f;
    });
    try {
      return { text: execFileSync("git", ["merge-file", "-p", o!, b!, t!], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), conflicts: 0 };
    } catch (e) {
      // a positive exit status is the number of conflicts; stdout carries the text with markers
      const { status, stdout } = e as { status?: number; stdout?: string };
      if (typeof status === "number" && status > 0 && typeof stdout === "string") return { text: stdout, conflicts: status };
      throw e;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function createTag(repo: string, tag: string, message: string): void {
  git(repo, ["tag", "-a", tag, "-m", message]);
}

export function isDirty(repo: string): boolean {
  return git(repo, ["status", "--porcelain"]).trim().length > 0;
}
