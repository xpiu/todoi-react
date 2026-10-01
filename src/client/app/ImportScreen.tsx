// Import — Markdown (the Embridge format Export writes), a Trello board's JSON, or a CSV: pick or
// paste, review what will be created (counts, lists, field mapping, warnings), then create a new
// project in a group. Nothing is written before Create. Spec: DESIGN.md › Storage & sync › Import.
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { newId } from "../data/mutations";
import { useProjectMutations } from "../data/projects";
import { useGroups } from "../data/queries";
import { api, unwrap } from "../data/api";
import { Button } from "../design/core/Button";
import { Icon, type IconName } from "../design/core/Icon";
import { Segmented } from "../design/core/Segmented";
import { Select } from "../design/core/Select";
import { TextField } from "../design/core/TextField";
import { quote, useFeedback } from "./feedback";
import { parseCsv, parseMarkdown, parseTrello, planCounts, type ImportPlan } from "./importData";
import "./import.css";

type Source = "md" | "trello" | "csv";
const SOURCES: Array<{ id: Source; label: string; icon: IconName; accept: string; hint: string }> = [
  { id: "md", label: "Markdown", icon: "file-text", accept: ".md,.markdown,.txt", hint: "The Embridge format — what Export writes: # Project, ## List, - [ ] items" },
  { id: "trello", label: "Trello", icon: "kanban", accept: ".json", hint: "A board's JSON export: lists, cards, checklists, labels and members" },
  { id: "csv", label: "CSV", icon: "table", accept: ".csv,.txt", hint: "One row per item; the first row names the columns (Title, List, Due, Labels, Assignee, Priority, Done)" },
];
const MAPPING: Record<Source, Array<[string, string, string]>> = {
  md: [["# Heading", "Project", "Name"], ["## Heading", "List", "Order kept; To-do / Doing / Done link to their statuses"], ["- [ ] line", "Item", "Title, done state, meta after —"], ["Indented - [ ]", "Subitem", "Checked state kept"], ["#label · due · priority", "Properties", "Labels are created when missing"]],
  trello: [["Board", "Project", "Name and description"], ["List", "List", "Order kept; archived lists left out"], ["Card", "Item", "Title, description, due, labels"], ["Checklist item", "Subitem", "Checked state kept"], ["Member", "Assignee", "Kept as a name; matched to members by name"], ["Attachment", "—", "Files stay in Trello"]],
  csv: [["Title", "Item title", "Required"], ["List", "List", "Created when missing"], ["Due", "Due date", "ISO or Sep 12, 2026"], ["Labels", "Labels", "Comma- or semicolon-separated; created when missing"], ["Assignee", "Assignee", "Matched to members by name"], ["Priority · Done · Description", "Properties", "Optional"], ["Other columns", "—", "Ignored; listed under warnings"]],
};

