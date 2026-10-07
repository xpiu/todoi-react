// ProjectPanel — the project's own settings, from the project itself. One scrolling 640px Dialog,
// no tabs: Name; Access; Members (roster + invite); Defaults; Appearance; Leave and archive;
// Activity. Rows use the Account idiom (label + hint left, one control right); destructive rows
// confirm inline. `section` scrolls to Members or Activity on open. Spec: DESIGN.md › Project lifecycle › Settle.
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { LabelColor, MemberRole, ProjectView, ProjectVisibility } from "../../../shared/enums";
import { Avatar } from "../core/Avatar";
import { Button } from "../core/Button";
import { Dialog } from "../core/Dialog";
import { COPY_FAILED, copyIcon, useCopy } from "../core/clipboard";
import { Icon, type IconName } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import { IconButton } from "../core/IconButton";
import { Select } from "../core/Select";
import { Switch } from "../core/Switch";
import { TextField } from "../core/TextField";
import { ActivityLog, type ActivityEntryView } from "./ActivityLog";
import { PROJECT_VISIBILITY } from "./ProjectDialog";
import { ProjectIconPicker } from "./ProjectIconPicker";
import "./ProjectPanel.css";

export const PROJECT_ROLES: ReadonlyArray<{ value: Exclude<MemberRole, "owner">; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];
export const roleName = (r: MemberRole) => (r === "owner" ? "Owner" : (PROJECT_ROLES.find((x) => x.value === r)?.label ?? r));
const VIEW_OPTS: ReadonlyArray<{ value: ProjectView; label: string; icon: IconName }> = [
  { value: "list", label: "List", icon: "list" },
  { value: "board", label: "Board", icon: "kanban" },
  { value: "calendar", label: "Calendar", icon: "calendar" },
];

export interface PanelProject {
  id: string;
  name: string;
  icon?: IconName | null;
  color?: LabelColor | null;
  description?: string | null;
  visibility: ProjectVisibility;
  defaultView: ProjectView;
  linkStatuses: boolean;
  groupId: string;
  groupName?: string;
  keyPrefix?: string;
  url?: string;
  /** The viewer's role */
  role: MemberRole;
}
export interface PanelMember {
  id: string;
  name: string;
  email?: string | null;
  color?: string;
  role: MemberRole;
}
export type PanelAction = "leave" | "archive" | "delete" | "open-archive" | "open-group-settings";
export interface ProjectPatch {
  name?: string;
  icon?: IconName;
  color?: LabelColor;
  description?: string;
  visibility?: ProjectVisibility;
  defaultView?: ProjectView;
  linkStatuses?: boolean;
}

export interface ProjectPanelProps {
  open: boolean;
  project: PanelProject;
  members: PanelMember[];
  activity: ActivityEntryView[];
  archivedCount?: number;
  currentUserId: string;
  section?: "members" | "activity";
  /** A returned promise that rejects means the change did not land (the parent explains why); the field goes back */
  onChange: (patch: ProjectPatch) => void | Promise<unknown>;
  onAction: (action: PanelAction) => void;
  onChangeRole?: (member: PanelMember, role: MemberRole) => void;
  onRemoveMember?: (member: PanelMember) => void;
  /** The form keeps the address and shows the reason when a returned promise rejects */
  onInvite?: (email: string, role: MemberRole) => void | Promise<unknown>;
  onOpenKey?: (key: string) => void;
  onClose: () => void;
}

/** Inside the panel a change resolves to whether it landed. */
type InnerProps = Omit<ProjectPanelProps, "onChange"> & { onChange: (patch: ProjectPatch) => Promise<boolean> };

export function ProjectPanel(props: ProjectPanelProps) {
  const p: InnerProps = { ...props, onChange: (patch) => Promise.resolve(props.onChange(patch)).then(() => true, () => false) };
  return (
    <Dialog open={p.open} onClose={p.onClose} width={640} closeLabel="Close project settings" title={<PanelTitle {...p} />} titleExtra={p.project.url ? <CopyLink url={p.project.url} /> : null}>
      {p.open ? <PanelBody {...p} /> : null}
    </Dialog>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, copy] = useCopy(900);
  return (
    <IconButton
      name={copyIcon(copied, "link")}
      label="Copy project link"
      tooltip={copied === "failed" ? COPY_FAILED : "Copy project link"}
      size={28}
      iconSize={16}
      onClick={() => void copy(url)}
    />
  );
}

