// Import parsers — pure: Markdown in the Embridge format (what Export writes), a Trello board's JSON
// export, and CSV with a header row. Each yields the same plan the Review step shows and the
// importer executes: lists with items (title, description, dates, labels, assignee names, Status, done,
// comments, subitems).
import type { ItemPriority, LabelColor } from "../../shared/enums";
import type { ImportPlan, PlanItem, PlanList } from "../../shared/import";
import { fromEmbridge } from "../../shared/projectDoc/embridge";
import { ProjectFileError } from "../../shared/projectDoc/file";
import { fromJson } from "../../shared/projectDoc/json";
import { fromYaml } from "../../shared/projectDoc/yaml";
import type { DocAttachment, DocComment, DocSubitem, ProjectDoc } from "../../shared/projectDoc/model";
import { parseDateValue, toISO } from "../design/core/dates";
import { suggestedRoleForTitle as roleFor } from "../design/core/statuses";
import { count } from "../design/core/text";

export type { ImportPlan, PlanItem, PlanList };

const PRIORITY_WORDS: Record<string, ItemPriority> = { urgent: "URGENT", high: "HIGH", medium: "MEDIUM", low: "LOW" };
const isoOf = (v: string | null | undefined) => (v ? toISO(parseDateValue(v)) : null);
const blank = (): ImportPlan => ({ name: "", lists: [], labels: [], warnings: [] });
const addLabel = (plan: ImportPlan, name: string, color?: LabelColor) => {
  if (!plan.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) plan.labels.push({ name, color });
};

const NO_TITLE = "The file has no title, so name the project above";

/** Earlier exports from this app put the project in a `# ` heading and lists in `## ` headings. */
const isLegacyMarkdown = (text: string) => /^## \S/m.test(text) && (text.match(/^# \S/gm)?.length ?? 0) <= 1 && !/<!--[\s\S]*format:\s*embridge/i.test(text);

const withAttachments = (description: string | null, attachments: DocAttachment[]) => {
  if (!attachments.length) return description ?? undefined;
  const links = attachments.map((a) => `- ${a.image ? "!" : ""}[${a.label || a.url}](${a.url})`).join("\n");
  return `${description ? `${description}\n\n` : ""}Attachments:\n${links}`;
};
const planComments = (cs: DocComment[]) => cs.map((c) => ({ text: c.text, author: c.author, at: c.at, depth: c.depth })).filter((c) => c.text.trim());

/** A project document (from any codec) as an import plan. Fields Todoi has no place for are named in the warnings. */
export function docToPlan(doc: ProjectDoc, warnings: string[], fallbackName: string): ImportPlan {
  const plan: ImportPlan = { ...blank(), name: doc.title || fallbackName, warnings: [...warnings] };
  const leftOut = new Set<string>();
  let linked = 0;
  const sub = (s: DocSubitem) => {
    Object.keys(s.fields).forEach((k) => leftOut.add(k));
    linked += s.attachments.length;
    return { title: s.title, done: s.done, description: withAttachments(s.description, s.attachments), comments: planComments(s.comments) };
  };
  for (const l of doc.lists) {
    const list: PlanList = { name: l.name, statusRole: roleFor(l.name), items: [] };
    for (const it of l.items) {
      Object.keys(it.fields).forEach((k) => leftOut.add(k));
      linked += it.attachments.length;
      it.labels.forEach((n) => addLabel(plan, n));
      list.items.push({ title: it.title, description: withAttachments(it.description, it.attachments), start: it.start, due: it.due, labels: it.labels, assignee: it.assignees[0] ?? null, priority: it.priority, status: it.status, done: it.done, comments: planComments(it.comments), subitems: it.subitems.map(sub) });
    }
    plan.lists.push(list);
  }
  if (leftOut.size) plan.warnings.push(`Fields Todoi doesn't use are left out: ${[...leftOut].sort().join(", ")}`);
  if (linked) plan.warnings.push(`${count(linked, "attachment link")} added to descriptions; the files themselves aren't copied`);
  return plan;
}

/** Embridge Markdown (github.com/embridge-foundation/embridge): `# List` headings, `- [ ]` items, metadata lines, `>` comments. */
export function parseMarkdown(text: string, fileName?: string | null): ImportPlan {
  const fallback = fileName?.replace(/\.[^.]+$/, "") ?? "";
  if (isLegacyMarkdown(text)) {
    const plan = parseLegacyMarkdown(text);
    return plan.name || !fallback ? plan : { ...plan, name: fallback, warnings: plan.warnings.filter((w) => w !== NO_TITLE) };
  }
  const { doc, warnings } = fromEmbridge(text);
  const plan = docToPlan(doc, warnings, fallback);
  if (!plan.name) plan.warnings.push(NO_TITLE);
  return plan;
}

