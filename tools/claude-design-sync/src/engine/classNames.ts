// The App spells out class names that the kit abbreviates (td-lrow → td-list-row). class-names.json
// lists the pairs (kit → App), and CSS that crosses between the sides is rewritten name by name, so a
// merge compares like with like. A name outside the list is the same on both sides.
import { readFileSync } from "node:fs";

export interface ClassNames {
  toApp: Map<string, string>;
  toKit: Map<string, string>;
}

/** A whole td-* name: not a custom property (--td-z), not part of a longer word */
const CLASS_NAME = /(?<![\w-])td-[a-z0-9]+(?:-[a-z0-9]+)*(?!\w)/g;

export function loadClassNames(file: string): ClassNames {
  const pairs = Object.entries(JSON.parse(readFileSync(file, "utf8")) as Record<string, string>);
  return { toApp: new Map(pairs), toKit: new Map(pairs.map(([kit, app]) => [app, kit])) };
}

/** Rewrite every listed class name in `text` to the other side's spelling */
export function renameClasses(text: string, names: ClassNames | undefined, to: "app" | "kit"): string {
  if (!names) return text;
  const map = to === "app" ? names.toApp : names.toKit;
  return text.replace(CLASS_NAME, (name) => map.get(name) ?? name);
}
