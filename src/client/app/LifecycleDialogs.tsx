// The project lifecycle dialogs on real data: ProjectDialog (new project / group) and ProjectPanel
// (settings, members, activity). One instance in the shell; opened through useLifecycle.
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { projectUrl } from "./links";

import type { LabelColor, MemberRole } from "../../shared/enums";
import { errorMessage, explain } from "../data/api";
import { newId } from "../data/mutations";
import { useProjectMutations } from "../data/projects";
import { useActivity, useGroups, useProject } from "../data/queries";
import type { IconName } from "../design/core/Icon";
import { ProjectDialog, type NewGroup, type NewProject } from "../design/project/ProjectDialog";
import { ProjectPanel, type PanelAction, type ProjectPatch } from "../design/project/ProjectPanel";
import { copyText } from "../design/core/clipboard";
import { copyAndNotify, quote, useFeedback } from "./feedback";
import { useLifecycle, useRemoveProject } from "./lifecycle";
import { useCurrentUser } from "./session";
import { StateDialog } from "./StateDialog";

export function LifecycleDialogs() {
  const dialog = useLifecycle((s) => s.dialog);
  const close = useLifecycle((s) => s.close);
  const groups = useGroups();
  const m = useProjectMutations();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const projects = (groups.data ?? []).flatMap((g) => g.projects);
  // The dialog stays open with the values until the server has the project; a failure shows in the dialog.
  const createProject = async (p: NewProject) => {
    const id = newId();
    const made = await m.createProject.mutateAsync({ id, groupId: p.groupId, name: p.name, icon: p.icon, color: p.color, visibility: p.visibility, lists: p.lists ? p.lists.map(([n, r]) => [n, r ?? null] as [string, typeof r | null]) : undefined, copyFrom: p.copyFrom ?? undefined, quiet: true }).catch(explain);
    const g = groups.data?.find((x) => x.id === p.groupId);
    const lists = made.lists.map((l) => l.name);
    close();
    notify({ message: `Created ${quote(p.name)} in ${g?.name ?? "the group"}${lists.length ? ` with ${lists.join(" · ")}` : ""}`, icon: "folder-plus" });
    void navigate({ to: "/p/$projectId", params: { projectId: id }, search: {} });
  };
  const createGroup = async (g: NewGroup) => {
    await m.createGroup.mutateAsync({ id: newId(), name: g.name, keyPrefix: g.keyPrefix, quiet: true }).catch(explain);
    close();
    notify({ message: `Created the group ${quote(g.name)} — keys start at ${g.keyPrefix}-1`, icon: "folders" });
  };
  return (
    <>
      <ProjectDialog
        open={dialog?.kind === "project" || dialog?.kind === "group"}
        kind={dialog?.kind === "group" ? "group" : "project"}
        groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
        defaultGroupId={dialog?.kind === "project" ? dialog.groupId : undefined}
        projects={projects.map((p) => ({ id: p.id, name: p.name, icon: p.icon as IconName | null, color: p.color as LabelColor | null }))}
        onCreateProject={createProject}
        onCreateGroup={createGroup}
        onClose={close}
      />
      {dialog?.kind === "settings" ? <SettingsPanel projectId={dialog.projectId} section={dialog.section} onClose={close} /> : null}
    </>
  );
}

function SettingsPanel({ projectId, section, onClose }: { projectId: string; section?: "members" | "activity"; onClose: () => void }) {
  const project = useProject(projectId);
  const activity = useActivity(projectId);
  const m = useProjectMutations();
  const removeProject = useRemoveProject();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const { user } = useCurrentUser();
  const p = project.data;
  if (project.isError) return <StateDialog title="Couldn't load the project settings" body={`${errorMessage(project.error)} Check the connection and try again.`} action={{ label: "Retry", onClick: () => void project.refetch() }} onClose={onClose} />;
  if (!p || !user) return <StateDialog title="Opening the project settings…" body="pending" onClose={onClose} />;
  const me = p.members.find((x) => x.userId === user.id);
  const role: MemberRole = me?.role ?? "viewer";
  // A refused change is explained by the query client; the panel puts the field back (ProjectPanel).
  const patch = (c: ProjectPatch) => m.updateProject.mutateAsync({ id: p.id, ...c });
  const finish = () => {
    setOpen(false);
    onClose();
  };
  const leaveTo = () => {
    finish();
    void navigate({ to: "/projects" });
  };
  const act = (a: PanelAction) => {
    if (a === "archive" || a === "delete") removeProject(p, a, leaveTo);
    else if (a === "leave") {
      m.removeMember.mutate({ projectId: p.id, userId: user.id }, { onSuccess: () => {
        notify({ message: `Left ${quote(p.name)}`, icon: "log-out", restore: () => m.setMember.mutateAsync({ projectId: p.id, userId: user.id, role, quiet: true }) });
        leaveTo();
      } });
    } else if (a === "open-archive") {
      finish();
      void navigate({ to: "/archive", search: { project: p.id } });
    } else if (a === "open-group-settings") {
      finish();
      void navigate({ to: "/groups" });
    }
  };
  return (
    <ProjectPanel
      open={open}
      project={{ id: p.id, name: p.name, icon: p.icon as IconName | null, color: p.color as LabelColor | null, description: p.description, visibility: p.visibility, defaultView: p.defaultView, linkStatuses: p.linkStatuses, groupId: p.groupId, groupName: p.groupName, keyPrefix: p.keyPrefix, url: projectUrl(p.id), role }}
      members={p.members.map((x) => ({ id: x.userId, name: x.name, email: x.email, role: x.role, color: x.avatarColor ? `var(--label-${x.avatarColor})` : undefined }))}
      activity={(activity.data ?? []).map((a) => ({ id: a.id, type: a.type, actor: a.actor?.name ?? "Todoi", actorColor: a.actor?.avatarColor ? `var(--label-${a.actor.avatarColor})` : undefined, text: a.text, key: a.itemKey ? `${p.keyPrefix}-${a.itemKey}` : null, time: a.createdAt }))}
      archivedCount={p.archivedCount}
      currentUserId={user.id}
      section={section}
      onChange={patch}
      onAction={act}
      onChangeRole={(mem, r) => m.setMember.mutate({ projectId: p.id, userId: mem.id, role: r })}
      onRemoveMember={(mem) => m.removeMember.mutate({ projectId: p.id, userId: mem.id }, { onSuccess: () => notify({ message: `Removed ${mem.name} from ${quote(p.name)}`, icon: "user-x", restore: () => m.setMember.mutateAsync({ projectId: p.id, userId: mem.id, role: mem.role, quiet: true }) }) })}
      // Todoi does not send email: the invite is a link, copied for the admin to send themselves.
      onInvite={async (email, r) => {
        const invite = await m.createInvite.mutateAsync({ projectId: p.id, email, role: r, quiet: true }).catch(explain);
        const copied = await copyText(invite.url);
        notify({ message: copied ? `Copied an invite link for ${email}. Send it to them; Todoi doesn't email invites.` : `Created an invite for ${email}. Copy the link to send it; Todoi doesn't email invites.`, icon: "mail", ...(copied ? {} : { undo: () => void copyAndNotify(invite.url, "Copied the invite link"), actionLabel: "Copy link", standalone: true }) });
      }}
      onOpenKey={(key) => {
        const n = Number(key.split("-")[1]);
        finish();
        void navigate({ to: "/p/$projectId", params: { projectId: p.id }, search: { item: undefined } });
        void n;
      }}
      onClose={finish}
    />
  );
}