export function ImportScreen() {
  const [source, setSource] = useState<Source>("md");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const groups = useGroups();
  const pm = useProjectMutations();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const src = SOURCES.find((s) => s.id === source)!;
  const review = (t: string) => {
    const p = source === "md" ? parseMarkdown(t) : source === "trello" ? parseTrello(t) : parseCsv(t, fileName?.replace(/\.[^.]+$/, "") ?? "CSV import");
    setPlan(p);
    setName(p.name);
    setGroupId((g) => g ?? groups.data?.[0]?.id ?? null);
  };
  const create = async () => {
    if (!plan || !groupId || !name.trim()) return;
    setBusy(true);
    try {
      const projectId = newId();
      const made = await pm.createProject.mutateAsync({ id: projectId, groupId, name: name.trim(), lists: plan.lists.map((l) => [l.name, l.statusRole ?? null] as [string, typeof l.statusRole]) });
      const listIds = new Map(made.lists.map((l, i) => [plan.lists[i]!.name, (l as { id: string; name: string }).id]));
      const labelIds = new Map<string, string>();
      for (const l of plan.labels) {
        const row = await api.api.labels.$post({ json: { id: newId(), projectId, name: l.name, color: (l.color as "blue") ?? ["green", "yellow", "orange", "red", "pink", "blue", "teal", "lime"][labelIds.size % 8]! } }).then((r) => unwrap<{ id: string }>(r));
        labelIds.set(l.name.toLowerCase(), row.id);
      }
      let n = 0;
      for (const l of plan.lists) {
        const listId = listIds.get(l.name);
        if (!listId) continue;
        for (const it of l.items) {
          const id = newId();
          await api.api.items.$post({ json: { id, title: it.title, listId, description: it.description, dueDate: it.due ?? undefined, priority: it.priority ?? undefined, status: it.done ? "DONE" : (l.statusRole ?? undefined), labelIds: it.labels.map((x) => labelIds.get(x.toLowerCase())).filter((x): x is string => !!x) } }).then((r) => unwrap(r));
          if (it.done) await api.api.items[":id"].$patch({ param: { id }, json: { done: true } });
          for (const s of it.subitems) {
            const sid = newId();
            await api.api.items.$post({ json: { id: sid, title: s.title, listId, parentItemId: id } }).then((r) => unwrap(r));
            if (s.done) await api.api.items[":id"].$patch({ param: { id: sid }, json: { done: true } });
          }
          n++;
        }
      }
      pm.refresh(projectId);
      notify({ message: `Imported ${quote(name.trim())} — ${n} item${n === 1 ? "" : "s"} in ${plan.lists.length} list${plan.lists.length === 1 ? "" : "s"}`, icon: "upload" });
      void navigate({ to: "/p/$projectId", params: { projectId }, search: {} });
    } catch (e) {
      notify({ message: e instanceof Error ? e.message : "The import failed", icon: "circle-alert" });
    } finally {
      setBusy(false);
    }
  };
  const counts = plan ? planCounts(plan) : null;
  return (
    <div className="td-imp">
      <div className="td-imp-inner">
        <h1 className="td-imp-title">Import</h1>
        <p className="td-imp-crumb">A new project is created from the file. Review every change before it lands.</p>
        <section className="td-set-group">
          <div className="td-set-grouphead">
            <h2 className="td-set-grouptitle">Source</h2>
          </div>
          <div className="td-set-row">
            <div className="td-set-rowtext">
              <span className="td-set-rowlabel">Format</span>
              <span className="td-set-rowhint">{src.hint}</span>
            </div>
            <div className="td-set-rowctl">
              <Segmented aria-label="Format" value={source} options={SOURCES.map((s) => ({ id: s.id, label: s.label, icon: s.icon }))} onChange={(v) => {
                setSource(v);
                setPlan(null);
              }} />
            </div>
          </div>
          <div className="td-set-row">
            <div className="td-set-rowtext">
              <span className="td-set-rowlabel">File</span>
              <span className="td-set-rowhint">{fileName ?? "Pick a file, or paste its contents below"}</span>
            </div>
            <div className="td-set-rowctl">
              <input ref={fileRef} type="file" accept={src.accept} className="td-imp-file" aria-hidden tabIndex={-1} onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const t = await f.text();
                setFileName(f.name);
                setText(t);
                review(t);
                e.target.value = "";
              }} />
              <Button icon="upload" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
            </div>
          </div>
          <div className="td-imp-paste">
            <TextField multiline rows={6} value={text} aria-label={`${src.label} contents`} placeholder={source === "md" ? "# Project\n\n## To-do\n\n- [ ] First item — High · due 2026-10-12 · #design" : source === "trello" ? "{ \"name\": \"Board\", \"lists\": [...], \"cards\": [...] }" : "Title,List,Due,Labels\nFirst item,To-do,2026-10-12,design"} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key.length === 1 && e.stopPropagation()} />
            <div className="td-imp-paste-foot">
              <Button variant="primary" icon="file-search" disabled={!text.trim()} onClick={() => review(text)}>
                Review import
              </Button>
            </div>
          </div>
        </section>
        {plan && counts ? (
          <section className="td-set-group" data-tone={plan.warnings.length ? "warn" : undefined}>
            <div className="td-set-grouphead">
              <h2 className="td-set-grouptitle">Review</h2>
              <span className="td-set-grouppath">
                {counts.lists} list{counts.lists === 1 ? "" : "s"} · {counts.items} item{counts.items === 1 ? "" : "s"} · {counts.subitems} subitem{counts.subitems === 1 ? "" : "s"} · {counts.labels} label{counts.labels === 1 ? "" : "s"}
              </span>
            </div>
            <div className="td-set-row">
              <div className="td-set-rowtext">
                <span className="td-set-rowlabel">Project name</span>
                <span className="td-set-rowhint">Created in the group you pick</span>
              </div>
              <div className="td-set-rowctl">
                <TextField value={name} aria-label="Project name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key.length === 1 && e.stopPropagation()} />
              </div>
            </div>
            <div className="td-set-row">
              <div className="td-set-rowtext">
                <span className="td-set-rowlabel">Project group</span>
              </div>
              <div className="td-set-rowctl">
                <Select aria-label="Project group" value={groupId} options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name, icon: "folders" as IconName }))} onChange={(v) => setGroupId(v)} placement="bottom-end" tier="detached" width={220} />
              </div>
            </div>
            <div className="td-imp-body">
              <div className="td-imp-head">Lists that will be created</div>
              <ul className="td-imp-list">
                {plan.lists.map((l) => (
                  <li key={l.name}>
                    {l.name} · {l.items.length} item{l.items.length === 1 ? "" : "s"}
                    {l.statusRole ? ` · linked to ${l.statusRole}` : ""}
                  </li>
                ))}
                {!plan.lists.length ? <li>No lists found</li> : null}
              </ul>
              <div className="td-imp-head">How {src.label} fields map</div>
              <table className="td-imp-table">
                <thead>
                  <tr>
                    <th>{src.label}</th>
                    <th>Todoi</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {MAPPING[source].map((r) => (
                    <tr key={r[0]}>
                      <td className="td-imp-strong">{r[0]}</td>
                      <td>{r[1]}</td>
                      <td>{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.warnings.length ? (
                <>
                  <div className="td-imp-head">Warnings</div>
                  {plan.warnings.map((w) => (
                    <div key={w} className="td-imp-warn">
                      <Icon name="circle-alert" size={14} />
                      {w}
                    </div>
                  ))}
                </>
              ) : null}
            </div>
            <div className="td-set-row td-imp-foot">
              <div className="td-set-rowtext">
                <span className="td-set-rowlabel">Create the project</span>
                <span className="td-set-rowhint">Nothing is written until you confirm</span>
              </div>
              <div className="td-set-rowctl">
                <Button variant="ghost" onClick={() => setPlan(null)}>
                  Cancel
                </Button>
                <Button variant="primary" icon="plus" disabled={busy || !name.trim() || !groupId || !counts.items} onClick={() => void create()}>
                  {busy ? "Creating…" : "Create project"}
                </Button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
