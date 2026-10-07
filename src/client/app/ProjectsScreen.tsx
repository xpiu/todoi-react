// Projects — every project across groups in one table: icon, name (rename inline), lead, items,
// completed %, the per-project "Link lists with statuses" switch, and a ⋯ with the lifecycle rows.
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { LabelColor } from "../../shared/enums";
import { newId } from "../data/mutations";
import { useProjectMutations } from "../data/projects";
import { projectsOf, useGroups } from "../data/queries";
import { Avatar } from "../design/core/Avatar";
import { Button } from "../design/core/Button";
import { Icon, type IconName } from "../design/core/Icon";
import { MenuButton, MenuDivider, MenuItem } from "../design/core/Menu";
import { ViewSkeleton } from "../design/core/Skeleton";
import { Switch } from "../design/core/Switch";
import { ProjectIconPicker, projectColorVar } from "../design/project/ProjectIconPicker";
import { quote, useFeedback } from "./feedback";
import { useLifecycle, useRemoveProject } from "./lifecycle";
import { LoadFailed } from "./LoadFailed";
import "../design/core/text.css";
import "./tables.css";

export function ProjectsScreen() {
  const groups = useGroups();
  const m = useProjectMutations();
  const removeProject = useRemoveProject();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const openNewProject = useLifecycle((s) => s.openNewProject);
  const openSettings = useLifecycle((s) => s.openSettings);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (groups.isError) return <LoadFailed what="the projects" error={groups.error} onRetry={() => void groups.refetch()} />;
  if (!groups.data) return <ViewSkeleton view="list" lists={1} />;
  const projects = projectsOf(groups.data);
  const go = (id: string) => void navigate({ to: "/p/$projectId", params: { projectId: id }, search: {} });
  const commitRename = (p: { id: string; name: string }) => {
    const v = draft.trim();
    setRenamingId(null);
    if (v && v !== p.name) m.updateProject.mutate({ id: p.id, name: v });
  };
  return (
    <div className="td-tbl-page">
      <div className="td-tbl-inner">
        <div className="td-tbl-head">
          <h1 className="td-tbl-title">Projects</h1>
          <Button variant="inverse" icon="plus" onClick={() => openNewProject()}>
            New project
          </Button>
        </div>
        <div className="td-tbl-card">
          <table className="td-tbl">
            <thead>
              <tr>
                <th>
                  <span className="td-sr-only">Icon</span>
                </th>
                <th>Project</th>
                <th>Lead</th>
                <th className="td-tbl-num">Items</th>
                <th className="td-tbl-num">Completed</th>
                <th className="td-tbl-link" title="Link lists with statuses: when on, an item created in or moved to a list with a Status role takes that Status.">
                  Auto-assign statuses to lists
                </th>
                <th>
                  <span className="td-sr-only">Settings</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const renaming = renamingId === p.id;
                const pct = p.itemCount ? Math.round((p.doneCount / p.itemCount) * 100) : null;
                return (
                  <tr
                    key={p.id}
                    className="td-tbl-row"
                    tabIndex={0}
                    aria-label={`Open ${p.name}`}
                    onClick={() => !renaming && go(p.id)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                        e.preventDefault();
                        go(p.id);
                      }
                    }}
                  >
                    <td className="td-tbl-ic">
                      <Icon name={(p.icon as IconName | null) ?? "kanban"} size={16} color={projectColorVar(p.color)} />
                    </td>
                    <td className="td-tbl-name" onClick={renaming ? (e) => e.stopPropagation() : undefined} onKeyDown={renaming ? (e) => e.stopPropagation() : undefined}>
                      {renaming ? (
                        <input className="td-tbl-rename" autoFocus value={draft} aria-label={`Rename ${p.name}`} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} onBlur={() => commitRename(p)} onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(p);
                          else if (e.key === "Escape") setRenamingId(null);
                        }} />
                      ) : (
                        <>
                          {p.name}
                          <span className="td-tbl-sub">{p.groupName}</span>
                        </>
                      )}
                    </td>
                    <td>
                      {p.lead ? (
                        <span className="td-tbl-lead" title={p.lead}>
                          <Avatar name={p.lead} size={22} decorative />
                          <span className="td-tbl-leadname">{p.lead}</span>
                        </span>
                      ) : (
                        <span className="td-tbl-dim">—</span>
                      )}
                    </td>
                    <td className="td-tbl-num">{p.itemCount}</td>
                    <td className="td-tbl-num">{pct != null ? `${pct}%` : <span className="td-tbl-dim">—</span>}</td>
                    <td className="td-tbl-link" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Switch checked={p.linkStatuses} aria-label={`Linked statuses for ${p.name}`} onChange={(v) => m.updateProject.mutate({ id: p.id, linkStatuses: v })} />
                    </td>
                    <td className="td-tbl-set" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <span className="td-tbl-tools">
                        <ProjectIconPicker icon={p.icon as IconName | null} color={p.color as LabelColor | null} size={28} iconSize={15} placement="bottom-end" onChange={(v) => m.updateProject.mutate({ id: p.id, icon: v.icon, color: v.color })} />
                        <MenuButton label={`Settings for ${p.name}`} tooltip="Project settings" placement="bottom-end" tier="detached" size={28} iconSize={16}>
                          <MenuItem icon="settings" onSelect={() => openSettings(p.id)}>
                            Project settings
                          </MenuItem>
                          <MenuItem
                            icon="pencil"
                            onSelect={() => {
                              setDraft(p.name);
                              setRenamingId(p.id);
                            }}
                          >
                            Rename
                          </MenuItem>
                          <MenuItem icon="copy" onSelect={() => m.createProject.mutate({ id: newId(), groupId: p.groupId, name: `${p.name} (copy)`, copyFrom: p.id }, { onSuccess: () => notify({ message: `Duplicated ${quote(p.name)} — lists and settings, not the items`, icon: "copy" }) })}>
                            Duplicate
                          </MenuItem>
                          <MenuDivider />
                          <MenuItem
                            icon="archive"
                            onSelect={() => removeProject(p, "archive")}
                          >
                            Archive
                          </MenuItem>
                          <MenuItem
                            icon="trash-2"
                            danger
                            onSelect={() => removeProject(p, "delete")}
                          >
                            Delete
                          </MenuItem>
                        </MenuButton>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