/** The dialect this app exported before it wrote Embridge: `# Project` · `## List` · `- [ ] KEY Title — High · due 2026-09-12 · #design` (keys are dropped) · indented `- [ ]` subitems. */
function parseLegacyMarkdown(text: string): ImportPlan {
  const plan = blank();
  let list: PlanList | null = null;
  let item: PlanItem | null = null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const h1 = /^#\s+(.+)$/.exec(raw);
    if (h1) {
      plan.name = h1[1]!.trim();
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(raw);
    if (h2) {
      list = { name: h2[1]!.trim(), statusRole: roleFor(h2[1]!), items: [] };
      plan.lists.push(list);
      item = null;
      continue;
    }
    const sub = /^(\s{2,}|\t)-\s+\[( |x|X)\]\s+(.+)$/.exec(raw);
    if (sub && item) {
      item.subitems.push({ title: sub[3]!.trim(), done: sub[2] !== " " });
      continue;
    }
    const li = /^-\s+\[( |x|X)\]\s+(.+)$/.exec(raw);
    if (li) {
      if (!list) {
        list = { name: "Imported", items: [] };
        plan.lists.push(list);
      }
      const [body, meta] = li[2]!.split(/\s+—\s+/);
      let title = body!.trim();
      const key = /^[A-Z][A-Z0-9]{1,5}-\d+\s+/.exec(title);
      if (key) title = title.slice(key[0].length);
      item = { title, labels: [], done: li[1] !== " ", subitems: [] };
      for (const part of (meta ?? "").split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean)) {
        if (part.startsWith("#")) {
          item.labels.push(part.slice(1));
          addLabel(plan, part.slice(1));
        } else if (/^due\s+/i.test(part)) item.due = isoOf(part.replace(/^due\s+/i, ""));
        else if (PRIORITY_WORDS[part.toLowerCase()]) item.priority = PRIORITY_WORDS[part.toLowerCase()];
        else if (part.startsWith("@")) item.assignee = part.slice(1);
        else plan.warnings.push(`“${title}”: “${part}” isn't a property Todoi reads, so it's left out`);
      }
      list.items.push(item);
      continue;
    }
    if (item && raw.trim() && !raw.startsWith("#")) item.description = `${item.description ? item.description + "\n" : ""}${raw.trim()}`;
    else if (!item && !list && raw.trim() && plan.name) plan.description = `${plan.description ? plan.description + "\n" : ""}${raw.trim()}`;
  }
  if (!plan.name) plan.warnings.push(NO_TITLE);
  return plan;
}

/** A Todoi project file (todoi.com/schema/project-v1.json) in JSON or YAML; `{` first means JSON. */
export function parseProjectFile(text: string, fileName?: string | null): ImportPlan {
  const fallback = fileName?.replace(/\.[^.]+$/, "") ?? "";
  try {
    const { doc, warnings } = /^\s*[{[]/.test(text) ? fromJson(text) : fromYaml(text);
    const plan = docToPlan(doc, warnings, fallback);
    if (!plan.name) plan.warnings.push(NO_TITLE);
    return plan;
  } catch (e) {
    if (!(e instanceof ProjectFileError)) throw e;
    return { ...blank(), name: fallback, warnings: e.problems };
  }
}

interface TrelloBoard {
  name?: string;
  desc?: string;
  lists?: Array<{ id: string; name: string; closed?: boolean; pos?: number }>;
  cards?: Array<{ id: string; name: string; desc?: string; idList: string; closed?: boolean; due?: string | null; dueComplete?: boolean; labels?: Array<{ name?: string; color?: string | null }>; idChecklists?: string[]; idMembers?: string[] }>;
  checklists?: Array<{ id: string; idCard: string; checkItems?: Array<{ name: string; state: string; pos?: number }> }>;
  members?: Array<{ id: string; fullName?: string; username?: string }>;
}
const TRELLO_COLORS: Record<string, LabelColor> = { green: "green", yellow: "yellow", orange: "orange", red: "red", purple: "pink", blue: "blue", sky: "teal", lime: "lime", pink: "pink", black: "teal" };

/** A Trello board export (Menu › More › Print and export › Export as JSON). */
export function parseTrello(json: string): ImportPlan {
  const plan = blank();
  let b: TrelloBoard;
  try {
    b = JSON.parse(json) as TrelloBoard;
  } catch {
    plan.warnings.push("Not valid JSON");
    return plan;
  }
  plan.name = b.name ?? "Trello import";
  plan.description = b.desc || undefined;
  const members = new Map((b.members ?? []).map((m) => [m.id, m.fullName ?? m.username ?? "Member"]));
  const checklists = new Map((b.checklists ?? []).map((c) => [c.id, c]));
  const lists = (b.lists ?? []).filter((l) => !l.closed).sort((a, c) => (a.pos ?? 0) - (c.pos ?? 0));
  const byList = new Map(lists.map((l) => [l.id, { name: l.name, statusRole: roleFor(l.name), items: [] as PlanItem[] }]));
  let skipped = 0;
  for (const c of b.cards ?? []) {
    const target = byList.get(c.idList);
    if (!target || c.closed) {
      skipped++;
      continue;
    }
    const labels = (c.labels ?? []).map((l) => l.name?.trim() || (l.color ?? "label")).filter(Boolean);
    labels.forEach((n, i) => addLabel(plan, n, TRELLO_COLORS[c.labels?.[i]?.color ?? ""]));
    const subs = (c.idChecklists ?? []).flatMap((id) => (checklists.get(id)?.checkItems ?? []).sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0)).map((ci) => ({ title: ci.name, done: ci.state === "complete" })));
    target.items.push({ title: c.name, description: c.desc || undefined, due: isoOf(c.due ?? null), labels, assignee: c.idMembers?.[0] ? members.get(c.idMembers[0]) : null, done: !!c.dueComplete, subitems: subs });
  }
  plan.lists = [...byList.values()];
  if (skipped) plan.warnings.push(`${count(skipped, "archived card")} left out`);
  if ((b.cards ?? []).some((c) => (c.idMembers?.length ?? 0) > 1)) plan.warnings.push("Cards with several members keep only the first as assignee");
  return plan;
}

