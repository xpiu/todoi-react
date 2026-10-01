// ProjectDialog — "New project" / "New project group" on the shared Dialog. One screen: the icon /
// colour tile before a 36px name field, Project group, Start from (templates + copy an existing
// project), Visibility. Enter creates, Esc cancels. kind="group": name + Item ID prefix suggested
// from the name. Spec: DESIGN.md › Project lifecycle › Create.
import { useState } from "react";

import type { LabelColor, ProjectVisibility } from "../../../shared/enums";
import { PROJECT_TEMPLATES, suggestKeyPrefix } from "../../../shared/projects";
import { Button } from "../core/Button";
import { Dialog } from "../core/Dialog";
import { Icon, type IconName } from "../core/Icon";
import { Select } from "../core/Select";
import { TextField } from "../core/TextField";
import { ProjectIconPicker } from "./ProjectIconPicker";
import "./ProjectDialog.css";

export const PROJECT_VISIBILITY: ReadonlyArray<{ value: ProjectVisibility; label: string; icon: IconName; hint: string }> = [
  { value: "private", label: "Private", icon: "lock", hint: "Only members" },
  { value: "shared", label: "Shared", icon: "users", hint: "Members and guests" },
  { value: "public", label: "Public", icon: "globe", hint: "Anyone with the link" },
];
const TEMPLATE_ICONS: Record<string, IconName> = { blank: "square", simple: "kanban", intake: "inbox", weekly: "calendar" };

export interface NewProject {
  name: string;
  icon: IconName;
  color: LabelColor;
  groupId: string;
  templateId: string;
  lists: ReadonlyArray<readonly [string, ("NEW" | "BACKLOG" | "TODO" | "DOING" | "DONE")?]> | null;
  copyFrom: string | null;
  visibility: ProjectVisibility;
}
export interface NewGroup {
  name: string;
  keyPrefix: string;
}

export interface ProjectDialogProps {
  open: boolean;
  kind?: "project" | "group";
  groups?: Array<{ id: string; name: string }>;
  defaultGroupId?: string;
  /** Existing projects to copy from */
  projects?: Array<{ id: string; name: string; icon?: IconName | null; color?: LabelColor | null }>;
  onCreateProject?: (p: NewProject) => void;
  onCreateGroup?: (g: NewGroup) => void;
  onClose: () => void;
}

