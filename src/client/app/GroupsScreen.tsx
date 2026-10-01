// Project groups — groups with their Item ID prefix (edit inline), item totals and completion, a ⋯ with Rename / Delete.
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useProjectMutations } from "../data/projects";
import { useGroups } from "../data/queries";
import { Button } from "../design/core/Button";
import { Icon } from "../design/core/Icon";
import { IconButton } from "../design/core/IconButton";
import { MenuButton, MenuDivider, MenuItem } from "../design/core/Menu";
import { ViewSkeleton } from "../design/core/Skeleton";
import { quote, useFeedback } from "./feedback";
import { useLifecycle } from "./lifecycle";
import { LoadFailed } from "./LoadFailed";
import "./tables.css";

export function GroupsScreen() {
  const groups = useGroups();
  const m = useProjectMutations();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const openNewGroup = useLifecycle((s) => s.openNewGroup);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  if (groups.isError) return <LoadFailed what="the project groups" error={groups.error} onRetry={() => void groups.refetch()} />;
  if (!groups.data) return <ViewSkeleton view="list" lists={1} />;
  const commitAbbr = (id: string) => {
    const v = draft.trim().toUpperCase();
    setEditing(null);
    if (/^[A-Z0-9]{2,5}$/.test(v)) m.updateGroup.mutate({ id, keyPrefix: v });
  };
  const commitRename = (g: { id: string; name: string }) => {
    const v = nameDraft.trim();
    setRenamingId(null);
    if (v && v !== g.name) m.updateGroup.mutate({ id: g.id, name: v });
  };
  return (
    <div className="td-tbl-page">
      <div className="td-tbl-inner">
        <div className="td-tbl-head">
          <h1 className="td-tbl-title">Project groups</h1>
          <Button variant="inverse" icon="plus" onClick={openNewGroup}>
            New group
          </Button>
        </div>
        <div className="td-tbl-card">
          <table className="td-tbl">
            <thead>
              <tr>
                <th>
                  <span className="td-sr-only">Icon</span>
                </th>
                <th>Project group</th>
                <th className="td-tbl-center">Item ID</th>
                <th className="td-tbl-num">Projects</th>
                <th className="td-tbl-num">Items</th>
                <th className="td-tbl-num">Completed</th>
                <th>
                  <span className="td-sr-only">Settings</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.data.map((g) => {
                const items = g.projects.reduce((n, p) => n + p.itemCount, 0);
                const done = g.projects.reduce((n, p) => n + p.doneCount, 0);
                const renaming = renamingId === g.id;
                const first = g.projects[0];
                return (
                  <tr
                    key={g.id}
                    className="td-tbl-row"
                    tabIndex={0}
                    aria-label={`Open ${g.name}`}
                    onClick={() => !renaming && first && navigate({ to: "/p/$projectId", params: { projectId: first.id }, search: {} })}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && first) {
                        e.preventDefault();
                        void navigate({ to: "/p/$projectId", params: { projectId: first.id }, search: {} });
                      }
                    }}
                  >
                    <td className="td-tbl-ic">
                      <Icon name="folders" size={16} color="var(--ink-600)" />
                    </td>
                    <td className="td-tbl-name" onClick={renaming ? (e) => e.stopPropagation() : undefined} onKeyDown={renaming ? (e) => e.stopPropagation() : undefined}>
                      {renaming ? (
                        <input className="td-tbl-rename" autoFocus value={nameDraft} aria-label={`Rename ${g.name}`} onChange={(e) => setNameDraft(e.target.value)} onFocus={(e) => e.target.select()} onBlur={() => commitRename(g)} onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(g);
                          else if (e.key === "Escape") setRenamingId(null);
                        }} />
                      ) : (
                        g.name
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <div className="td-tbl-idcell">
                        {editing === g.id ? (
                          <input className="td-tbl-idinput" value={draft} autoFocus maxLength={5} aria-label={`Item ID prefix for ${g.name}`} onChange={(e) => setDraft(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} onFocus={(e) => e.target.select()} onBlur={() => commitAbbr(g.id)} onKeyDown={(e) => {
                            if (e.key === "Enter") commitAbbr(g.id);
                            else if (e.key === "Escape") setEditing(null);
                          }} />
                        ) : (
                          <span className="td-tbl-abbr" role="button" tabIndex={0} aria-label={`Edit item ID prefix ${g.keyPrefix} for ${g.name}`} onClick={() => {
                            setEditing(g.id);
                            setDraft(g.keyPrefix);
                          }} onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setEditing(g.id);
                              setDraft(g.keyPrefix);
                            }
                          }}>
                            {g.keyPrefix}
                          </span>
                        )}
                        {editing === g.id ? null : <IconButton className="td-tbl-idedit" name="pencil" label={`Edit item ID prefix for ${g.name}`} tooltip="Edit item ID prefix" size={22} iconSize={13} onClick={() => {
                          setEditing(g.id);
                          setDraft(g.keyPrefix);
                        }} />}
                      </div>
                    </td>
                    <td className="td-tbl-num">{g.projects.length}</td>
                    <td className="td-tbl-num">{items}</td>
                    <td className="td-tbl-num">{items ? `${Math.round((done / items) * 100)}%` : <span className="td-tbl-dim">—</span>}</td>
                    <td className="td-tbl-set" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <MenuButton label={`Settings for ${g.name}`} tooltip="Group settings" placement="bottom-end" tier="detached" size={28} iconSize={16}>
                        <MenuItem
                          icon="pencil"
                          onSelect={() => {
                            setNameDraft(g.name);
                            setRenamingId(g.id);
                          }}
                        >
                          Rename
                        </MenuItem>
                        <MenuDivider />
                        <MenuItem
                          icon="trash-2"
                          danger
                          disabled={g.projects.length > 0}
                          title={g.projects.length ? "Move or delete its projects first" : undefined}
                          onSelect={() => {
                            m.deleteGroup.mutate({ id: g.id });
                            notify({ message: `Deleted the group ${quote(g.name)}`, icon: "trash-2" });
                          }}
                        >
                          Delete
                        </MenuItem>
                      </MenuButton>
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
