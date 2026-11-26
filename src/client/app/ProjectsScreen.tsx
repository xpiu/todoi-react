// Projects — every project across groups in one table: icon, name (rename inline), lead, items,
// completed %, the per-project "Status follows List" switch, and a ⋯ with the lifecycle rows.
import { useState } from "react";

import { movesOnCheck } from "../../shared/completion";
import type { LabelColor } from "../../shared/enums";
import { newId } from "../data/mutations";
import { useProjectMutations } from "../data/projects";
import { projectsOf, useGroups } from "../data/queries";
import { Avatar } from "../design/core/Avatar";
import type { IconName } from "../design/core/Icon";
import { MenuButton, MenuDivider, MenuItem } from "../design/core/Menu";
import { ViewSkeleton } from "../design/core/Skeleton";
import { Switch } from "../design/core/Switch";
import { ProjectIconPicker } from "../design/project/ProjectIconPicker";
import { quote, useFeedback } from "./feedback";
import { useLifecycle, useRemoveProject } from "./lifecycle";
import { LoadFailed } from "./LoadFailed";
import "../design/core/text.css";
import { TableAddRow } from "./TableAddRow";
import "./tables.css";
import { useOpenProject } from "./useOpenProject";

export function ProjectsScreen() {
  const groups = useGroups();
  const m = useProjectMutations();
  const removeProject = useRemoveProject();
  const notify = useFeedback((s) => s.notify);
  const go = useOpenProject();
  const openNewProject = useLifecycle((s) => s.openNewProject);
  const openSettings = useLifecycle((s) => s.openSettings);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // The icon column is the icon picker's trigger; the row menu's "Change icon" opens it too (Design: ProjectsScreen)
  const [iconOpenId, setIconOpenId] = useState<string | null>(null);
  if (groups.isError) return <LoadFailed what="the projects" error={groups.error} onRetry={() => void groups.refetch()} />;
  if (!groups.data) return <ViewSkeleton view="list" lists={1} />;
  const projects = projectsOf(groups.data);
  const commitRename = (p: { id: string; name: string }) => {
    const v = draft.trim();
    setRenamingId(null);
    if (v && v !== p.name) m.updateProject.mutate({ id: p.id, name: v });
  };
  return (
    <div className="td-table-page">
      <div className="td-table-inner">
        <h1 className="td-table-title">Projects</h1>
        <div className="td-table-card">
          <table className="td-table">
            <thead>
              <tr>
                {/* The name header spans the icon column, so its label starts at the table's edge above the row icons */}
                <th colSpan={2}>Project</th>
                <th>Lead</th>
                <th className="td-table-number">Items</th>
                <th className="td-table-number">Completed</th>
                <th className="td-table-link" title="Status follows List: when on, an item created in or moved to a list with a Status role takes that Status. The item window shows that Status as set by the list; move the item to change it.">
                  Status follows List
                </th>
                <th className="td-table-link" title="When on, checking an item also moves it to the list with the Done role, and unchecking sends it back. Follows the Status follows List setting until it is set. Subitems stay with their item.">
                  Checked items move to Done
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
                    className="td-table-row"
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
                    <td className="td-table-icon" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <ProjectIconPicker bare icon={p.icon as IconName | null} color={p.color as LabelColor | null} size={16} iconSize={16} label={`Change icon for ${p.name}`} open={iconOpenId === p.id} onOpenChange={(o) => setIconOpenId(o ? p.id : null)} onChange={(v) => m.updateProject.mutate({ id: p.id, icon: v.icon, color: v.color })} />
                    </td>
                    <td className="td-table-name" onClick={renaming ? (e) => e.stopPropagation() : undefined} onKeyDown={renaming ? (e) => e.stopPropagation() : undefined}>
                      {renaming ? (
                        <input className="td-table-rename" autoFocus value={draft} aria-label={`Rename ${p.name}`} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} onBlur={() => commitRename(p)} onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(p);
                          else if (e.key === "Escape") setRenamingId(null);
                        }} />
                      ) : (
                        <>
                          {p.name}
                          <span className="td-table-sub">{p.groupName}</span>
                        </>
                      )}
                    </td>
                    <td>
                      {p.lead ? (
                        <span className="td-table-lead" title={p.lead}>
                          <Avatar name={p.lead} size={22} decorative />
                          <span className="td-table-leadname">{p.lead}</span>
                        </span>
                      ) : (
                        <span className="td-table-dim">—</span>
                      )}
                    </td>
                    <td className="td-table-number">{p.itemCount}</td>
                    <td className="td-table-number">{pct != null ? `${pct}%` : <span className="td-table-dim">—</span>}</td>
                    <td className="td-table-link" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Switch glyph="link" checked={p.linkStatuses} aria-label={`Status follows List for ${p.name}`} onChange={(v) => m.updateProject.mutate({ id: p.id, linkStatuses: v })} />
                    </td>
                    <td className="td-table-link" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Switch checked={movesOnCheck(p)} aria-label={`Checked items move to Done for ${p.name}`} onChange={(v) => m.updateProject.mutate({ id: p.id, checkedMove: v })} />
                    </td>
                    <td className="td-table-set" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <span className="td-table-tools">
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
                          <MenuItem icon="shapes" onSelect={() => setTimeout(() => setIconOpenId(p.id))}>
                            Change icon
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
          <TableAddRow label="New project" onClick={() => openNewProject()} />
        </div>
      </div>
    </div>
  );
}
