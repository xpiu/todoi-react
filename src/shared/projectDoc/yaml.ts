// YAML codec: the project file (./file.ts) as a restricted YAML 1.2 subset. Written with every string
// double-quoted (multiline ones as literal blocks) so nothing changes type; read without anchors, aliases,
// tags or merge keys, and with plain scalars kept as strings except where the file expects a boolean or a
// whole number — so `no` stays "no" and `1.10` stays "1.10".
import { Document, isAlias, isMap, isScalar, isSeq, parseDocument, Scalar, visit, type Node } from "yaml";

import { capProblems, docToFile, fileToDoc, ProjectFileError } from "./file";
import type { DocParse, ProjectDoc } from "./model";

const BOOLEAN_KEYS = new Set(["done", "image"]);
const INTEGER_KEYS = new Set(["version", "depth"]);

function toData(node: Node | null | undefined, key: string | null, problems: string[], path: string): unknown {
  if (!node) return null;
  if (isAlias(node) || node.anchor) {
    problems.push(`${path || "The file"}: must not use anchors or aliases (& and *); write the value out`);
    return null;
  }
  if (node.tag && !/^tag:yaml\.org,2002:(str|map|seq)$/.test(node.tag)) {
    problems.push(`${path || "The file"}: must not use tags like ${node.tag.replace(/^tag:yaml\.org,2002:/, "!!")}`);
    return null;
  }
  if (isMap(node)) {
    const out: Record<string, unknown> = {};
    for (const pair of node.items) {
      const k = isScalar(pair.key) ? String(pair.key.value) : null;
      if (k === null || k === "<<") {
        problems.push(`${path || "The file"}: ${k === "<<" ? "must not use merge keys (<<)" : "keys must be plain text"}`);
        continue;
      }
      out[k] = toData(pair.value as Node | null, k, problems, path ? `${path}.${k}` : k);
    }
    return out;
  }
  if (isSeq(node)) return node.items.map((n, i) => toData(n as Node, key, problems, `${path}[${i}]`));
  if (isScalar(node)) {
    const source = String(node.source ?? node.value ?? "");
    if (node.type !== "PLAIN") return source;
    if (/^(~|null|Null|NULL)?$/.test(source)) return null;
    if (key && BOOLEAN_KEYS.has(key) && /^(true|True|TRUE|false|False|FALSE)$/.test(source)) return /^t/i.test(source);
    if (key && INTEGER_KEYS.has(key) && /^\d+$/.test(source)) return Number(source);
    return source;
  }
  return null;
}

export function fromYaml(text: string): DocParse {
  const doc = parseDocument(text.replace(/^\uFEFF/, ""), { version: "1.2", schema: "core", uniqueKeys: true, merge: false, keepSourceTokens: false });
  if (doc.errors.length) throw new ProjectFileError(capProblems(doc.errors.map((e) => `Not valid YAML${e.linePos ? ` (line ${e.linePos[0].line})` : ""}: ${e.message.split("\n")[0]!.replace(/ at line \d+, column \d+:?$/, "")}`)));
  const problems: string[] = [];
  const data = toData(doc.contents as Node | null, null, problems, "");
  if (problems.length) throw new ProjectFileError(capProblems(problems));
  return fileToDoc(data);
}

export function toYaml(doc: ProjectDoc): string {
  const out = new Document(docToFile(doc), { version: "1.2" });
  visit(out, {
    Scalar(key, node: Scalar) {
      // Keys stay plain; every string value is quoted, so a reader never guesses its type.
      if (key === "key" || typeof node.value !== "string") return;
      node.type = node.value.includes("\n") ? Scalar.BLOCK_LITERAL : Scalar.QUOTE_DOUBLE;
    },
  });
  return out.toString({ lineWidth: 0, indentSeq: true });
}