export function ProjectDialog({ open, kind = "project", groups = [], defaultGroupId, projects = [], onCreateProject, onCreateGroup, onClose }: ProjectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={kind === "group" ? "New project group" : "New project"} width={480}>
      {open ? <ProjectForm kind={kind} groups={groups} defaultGroupId={defaultGroupId} projects={projects} onCreateProject={onCreateProject} onCreateGroup={onCreateGroup} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ProjectForm({ kind, groups, defaultGroupId, projects, onCreateProject, onCreateGroup, onClose }: Required<Pick<ProjectDialogProps, "kind" | "groups" | "projects">> & Pick<ProjectDialogProps, "defaultGroupId" | "onCreateProject" | "onCreateGroup" | "onClose">) {
  const isGroup = kind === "group";
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconName>("kanban");
  const [color, setColor] = useState<LabelColor>("blue");
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId ?? groups[0]?.id ?? null);
  const [tpl, setTpl] = useState<string>(PROJECT_TEMPLATES[0].id);
  const [copyFrom, setCopyFrom] = useState<string | null>(projects[0]?.id ?? null);
  const [vis, setVis] = useState<ProjectVisibility>("private");
  const [abbr, setAbbr] = useState("");
  const [abbrTouched, setAbbrTouched] = useState(false);
  const finalAbbr = (abbrTouched ? abbr : suggestKeyPrefix(name)).toUpperCase();
  const valid = name.trim().length > 0 && (isGroup ? /^[A-Z0-9]{2,5}$/.test(finalAbbr) : !!groupId);
  const submit = () => {
    if (!valid) return;
    if (isGroup) {
      onCreateGroup?.({ name: name.trim(), keyPrefix: finalAbbr });
      return;
    }
    const t = PROJECT_TEMPLATES.find((x) => x.id === tpl);
    onCreateProject?.({ name: name.trim(), icon, color, groupId: groupId!, templateId: tpl, lists: tpl === "copy" ? null : (t?.lists ?? []), copyFrom: tpl === "copy" ? copyFrom : null, visibility: vis });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key.length === 1) e.stopPropagation();
  };
  const row = (label: string, hint: string | null, ctl: React.ReactNode) => (
    <div className="td-pd-row">
      <div className="td-pd-rowtext">
        <span className="td-pd-label">{label}</span>
        {hint ? <span className="td-pd-hint">{hint}</span> : null}
      </div>
      {ctl}
    </div>
  );
  const tplRows = [...PROJECT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, hint: t.hint, icon: TEMPLATE_ICONS[t.id] ?? "kanban" })), ...(projects.length ? [{ id: "copy", name: "Copy an existing project", hint: "Lists and settings, not the items", icon: "copy" as IconName }] : [])];
  const visOpt = PROJECT_VISIBILITY.find((v) => v.value === vis);
  return (
    <>
      <div className="td-pd-name">
        {isGroup ? (
          <span className="td-pip-tile td-pd-grouptile" aria-hidden>
            <Icon name="folders" size={18} color="var(--ink-600)" />
          </span>
        ) : (
          <ProjectIconPicker icon={icon} color={color} size={36} iconSize={18} onChange={(v) => {
            setIcon(v.icon);
            setColor(v.color);
          }} />
        )}
        <TextField className="td-pd-namefield" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} placeholder={isGroup ? "Group name" : "Project name"} aria-label={isGroup ? "Group name" : "Project name"} />
      </div>
      {isGroup ? (
        <>
          {row("Item ID prefix", `Items in this group get keys like ${finalAbbr || "ABC"}-1. 2–5 letters or digits.`, <input className="td-field td-pd-mono" value={finalAbbr} maxLength={5} aria-label="Item ID prefix" onChange={(e) => {
            setAbbrTouched(true);
            setAbbr(e.target.value.replace(/[^A-Za-z0-9]/g, ""));
          }} onKeyDown={onKey} />)}
          {row("Projects", "Add projects to the group afterwards from the sidebar or the Projects page.", null)}
        </>
      ) : (
        <>
          {row("Icon and color", "Shown in the sidebar and on the Projects page", <ProjectIconPicker icon={icon} color={color} size={32} iconSize={16} caption="Change" placement="bottom-end" onChange={(v) => {
            setIcon(v.icon);
            setColor(v.color);
          }} />)}
          {groups.length ? row("Project group", null, <Select aria-label="Project group" value={groupId} options={groups.map((g) => ({ value: g.id, label: g.name, icon: "folders" as IconName }))} onChange={(v) => setGroupId(v)} placement="bottom-end" tier="detached" width={220} />) : null}
          <div className="td-pd-tpl">
            <div className="td-pd-tplhead">Start from</div>
            <div className="td-pd-tpllist" role="radiogroup" aria-label="Template">
              {tplRows.map((t) => (
                <div key={t.id}>
                  <button type="button" className="td-pd-tplrow" role="radio" aria-checked={tpl === t.id} onClick={() => setTpl(t.id)} onKeyDown={onKey}>
                    <Icon name={t.icon} size={16} color="var(--ink-600)" />
                    <span className="td-pd-tplname">
                      <b>{t.name}</b>
                      {t.hint ? <span>{t.hint}</span> : null}
                    </span>
                    <span className="td-pd-tplcheck">{tpl === t.id ? <Icon name="check" size={16} /> : null}</span>
                  </button>
                  {t.id === "copy" && tpl === "copy" ? (
                    <div className="td-pd-copyrow">
                      <Select aria-label="Project to copy" value={copyFrom} options={projects.map((p) => ({ value: p.id, label: p.name, icon: p.icon ?? "kanban", iconColor: p.color ? `var(--label-${p.color})` : undefined }))} onChange={(v) => setCopyFrom(v)} tier="detached" width={260} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {row("Visibility", visOpt?.hint ?? null, <Select aria-label="Visibility" value={vis} options={PROJECT_VISIBILITY.map((v) => ({ value: v.value, label: v.label, icon: v.icon }))} onChange={(v) => setVis(v)} placement="bottom-end" tier="detached" width={200} />)}
        </>
      )}
      <div className="td-pd-foot">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!valid} onClick={submit}>
          {isGroup ? "Create group" : "Create project"}
        </Button>
      </div>
    </>
  );
}
