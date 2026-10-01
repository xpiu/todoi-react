// Quick-add grammar — pure parser for the N field: "Fix login bug #bug @flo !high due fri >Doing"
//   #label   @assignee   !priority (urgent/high/medium/low or 1–4)   due|by <date>   >list
// The QuickAddInput component (Phase 4) renders the field and the meta-row preview on top of this.
// Spec: DESIGN.md › Interaction & keyboard › Quick-add.
import { resolveDate, toISO, type DateInput } from "./dates";
import type { IconName } from "./Icon";

export type QuickAddPriority = "Urgent" | "High" | "Medium" | "Low";

const PRIO: Record<string, QuickAddPriority> = {
  urgent: "Urgent", high: "High", medium: "Medium", med: "Medium", low: "Low",
  "1": "Urgent", "2": "High", "3": "Medium", "4": "Low",
  p1: "Urgent", p2: "High", p3: "Medium", p4: "Low",
};

export type LabelOption = string | { text: string; color?: string };
export type MemberOption = string | { name: string; nickname?: string };
export type ListOption = string | { name?: string; value?: string; icon?: IconName };

export interface QuickAddOptions {
  /** Known labels — a matching #name picks up its colour; unknown names become `isNew` labels */
  labels?: ReadonlyArray<LabelOption>;
  /** Project members — @flo matches nickname, first name, full name, or a unique prefix */
  members?: ReadonlyArray<MemberOption>;
  /** Destination lists for >Doing (exact or prefix match, punctuation-insensitive) */
  lists?: ReadonlyArray<ListOption>;
  /** Anchor for relative dates; defaults to the real today */
  today?: DateInput;
  /** @default "teal" */
  defaultLabelColor?: string;
}

export type QuickAddTokenKind = "label" | "assignee" | "priority" | "due" | "list";

export interface QuickAddToken {
  kind: QuickAddTokenKind;
  raw: string;
  start: number;
  end: number;
  value: string;
  color?: string;
  isNew?: boolean;
  icon?: IconName;
  date?: Date;
}

export interface QuickAddResult {
  /** Text with every recognised token removed, whitespace collapsed */
  title: string;
  tokens: QuickAddToken[];
  labels: Array<{ text: string; color: string; isNew: boolean }>;
  assignee: string | null;
  priority: QuickAddPriority | null;
  /** "YYYY-MM-DD" */
  due: string | null;
  list: string | null;
}

const norm = (s: string | undefined | null) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const labelText = (l: LabelOption) => (typeof l === "string" ? l : l.text);
const listName = (l: ListOption) => (typeof l === "string" ? l : (l.name ?? l.value ?? ""));

const DUE_RE = /(^|\s)(due|by)\s+(next\s+[a-z]{3,}|in\s+\d+\s*(?:d|days?|w|wks?|weeks?)|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[ /-][a-z]{3,}|[a-z]{3,}[ /-]\d{1,2}|\d{1,2}\/\d{1,2}|[a-z]{3,})(?=\s|$)/gi;
const TOKEN_RE = /(^|\s)([#@!>])([^\s#@!>]+)/g;

export function parseQuickAdd(text: string, { labels = [], members = [], lists = [], today, defaultLabelColor = "teal" }: QuickAddOptions = {}): QuickAddResult {
  const src = String(text ?? "");
  const tokens: QuickAddToken[] = [];
  const consumed: Array<[number, number]> = [];
  let m: RegExpExecArray | null;

  DUE_RE.lastIndex = 0;
  while ((m = DUE_RE.exec(src))) {
    const d = resolveDate(m[3]!, today);
    if (!d) continue;
    const start = m.index + m[1]!.length;
    const end = m.index + m[0].length;
    tokens.push({ kind: "due", raw: src.slice(start, end), start, end, value: toISO(d)!, date: d });
    consumed.push([start, end]);
  }
  const inConsumed = (a: number, b: number) => consumed.some(([s, e]) => a < e && b > s);

  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src))) {
    const start = m.index + m[1]!.length;
    const end = m.index + m[0].length;
    if (inConsumed(start, end)) continue;
    const sigil = m[2]!;
    const word = m[3]!;
    let tok: Omit<QuickAddToken, "raw" | "start" | "end"> | null = null;
    if (sigil === "#") {
      const known = labels.find((l) => norm(labelText(l)) === norm(word));
      tok = {
        kind: "label",
        value: known ? labelText(known) : word,
        color: (known && typeof known !== "string" && known.color) || defaultLabelColor,
        isNew: !known,
      };
    } else if (sigil === "@") {
      const w = norm(word);
      const asObj = (p: MemberOption) => (typeof p === "string" ? { name: p } : p);
      const hit =
        members.find((p) => {
          const o = asObj(p);
          return norm(o.nickname) === w || norm(o.name) === w || norm(o.name.split(/\s+/)[0]) === w;
        }) ??
        members.find((p) => {
          const o = asObj(p);
          return norm(o.name).startsWith(w) || norm(o.nickname).startsWith(w);
        });
      const o = hit ? asObj(hit) : null;
      tok = { kind: "assignee", value: o ? o.name : word, isNew: !o };
    } else if (sigil === "!") {
      const p = PRIO[word.toLowerCase()];
      if (!p) continue;
      tok = { kind: "priority", value: p };
    } else {
      const hit = lists.find((l) => norm(listName(l)) === norm(word)) ?? lists.find((l) => norm(listName(l)).startsWith(norm(word)));
      if (!hit) continue;
      tok = { kind: "list", value: listName(hit), icon: typeof hit === "string" ? undefined : hit.icon };
    }
    tokens.push({ ...tok, raw: src.slice(start, end), start, end });
    consumed.push([start, end]);
  }

  tokens.sort((a, b) => a.start - b.start);
  let title = "";
  let last = 0;
  for (const t of tokens) {
    title += src.slice(last, t.start);
    last = t.end;
  }
  title = (title + src.slice(last)).replace(/\s+/g, " ").trim();

  const out: QuickAddResult = {
    title,
    tokens,
    labels: tokens.filter((t) => t.kind === "label").map((t) => ({ text: t.value, color: t.color!, isNew: !!t.isNew })),
    assignee: null,
    priority: null,
    due: null,
    list: null,
  };
  for (const t of tokens) {
    if (t.kind === "assignee") out.assignee = t.value;
    else if (t.kind === "priority") out.priority = t.value as QuickAddPriority;
    else if (t.kind === "due") out.due = t.value;
    else if (t.kind === "list") out.list = t.value;
  }
  return out;
}

/** The text with one token's span removed (chip ×). */
export function stripToken(text: string, tok: QuickAddToken): string {
  return (text.slice(0, tok.start) + text.slice(tok.end)).replace(/\s{2,}/g, " ").replace(/^\s+/, "");
}
