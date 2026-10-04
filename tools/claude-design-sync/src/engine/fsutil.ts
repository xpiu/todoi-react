// Small file helpers: recursive listing, glob ignores, content hashes.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const toPosix = (p: string) => p.split(sep).join("/");

/** Every file under `root` as root-relative posix paths, sorted. Skips node_modules and dot-folders. */
export function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git") continue;
      const abs = join(dir, name);
      const st = statSync(abs);
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

export function isIgnored(path: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
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
