// Import — Markdown (the Embridge format Export writes), a Trello board's JSON, or a CSV: pick or
// paste, review what will be created (counts, lists, field mapping, warnings), then create a new
// project in a group. Nothing is written before Create; the server lands the whole plan in one
// transaction. Spec: DESIGN.md › Storage & sync › Import.
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import type { ImportPlan } from "../../shared/import";
import { newId } from "../data/mutations";
import { useProjectMutations } from "../data/projects";
import { useGroups } from "../data/queries";
import { Button } from "../design/core/Button";
import { Icon, type IconName } from "../design/core/Icon";
import { Segmented } from "../design/core/Segmented";
import { Select } from "../design/core/Select";
import { count } from "../design/core/text";
import { TextField } from "../design/core/TextField";
import { SettingsCard, SettingsPageFrame } from "../design/settings/SettingsShell";
import { quote, useFeedback } from "./feedback";
import { parseCsv, parseMarkdown, parseTrello, planCounts } from "./importData";
import "./import.css";

type Source = "md" | "trello" | "csv";
interface SourceSpec {
  label: string;
  icon: IconName;
  accept: string;
  hint: string;
  placeholder: string;
  parse: (text: string, fileName: string | null) => ImportPlan;
  /** Source field → Todoi field → note, for the Review table */
  mapping: Array<[string, string, string]>;
}
const SOURCES: Record<Source, SourceSpec> = {
  md: {
    label: "Markdown",
    icon: "file-text",
    accept: ".md,.markdown,.txt",
    hint: "The Embridge format — what Export writes: # Project, ## List, - [ ] items",
    placeholder: "# Project\n\n## To-do\n\n- [ ] First item — High · due 2026-10-12 · #design",
    parse: parseMarkdown,
    mapping: [["# Heading", "Project", "Name"], ["## Heading", "List", "Order kept; To-do / Doing / Done link to their statuses"], ["- [ ] line", "Item", "Title, done state, meta after —"], ["Indented - [ ]", "Subitem", "Checked state kept"], ["#label · due · priority", "Properties", "Labels are created when missing"]],
  },
  trello: {
    label: "Trello",
    icon: "kanban",
    accept: ".json",
    hint: "A board's JSON export: lists, cards, checklists, labels and members",
    placeholder: '{ "name": "Board", "lists": [...], "cards": [...] }',
    parse: parseTrello,
    mapping: [["Board", "Project", "Name and description"], ["List", "List", "Order kept; archived lists left out"], ["Card", "Item", "Title, description, due, labels"], ["Checklist item", "Subitem", "Checked state kept"], ["Member", "Assignee", "Kept as a name; matched to members by name"], ["Attachment", "—", "Files stay in Trello"]],
  },
  csv: {
    label: "CSV",
    icon: "table",
    accept: ".csv,.txt",
    hint: "One row per item; the first row names the columns (Title, List, Due, Labels, Assignee, Priority, Done)",
    placeholder: "Title,List,Due,Labels\nFirst item,To-do,2026-10-12,design",
    parse: (text, fileName) => parseCsv(text, fileName?.replace(/\.[^.]+$/, "") ?? "CSV import"),
    mapping: [["Title", "Item title", "Required"], ["List", "List", "Created when missing"], ["Due", "Due date", "ISO or Sep 12, 2026"], ["Labels", "Labels", "Comma- or semicolon-separated; created when missing"], ["Assignee", "Assignee", "Matched to members by name"], ["Priority · Done · Description", "Properties", "Optional"], ["Other columns", "—", "Ignored; listed under warnings"]],
  },
};
const SOURCE_OPTIONS = (Object.keys(SOURCES) as Source[]).map((id) => ({ id, label: SOURCES[id].label, icon: SOURCES[id].icon }));

export function ImportScreen() {
  const [source, setSource] = useState<Source>("md");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const groups = useGroups();
  const pm = useProjectMutations();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const src = SOURCES[source];
  const busy = pm.importProject.isPending;
  const review = (t: string) => {
    const p = src.parse(t, fileName);
    setPlan(p);
    setName(p.name);
    setGroupId((g) => g ?? groups.data?.[0]?.id ?? null);
  };
  const create = () => {
    if (!plan || !groupId || !name.trim()) return;
    const id = newId();
    pm.importProject.mutate(
      { id, groupId, name: name.trim(), plan },
      {
        onSuccess: (made) => {
          notify({ message: `Imported ${quote(name.trim())} — ${count(made.items, "item")} in ${count(plan.lists.length, "list")}`, icon: "upload" });
          void navigate({ to: "/p/$projectId", params: { projectId: id }, search: {} });
        },
        onError: (e) => notify({ message: e instanceof Error ? e.message : "The import failed", icon: "circle-alert" }),
      },
    );
  };
  const counts = plan ? planCounts(plan) : null;
  return (
    <SettingsPageFrame title="Import" crumb="A new project is created from the file. Review every change before it lands.">
      <SettingsCard
        group={{
          id: "source",
          title: "Source",
          rows: [
            { id: "format", label: "Format", hint: src.hint, control: <Segmented aria-label="Format" value={source} options={SOURCE_OPTIONS} onChange={(v) => {
              setSource(v);
              setPlan(null);
            }} /> },
            {
              id: "file",
              label: "File",
              hint: fileName ?? "Pick a file, or paste its contents below",
              control: (
                <>
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
                </>
              ),
            },
          ],
        }}
      >
        <div className="td-imp-paste">
          <TextField multiline rows={6} value={text} aria-label={`${src.label} contents`} placeholder={src.placeholder} onChange={(e) => setText(e.target.value)} />
          <div className="td-imp-paste-foot">
            <Button variant="primary" icon="file-search" disabled={!text.trim()} onClick={() => review(text)}>
              Review import
            </Button>
          </div>
        </div>
      </SettingsCard>
      {plan && counts ? (
        <SettingsCard
          group={{
            id: "review",
            title: "Review",
            tone: plan.warnings.length ? "warn" : undefined,
            sub: `${count(counts.lists, "list")} · ${count(counts.items, "item")} · ${count(counts.subitems, "subitem")} · ${count(counts.labels, "label")}`,
            rows: [
              { id: "name", label: "Project name", hint: "Created in the group you pick", control: <TextField value={name} aria-label="Project name" onChange={(e) => setName(e.target.value)} /> },
              { id: "group", label: "Project group", control: <Select aria-label="Project group" value={groupId} options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name, icon: "folders" as IconName }))} onChange={(v) => setGroupId(v)} placement="bottom-end" tier="detached" width={220} /> },
            ],
          }}
        >
          <div className="td-imp-body">
            <div className="td-imp-head">Lists that will be created</div>
            <ul className="td-imp-list">
              {plan.lists.map((l) => (
                <li key={l.name}>
                  {l.name} · {count(l.items.length, "item")}
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
                {src.mapping.map((r) => (
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
        </SettingsCard>
      ) : null}
      {plan && counts ? (
        <SettingsCard
          group={{
            id: "create",
            title: "Create",
            rows: [
              {
                id: "confirm",
                label: "Create the project",
                hint: "Nothing is written until you confirm",
                control: (
                  <>
                    <Button variant="ghost" onClick={() => setPlan(null)}>
                      Cancel
                    </Button>
                    <Button variant="primary" icon="plus" disabled={busy || !name.trim() || !groupId || !counts.items} onClick={create}>
                      {busy ? "Creating…" : "Create project"}
                    </Button>
                  </>
                ),
              },
            ],
          }}
        />
      ) : null}
    </SettingsPageFrame>
  );
}