/** RFC 4180-ish CSV → rows of cells. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const COLS: Record<string, string[]> = { title: ["title", "name", "item", "card", "summary"], list: ["list", "column", "status", "stage"], due: ["due", "due date", "deadline"], labels: ["labels", "label", "tags"], assignee: ["assignee", "assigned", "owner", "member"], priority: ["priority"], description: ["description", "notes", "body"], done: ["done", "completed", "complete"] };

/** Header row names the columns (Title, List, Due, Labels, Assignee, Priority, Description, Done); the rest are ignored. */
export function parseCsv(text: string, name = "CSV import"): ImportPlan {
  const plan = blank();
  plan.name = name;
  const rows = parseCsvRows(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (k: string) => header.findIndex((h) => COLS[k]!.includes(h));
  const ti = col("title");
  if (ti < 0) {
    plan.warnings.push("No Title column — the first row must name the columns");
    return plan;
  }
  const li = col("list"), di = col("due"), lbi = col("labels"), ai = col("assignee"), pi = col("priority"), dsi = col("description"), doi = col("done");
  const ignored = header.filter((h, i) => ![ti, li, di, lbi, ai, pi, dsi, doi].includes(i) && h);
  if (ignored.length) plan.warnings.push(`Ignored column${ignored.length === 1 ? "" : "s"}: ${ignored.join(", ")}`);
  const byList = new Map<string, PlanList>();
  for (const r of rows.slice(1)) {
    const title = r[ti]?.trim();
    if (!title) continue;
    const listName = (li >= 0 && r[li]?.trim()) || "Imported";
    let list = byList.get(listName);
    if (!list) {
      list = { name: listName, statusRole: roleFor(listName), items: [] };
      byList.set(listName, list);
    }
    const labels = lbi >= 0 ? (r[lbi] ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];
    labels.forEach((n) => addLabel(plan, n));
    const doneRaw = doi >= 0 ? (r[doi] ?? "").trim().toLowerCase() : "";
    list.items.push({ title, description: dsi >= 0 ? r[dsi]?.trim() || undefined : undefined, due: di >= 0 ? isoOf(r[di]) : null, labels, assignee: ai >= 0 ? r[ai]?.trim() || null : null, priority: pi >= 0 ? (PRIORITY_WORDS[(r[pi] ?? "").trim().toLowerCase()] ?? null) : null, done: ["yes", "true", "1", "x", "done"].includes(doneRaw), subitems: [] });
  }
  plan.lists = [...byList.values()];
  return plan;
}

export const planCounts = (plan: ImportPlan) => {
  const items = plan.lists.reduce((n, l) => n + l.items.length, 0);
  const subitems = plan.lists.reduce((n, l) => n + l.items.reduce((m, it) => m + it.subitems.length, 0), 0);
  const comments = plan.lists.reduce((n, l) => n + l.items.reduce((m, it) => m + (it.comments?.length ?? 0) + it.subitems.reduce((k, s) => k + (s.comments?.length ?? 0), 0), 0), 0);
  return { lists: plan.lists.length, items, subitems, labels: plan.labels.length, comments };
};
