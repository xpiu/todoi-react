// Export builders — pure: an item (with subitems, description, attachments, comments) or a view (the
// items shown, filters and sort applied) as Markdown (the Embridge format Import reads) or CSV
// (Title, List, Status, Priority, Due, Labels, Assignee, Key). PDF goes through the browser print
// pipeline. Spec: DESIGN.md › Export & print.
import type { Item, Label } from "../data/api";
import { STATUSES } from "../design/core/statuses";
import { PRIORITY_LABEL, keyOf, type Person } from "./items";

export interface ExportContext {
  prefix: string;
  labels: Label[];
  people: Person[];
  listName: (listId: string) => string;
}

const statusName = (it: Pick<Item, "status" | "done">) => STATUSES.find((s) => s.id === (it.status ?? (it.done ? "DONE" : null)))?.name ?? "";
const labelNames = (it: Item, ctx: ExportContext) => it.labelIds.map((id) => ctx.labels.find((l) => l.id === id)?.name).filter((x): x is string => !!x);
const assigneeNames = (it: Item, ctx: ExportContext) => it.assigneeIds.map((id) => ctx.people.find((p) => p.id === id)?.name).filter((x): x is string => !!x);

/** One item as Markdown: heading with key, a property line, the description, subitems as a task list, attachments, comments. */
export function itemToMarkdown(it: Item, ctx: ExportContext, extra: { subitems?: Item[]; attachments?: Array<{ name: string }>; comments?: Array<{ author: string; body: string; date: string }> } = {}): string {
  const key = keyOf(it, ctx.prefix);
  const out: string[] = [`# ${key ? `${key} ` : ""}${it.title}`, ""];
  const props = [`List: ${ctx.listName(it.listId)}`, statusName(it) && `Status: ${statusName(it)}`, it.priority && `Priority: ${PRIORITY_LABEL[it.priority]}`, it.startDate && `Start: ${it.startDate}`, it.dueDate && `Due: ${it.dueDate}`, labelNames(it, ctx).length && `Labels: ${labelNames(it, ctx).join(", ")}`, assigneeNames(it, ctx).length && `Assignees: ${assigneeNames(it, ctx).join(", ")}`].filter(Boolean);
  out.push(props.join(" · "), "");
  if (it.description?.trim()) out.push(it.description.trim(), "");
  if (extra.subitems?.length) {
    out.push("## Subitems", "", ...extra.subitems.map((s) => `- [${s.done ? "x" : " "}] ${s.title}`), "");
  }
  if (extra.attachments?.length) out.push("## Attachments", "", ...extra.attachments.map((a) => `- ${a.name}`), "");
  if (extra.comments?.length) {
    out.push("## Comments", "");
    for (const c of extra.comments) out.push(`**${c.author}** · ${c.date}`, "", c.body.trim(), "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** A view as Markdown: one section per list, items as a task list with their key and meta. */
export function viewToMarkdown(title: string, lists: Array<{ name: string; items: Item[] }>, ctx: ExportContext): string {
  const out = [`# ${title}`, ""];
  for (const l of lists) {
    out.push(`## ${l.name}`, "");
    for (const it of l.items) {
      const key = keyOf(it, ctx.prefix);
      const meta = [it.priority && PRIORITY_LABEL[it.priority], it.dueDate && `due ${it.dueDate}`, ...labelNames(it, ctx).map((n) => `#${n}`)].filter(Boolean).join(" · ");
      out.push(`- [${it.done ? "x" : " "}] ${key ? `${key} ` : ""}${it.title}${meta ? ` — ${meta}` : ""}`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

const cell = (v: string | null | undefined) => {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per item. */
export function itemsToCsv(items: Item[], ctx: ExportContext): string {
  const rows = [["Title", "List", "Status", "Priority", "Due", "Labels", "Assignee", "Key"]];
  for (const it of items) rows.push([it.title, ctx.listName(it.listId), statusName(it), it.priority ? PRIORITY_LABEL[it.priority] : "", it.dueDate ?? "", labelNames(it, ctx).join("; "), assigneeNames(it, ctx).join("; "), keyOf(it, ctx.prefix) ?? ""]);
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

/** Hand the browser a file. */
export function downloadText(name: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "export";
