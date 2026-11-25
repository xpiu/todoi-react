// Import — Markdown (the Embridge format Export writes), a Trello board's JSON, or a CSV: pick or
// paste, review what will be created (counts, lists, field mapping, warnings), then create a new
// project in a group. Nothing is written before Create; the server lands the whole plan in one
// transaction. Spec: DESIGN.md › Storage & sync › Import.
import { useRef, useState } from "react";

import type { ImportPlan } from "../../shared/import";
import { STATUS_NAMES } from "../../shared/item-status";
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
import { parseCsv, parseMarkdown, parseProjectFile, parseTrello, planCounts } from "./importData";
import "./import.css";
import { useOpenProject } from "./useOpenProject";

type Source = "md" | "file" | "trello" | "csv";
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
    hint: "Embridge, the Markdown task-list format that Export writes",
    placeholder: "# To-do\n- [ ] First item\nprio: high, due: 2026-10-12, tags: design\n  - [ ] A subitem",
    parse: parseMarkdown,
    mapping: [
      ["# Heading", "List", "Kept in order. Lists named like a status (Backlog, To-do, Doing, Done) link to it"],
      ["- [ ] or 1. [ ] line", "Item", "Title and done state"],
      ["Indented item", "Subitem", "Deeper levels become subitems of the top item"],
      ["\"…\" or description:", "Description", "Can span several lines"],
      ["status · prio · tags · on · due", "Properties", "Dates: on is the start, due the due date. Tags become labels"],
      ["> comment", "Comment", "Posted by you, headed with the original author and date"],
      ["- [name](path)", "Attachment link", "Listed in the description; files aren't copied"],
      ["title: in the <!-- --> block", "Project name", "Else the file's name"],
    ],
  },
  file: {
    label: "Todoi file",
    icon: "file-code",
    accept: ".json,.yaml,.yml",
    hint: "Todoi's JSON or YAML project format, as Git sync writes it",
    placeholder: 'format: todoi.project\nversion: 1\ntitle: "Website"\nlists:\n  - name: "To-do"\n    items:\n      - title: "First item"\n        due: "2026-10-12"',
    parse: parseProjectFile,
    mapping: [
      ["lists[].name", "List", "Kept in order. A list named after a status (To-do, Done) is linked to it"],
      ["items[] · subitems[]", "Item · Subitem", "Subitems can't have subitems of their own"],
      ["status · priority · start · due", "Properties", "Same values as the schema, todoi.com/schema/project-v1.json"],
      ["labels · assignees", "Labels · Assignee", "Labels are created. Only the first assignee is kept"],
      ["comments[]", "Comment", "Posted by you, headed with the original author and date"],
      ["fields", "—", "Left out; listed under Check before creating"],
    ],
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
  const openProject = useOpenProject();
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
        onSuccess: () => {
          // The counts Review showed, so the two never disagree.
          const n = planCounts(plan);
          notify({ message: `Imported ${quote(name.trim())}: ${[count(n.lists, "list"), count(n.items, "item"), n.subitems ? count(n.subitems, "subitem") : null].filter(Boolean).join(", ")}`, icon: "upload" });
          openProject(id);
        },
      },
    );
  };
  const counts = plan ? planCounts(plan) : null;
  const refused = !!plan && !plan.lists.length && plan.warnings.length > 0;
  return (
    <SettingsPageFrame title="Import" crumb="Create a project from a Markdown, JSON, YAML, Trello or CSV file.">
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
                  <input ref={fileRef} type="file" accept={src.accept} className="td-import-file" aria-hidden tabIndex={-1} onChange={async (e) => {
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
        <div className="td-import-paste">
          <TextField multiline rows={6} value={text} aria-label={`${src.label} contents`} placeholder={src.placeholder} onChange={(e) => setText(e.target.value)} />
          <div className="td-import-paste-foot">
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
            // A refused file shows its reasons first: no counts, no name or group to fill in.
            sub: refused ? undefined : [count(counts.lists, "list"), count(counts.items, "item"), count(counts.subitems, "subitem"), count(counts.labels, "label"), counts.comments ? count(counts.comments, "comment") : null].filter(Boolean).join(" · "),
            rows: refused ? [] : [
              { id: "name", label: "Project name", hint: "Created in the group you pick", control: <TextField value={name} aria-label="Project name" onChange={(e) => setName(e.target.value)} /> },
              { id: "group", label: "Project group", control: <Select aria-label="Project group" value={groupId} options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name, icon: "folders" as IconName }))} onChange={(v) => setGroupId(v)} placement="bottom-end" tier="detached" width={220} /> },
            ],
          }}
        >
          <div className="td-import-body">
            {plan.warnings.length ? (
              <>
                <div className="td-import-head">{plan.lists.length ? "Check before creating" : "This file can't be imported"}</div>
                {plan.warnings.map((w) => (
                  <div key={w} className="td-import-warn">
                    <Icon name="circle-alert" size={14} />
                    {w}
                  </div>
                ))}
              </>
            ) : null}
            {plan.lists.length || !plan.warnings.length ? (
              <>
                <div className="td-import-head">Lists that will be created</div>
                <ul className="td-import-list">
                  {plan.lists.map((l, i) => (
                    <li key={i}>
                      {l.name} · {count(l.items.length, "item")}
                      {l.statusRole ? ` · linked to ${STATUS_NAMES[l.statusRole]}` : ""}
                    </li>
                  ))}
                  {!plan.lists.length ? <li>No lists found</li> : null}
                </ul>
              </>
            ) : null}
            <div className="td-import-head">How {src.label} fields map</div>
            <table className="td-import-table">
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
                    <td className="td-import-strong">{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                hint: "Nothing is saved until you create it",
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
