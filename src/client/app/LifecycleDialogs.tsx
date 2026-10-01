// The project lifecycle dialogs on real data: ProjectDialog (new project / group) and ProjectPanel
// (settings, members, activity). One instance in the shell; opened through useLifecycle.
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { projectUrl } from "./links";

import type { LabelColor, MemberRole } from "../../shared/enums";
import { newId } from "../data/mutations";
import { useProjectMutations } from "../data/projects";
import { useActivity, useGroups, useProject } from "../data/queries";
import type { IconName } from "../design/core/Icon";
import { ProjectDialog, type NewGroup, type NewProject } from "../design/project/ProjectDialog";
import { ProjectPanel, type PanelAction, type ProjectPatch } from "../design/project/ProjectPanel";
import { quote, useFeedback } from "./feedback";
import { useLifecycle } from "./lifecycle";
import { useCurrentUser } from "./session";

export function LifecycleDialogs() {
  const dialog = useLifecycle((s) => s.dialog);
  const close = useLifecycle((s) => s.close);
  const groups = useGroups();
  const m = useProjectMutations();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const projects = (groups.data ?? []).flatMap((g) => g.projects);
  const createProject = (p: NewProject) => {
    const id = newId();
    m.createProject.mutate(
      { id, groupId: p.groupId, name: p.name, icon: p.icon, color: p.color, visibility: p.visibility, lists: p.lists ? p.lists.map(([n, r]) => [n, r ?? null] as [string, typeof r | null]) : undefined, copyFrom: p.copyFrom ?? undefined },
      {
        onSuccess: (made) => {
          const g = groups.data?.find((x) => x.id === p.groupId);
          const lists = made.lists.map((l) => l.name);
          notify({ message: `Created ${quote(p.name)} in ${g?.name ?? "the group"}${lists.length ? ` with ${lists.join(" · ")}` : ""}`, icon: "folder-plus" });
          void navigate({ to: "/p/$projectId", params: { projectId: id }, search: {} });
        },
      },
    );
    close();
  };
  const createGroup = (g: NewGroup) => {
    m.createGroup.mutate({ id: newId(), name: g.name, keyPrefix: g.keyPrefix }, { onSuccess: () => notify({ message: `Created the group ${quote(g.name)} — keys start at ${g.keyPrefix}-1`, icon: "folders" }) });
    close();
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
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const { user } = useCurrentUser();
  const p = project.data;
  if (!p || !user) return null;
  const me = p.members.find((x) => x.userId === user.id);
  const role: MemberRole = me?.role ?? "viewer";
  const patch = (c: ProjectPatch) => m.updateProject.mutate({ id: p.id, ...c });
  const finish = () => {
    setOpen(false);
    onClose();
  };
  const act = (a: PanelAction) => {
    if (a === "archive") {
      m.archiveProject.mutate({ id: p.id });
      notify({ message: `Archived ${quote(p.name)}`, icon: "archive", restore: () => m.restoreProject.mutate({ id: p.id }) });
      finish();
      void navigate({ to: "/projects" });
    } else if (a === "delete") {
      m.deleteProject.mutate({ id: p.id });
      notify({ message: `Deleted ${quote(p.name)}`, icon: "trash-2", restore: () => m.restoreProject.mutate({ id: p.id }) });
      finish();
      void navigate({ to: "/projects" });
    } else if (a === "leave") {
      m.removeMember.mutate({ projectId: p.id, userId: user.id });
      notify({ message: `Left ${quote(p.name)}`, icon: "log-out", restore: () => m.setMember.mutate({ projectId: p.id, userId: user.id, role }) });
      finish();
      void navigate({ to: "/projects" });
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
      onRemoveMember={(mem) => {
        m.removeMember.mutate({ projectId: p.id, userId: mem.id });
        notify({ message: `Removed ${mem.name} from ${quote(p.name)}`, icon: "user-x", restore: () => m.setMember.mutate({ projectId: p.id, userId: mem.id, role: mem.role }) });
      }}
      onInvite={(email, r) => notify({ message: `Invited ${email} as ${r} — invites send once sign-in exists`, icon: "mail" })}
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