function PanelTitle({ project, onChange }: InnerProps) {
  const isAdmin = project.role === "owner" || project.role === "admin";
  return (
    <span className="td-pp-head">
      <ProjectIconPicker icon={project.icon} color={project.color} size={32} onChange={(v) => onChange({ icon: v.icon, color: v.color })} disabled={!isAdmin} />
      <span className="td-pp-title">
        <span className="td-pp-name">{project.name}</span>
        {project.groupName ? (
          <span className="td-pp-crumb">
            <Icon name="folders" size={12} />
            {project.groupName}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function PanelBody({ project, members, activity, archivedCount, currentUserId, section, onChange, onAction, onChangeRole, onRemoveMember, onInvite, onOpenKey }: InnerProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<PanelAction | null>(null);
  const [desc, setDesc] = useState(project.description ?? "");
  const [nameDraft, setNameDraft] = useState(project.name);
  const [inviteMail, setInviteMail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("editor");
  const isOwner = project.role === "owner", isAdmin = isOwner || project.role === "admin";
  const vis = PROJECT_VISIBILITY.find((v) => v.value === project.visibility) ?? PROJECT_VISIBILITY[0]!;
  useEffect(() => {
    if (section !== "members" && section !== "activity") return;
    const sec = bodyRef.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    const body = sec?.closest<HTMLElement>(".td-dialog-body");
    if (sec && body) body.scrollTop = sec.offsetTop - body.offsetTop - 8;
  }, [section]);
  const commitName = () => {
    const v = nameDraft.trim();
    if (v && v !== project.name) void onChange({ name: v }).then((landed) => landed || setNameDraft(project.name));
    else setNameDraft(project.name);
  };
  const row = (id: string, label: ReactNode, hint: ReactNode, ctl: ReactNode) => (
    <div className="td-pp-row" key={id} data-setting={id}>
      <div className="td-pp-rowtext">
        <span className="td-pp-label">{label}</span>
        {hint ? <span className="td-pp-hint">{hint}</span> : null}
      </div>
      <div className="td-pp-ctl">{ctl}</div>
    </div>
  );
  // Destructive rows: the control swaps to "Do it · Cancel" and the hint asks the question.
  const dangerRow = (id: PanelAction, label: string, hint: string, verb: string, danger: boolean, disabled?: boolean, disabledHint?: string) => {
    const on = confirm === id;
    return row(
      id,
      label,
      on ? `${verb} “${project.name}”?` : disabled ? disabledHint : hint,
      on ? (
        <>
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "subtle"}
            onClick={() => {
              setConfirm(null);
              onAction(id);
            }}
          >
            {verb}
          </Button>
        </>
      ) : (
        <Button icon={id === "leave" ? "log-out" : id === "archive" ? "archive" : "trash-2"} disabled={disabled} className={danger && !disabled ? "td-pp-danger" : undefined} onClick={() => setConfirm(id)}>
          {verb}
        </Button>
      ),
    );
  };
  const sec = (id: string, title: string | null, children: ReactNode) => (
    <section className="td-pp-sec" aria-label={title?.replace(/ · .*$/, "") ?? "About"} data-section={id}>
      {title ? <h3 className="td-pp-sectitle">{title}</h3> : null}
      {children}
    </section>
  );
  const validMail = /^\S+@\S+\.\S+$/.test(inviteMail.trim());
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  /** The address clears only once the invite exists; a failure keeps it and says why. */
  const invite = async () => {
    if (!validMail || inviting) return;
    setInviting(true);
    setInviteError(null);
    try {
      await onInvite?.(inviteMail.trim(), inviteRole);
      setInviteMail("");
    } catch (err) {
      setInviteError(`Couldn't invite: ${err instanceof Error && err.message ? err.message : "something went wrong"}`);
    } finally {
      setInviting(false);
    }
  };
  return (
    <div ref={bodyRef}>
      {sec("about", null, row("name", "Name", null, <input className="td-field td-pp-namefield" value={nameDraft} aria-label="Project name" disabled={!isAdmin} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitName();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          setNameDraft(project.name);
        } else if (e.key.length === 1) e.stopPropagation();
      }} onBlur={commitName} />))}
      {sec("access", "Access", row("visibility", "Visibility", vis.hint, <Select aria-label="Visibility" value={project.visibility} options={PROJECT_VISIBILITY.map((v) => ({ value: v.value, label: v.label, icon: v.icon }))} onChange={(v) => onChange({ visibility: v })} placement="bottom-end" tier="detached" width={200} disabled={!isAdmin} />))}
      {sec("members", `Members${members.length ? ` · ${members.length}` : ""}`, (
        <>
          <div role="list" aria-label="Members">
            {members.map((m) => (
              <div className="td-pp-member" role="listitem" key={m.id}>
                <Avatar name={m.name} color={m.color} size={28} decorative />
                <span className="td-pp-mname">
                  <b>
                    {m.name}
                    {m.id === currentUserId ? " (you)" : ""}
                  </b>
                  {m.email ? <span>{m.email}</span> : null}
                </span>
                {m.role === "owner" || !isAdmin || !onChangeRole ? <span className="td-pp-mrole">{roleName(m.role)}</span> : <Select aria-label={`Role for ${m.name}`} value={m.role} options={PROJECT_ROLES} onChange={(v) => onChangeRole(m, v)} placement="bottom-end" tier="detached" width={160} />}
                {isAdmin && onRemoveMember && m.role !== "owner" ? <IconButton name="x" label={`Remove ${m.name}`} tooltip="Remove" size={28} iconSize={15} onClick={() => onRemoveMember(m)} /> : null}
              </div>
            ))}
          </div>
          {isAdmin && onInvite ? (
            <div className="td-pp-invite">
              <TextField type="email" icon="user-plus" value={inviteMail} aria-label="Invite by email" placeholder="name@company.com" className="td-pp-invitefield" onChange={(e) => setInviteMail(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void invite();
                } else if (e.key.length === 1) e.stopPropagation();
              }} />
              <Select aria-label="Invite role" value={inviteRole} options={PROJECT_ROLES} onChange={(v) => setInviteRole(v)} placement="bottom-end" tier="detached" width={160} />
              <Button variant="primary" disabled={!validMail || inviting} onClick={() => void invite()}>
                {inviting ? "Inviting…" : "Invite"}
              </Button>
            </div>
          ) : null}
          <InlineError message={inviteError} className="td-pp-inviteerror" />
          {!isAdmin ? <div className="td-pp-cap">Only admins can invite people or change roles.</div> : null}
        </>
      ))}
      {sec("defaults", "Defaults", (
        <>
          {row("view", "Default view", "What the project opens in for people who haven't picked a view", <Select aria-label="Default view" value={project.defaultView} options={VIEW_OPTS} onChange={(v) => onChange({ defaultView: v })} placement="bottom-end" tier="detached" width={180} disabled={!isAdmin} />)}
          {row("linkStatuses", "Link lists with statuses", "An item created in or moved to a list with a Status role takes that Status", <Switch aria-label="Link lists with statuses" checked={project.linkStatuses} disabled={!isAdmin} onChange={(v) => onChange({ linkStatuses: v })} />)}
          {project.keyPrefix ? row("abbr", <button type="button" className="td-pp-linkbtn" onClick={() => onAction("open-group-settings")}>Change the Item ID prefix set at Group level</button>, null, <span className="td-pp-mono">{project.keyPrefix}-</span>) : null}
        </>
      ))}
      {sec("appearance", "Appearance", (
        <>
          {row("icon", "Icon and color", null, <ProjectIconPicker icon={project.icon} color={project.color} placement="bottom-end" onChange={(v) => onChange({ icon: v.icon, color: v.color })} disabled={!isAdmin} />)}
          <div className="td-pp-field" data-setting="description">
            <div className="td-pp-rowtext td-pp-fieldlabel">
              <span className="td-pp-label">Description</span>
            </div>
            <TextField multiline rows={2} value={desc} aria-label="Description" placeholder="Add a short description…" onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => {
              if (e.key === "Escape") e.stopPropagation();
              else if (e.key.length === 1) e.stopPropagation();
            }} />
            {desc !== (project.description ?? "") ? (
              <div className="td-pp-fieldfoot">
                <Button variant="ghost" onClick={() => setDesc(project.description ?? "")}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => onChange({ description: desc })}>
                  Save
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ))}
      {sec("danger", "Leave and archive", (
        <>
          {archivedCount != null ? row("archived", "Archived items", archivedCount ? `${archivedCount} archived item${archivedCount === 1 ? "" : "s"} from this project, ready to restore.` : "Nothing archived from this project yet.", <Button icon="archive-restore" disabled={!archivedCount} onClick={() => onAction("open-archive")}>View</Button>) : null}
          {dangerRow("leave", "Leave project", "You lose access. An admin can invite you back.", "Leave", false, isOwner, "Transfer ownership to another member before leaving.")}
          {isAdmin ? dangerRow("archive", "Archive project", "Hidden from the sidebar and search. Items stay; an admin can restore it.", "Archive", false) : null}
          {isOwner ? dangerRow("delete", "Delete project", "Removes every item and every member's access. Undo from the toast right after.", "Delete", true) : null}
        </>
      ))}
      {sec("activity", "Activity", <ActivityLog entries={activity} onOpenKey={onOpenKey} />)}
    </div>
  );
}
