// Small file helpers: recursive listing, glob ignores, content hashes.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const toPosix = (p: string) => p.split(sep).join("/");

const inside = (root: string, file: string) => {
  const rel = relative(root, file);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/** An existing file inside root, including its real path: symlinks cannot escape the folder. */
export function fileWithin(root: string, path: string): string | null {
  const dir = resolve(root);
  const file = resolve(dir, path);
  if (!inside(dir, file) || !existsSync(file)) return null;
  if (!inside(realpathSync(dir), realpathSync(file)) || !statSync(file).isFile()) return null;
  return file;
}

/** Every file under `root` as root-relative posix paths, sorted. Skips node_modules and .git. */
export function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const { name } = entry;
      if (name === "node_modules" || name === ".git") continue;
      const abs = join(dir, name);
      const st = entry.isSymbolicLink() ? statSync(abs) : entry;
      if (st.isDirectory()) walk(abs);
      else out.push(toPosix(relative(root, abs)));
    }
  };
  walk(root);
  return out.sort();
}

/** Minimal glob: `**` any depth, `*` within a segment. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else re += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const globPatterns = new Map<string, RegExp>();
export function isIgnored(path: string, globs: string[]): boolean {
  return globs.some((g) => {
    let pattern = globPatterns.get(g);
    if (!pattern) {
      pattern = globToRegExp(g);
      // Configured globs are usually few; bound memory for callers supplying arbitrary patterns.
      if (globPatterns.size >= 128) globPatterns.clear();
      globPatterns.set(g, pattern);
    }
    return pattern.test(path);
  });
}

export function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function hash(text: string | null): string | null {
  return text == null ? null : createHash("sha1").update(text).digest("hex").slice(0, 12);
}

/** Hash of several files' contents (missing files count as absent) */
export function hashAll(texts: Array<string | null>): string | null {
  if (texts.every((t) => t == null)) return null;
  return hash(texts.map((t) => t ?? "\u0000missing").join("\u0001"));
}
