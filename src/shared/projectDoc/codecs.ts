// The formats a project can live in as a file. Each is a codec over the one project document, so
// import, export, Git sync and the 3-way merge never depend on a format: they parse, work on the
// document and serialize. Every serializer is deterministic (same document, same bytes).
import { fromEmbridge, toEmbridge } from "./embridge";
import { fromJson, toJson } from "./json";
import type { DocParse, ProjectDoc } from "./model";
import { fromYaml, toYaml } from "./yaml";

export const FILE_FORMATS = ["embridge", "json", "yaml"] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

export interface Codec {
  format: FileFormat;
  label: string;
  /** The extension a new file gets */
  extension: string;
  /** Extensions that mean this format when opening a file */
  extensions: readonly string[];
  /** Never loses what it can't place without saying so; throws ProjectFileError only for unreadable JSON/YAML */
  parse: (text: string) => DocParse;
  serialize: (doc: ProjectDoc) => string;
}

export const CODECS: Readonly<Record<FileFormat, Codec>> = {
  embridge: { format: "embridge", label: "Markdown (Embridge)", extension: ".md", extensions: [".md", ".markdown"], parse: (t) => fromEmbridge(t), serialize: (d) => toEmbridge(d) },
  json: { format: "json", label: "JSON", extension: ".json", extensions: [".json"], parse: fromJson, serialize: toJson },
  yaml: { format: "yaml", label: "YAML", extension: ".yaml", extensions: [".yaml", ".yml"], parse: fromYaml, serialize: toYaml },
};

/** The codec a path's extension asks for, if any. */
export function codecForPath(path: string): Codec | null {
  const lower = path.toLowerCase();
  return Object.values(CODECS).find((c) => c.extensions.some((e) => lower.endsWith(e))) ?? null;
}
