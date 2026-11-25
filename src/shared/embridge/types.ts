// The parse tree of the Embridge reference parser (npm `embridge`, MIT), typed. The shape is the one the
// spec's conformance suite pins (tests/fixtures/embridge/expected/*.json), so it is the contract here too.
// Spec: https://github.com/embridge-foundation/embridge (v0.2.2).

export type EmbridgeMarker = { type: "bullet" } | { type: "ordered"; number: number } | { type: "none" };

export interface EmbridgeComment {
  /** 1 = `>`, 2 = `>>` (a reply), … */
  replyDepth: number;
  /** Without the `@` */
  author: string | null;
  /** As written: "2025-01-20" or "2025-01-20 14:30" */
  timestamp: string | null;
  text: string;
}

export interface EmbridgeItem {
  title: string;
  /** null = no checkbox */
  completed: boolean | null;
  marker: EmbridgeMarker;
  /** Every `key: value` as written (keys keep their case; aliases are not folded) */
  fields: Record<string, string>;
  description: string | null;
  comments: EmbridgeComment[];
  subitems: EmbridgeItem[];
}

export interface EmbridgeList {
  /** null = the implicit list before the first heading */
  title: string | null;
  /** From the document's `lists:` registry, else an inline section `id:` */
  id?: string;
  /** Blank-lines mode only */
  preamble: string[] | null;
  /** Section metadata (tolerated, not recommended) */
  fields?: Record<string, string>;
  description?: string;
  items: EmbridgeItem[];
}

export interface EmbridgeDocumentMetadata {
  title: string | null;
  sync: string | null;
  uuid: string | null;
  lists: Array<{ title: string; id: string }> | null;
  fields: string[] | null;
  syntax: { mode: "marker" | "blank-lines" } | null;
  format: string | null;
}

export interface EmbridgeDiagnostic {
  line: number;
  severity: "warning";
  message: string;
}

export interface EmbridgeDocument {
  documentMetadata: EmbridgeDocumentMetadata | null;
  lists: EmbridgeList[];
  diagnostics: EmbridgeDiagnostic[];
}
