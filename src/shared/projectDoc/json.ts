// JSON codec: the project file (./file.ts) as strict JSON, two-space indented with a final newline.
import { docToFile, fileToDoc, ProjectFileError } from "./file";
import type { DocParse, ProjectDoc } from "./model";

export function fromJson(text: string): DocParse {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (e) {
    throw new ProjectFileError([`Not valid JSON: ${(e as Error).message}`]);
  }
  return fileToDoc(data);
}

export const toJson = (doc: ProjectDoc): string => `${JSON.stringify(docToFile(doc), null, 2)}\n`;
