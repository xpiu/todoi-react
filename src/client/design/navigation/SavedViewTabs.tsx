// SavedViewTabs — named, shareable tabs that capture a project's view type + filters + sort, on their
// own chrome row under the toolbar: "All items" plus one tab per saved view (shared ones carry a users
// glyph), a blue dot while the live state drifts from the active view, a per-tab ⋯ menu, and Save view.
// Spec: DESIGN.md › Saved views.
import { useState } from "react";

import { Button } from "../core/Button";
import { Checkbox } from "../core/Checkbox";
import { Icon } from "../core/Icon";
import { MenuButton, MenuDivider, MenuItem } from "../core/Menu";
import { Popover, usePopover } from "../core/Popover";
import { summarizeView, type ViewDefinition } from "./viewState";
import "./SavedViewTabs.css";

export interface SavedViewTab {
  id: string;
  name: string;
  shared: boolean;
  definition: ViewDefinition;
}
export type SavedViewAction = "copy-link" | "update" | "rename" | "share" | "delete";

export interface SavedViewTabsProps {
  views: SavedViewTab[];
  activeId?: string | null;
  /** The live state differs from the active view's definition */
  dirty?: boolean;
  /** Something is active to save */
  canSave?: boolean;
  currentDef?: ViewDefinition;
  allLabel?: string;
  onSelect: (id: string | null) => void;
  onSave: (name: string, shared: boolean) => void;
  onAction: (id: string, action: SavedViewAction, value?: string | boolean) => void;
}

export function SavedViewTabs({ views, activeId = null, dirty = false, canSave = false, currentDef, allLabel = "All items", onSelect, onSave, onAction }: SavedViewTabsProps) {
  const save = usePopover();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const active = views.find((v) => v.id === activeId) ?? null;
  const commitSave = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n, shared);
    save.close();
    setName("");
  };
  const commitRename = () => {
    const n = draft.trim();
    const id = renaming;
    setRenaming(null);
    if (n && id) onAction(id, "rename", n);
  };
  const summary = currentDef ? summarizeView(currentDef) : [];
  return (
    <div className="td-sv" role="tablist" aria-label="Saved views">
      <button type="button" className="td-sv-tab" role="tab" aria-selected={!activeId} onClick={() => onSelect(null)}>
        {allLabel}
      </button>
      {views.map((v) => {
        const isA = v.id === activeId;
        return (
          <div key={v.id} className="td-sv-wrap">
            {renaming === v.id ? (
              <input
                className="td-sv-input td-sv-renaming"
                value={draft}
                autoFocus
                aria-label="View name"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <button type="button" className="td-sv-tab has-menu" role="tab" aria-selected={isA} title={v.shared ? `${v.name} — shared with the project` : `${v.name} — only you`} onClick={() => onSelect(v.id)}>
                {v.shared ? <Icon name="users" size={13} className="td-sv-shared" /> : null}
                {v.name}
                {isA && dirty ? <span className="td-sv-dot" title="Filters changed since this view was saved" aria-label="unsaved changes" /> : null}
                <span className="td-sv-more" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <MenuButton label={`Actions for ${v.name}`} tier="toolbar" placement="bottom-start" minWidth={200} size={18} iconSize={12} variant="chrome">
                    <MenuItem icon="link" onSelect={() => onAction(v.id, "copy-link")}>
                      Copy link
                    </MenuItem>
                    {isA && dirty ? (
                      <MenuItem icon="save" onSelect={() => onAction(v.id, "update")}>
                        Update with current filters
                      </MenuItem>
                    ) : null}
                    <MenuItem
                      icon="pencil"
                      onSelect={() => {
                        setDraft(v.name);
                        setRenaming(v.id);
                      }}
                    >
                      Rename
                    </MenuItem>
                    <MenuItem icon={v.shared ? "lock" : "users"} onSelect={() => onAction(v.id, "share", !v.shared)}>
                      {v.shared ? "Make it only mine" : "Share with the project"}
                    </MenuItem>
                    <MenuDivider />
                    <MenuItem icon="trash-2" danger onSelect={() => onAction(v.id, "delete")}>
                      Delete view
                    </MenuItem>
                  </MenuButton>
                </span>
              </button>
            )}
          </div>
        );
      })}
      {canSave ? (
        <Popover
          open={save.open}
          onOpenChange={save.setOpen}
          tier="toolbar"
          offset={6}
          width={280}
          role="dialog"
          aria-label="Save view"
          trigger={
            <button type="button" className="td-sv-save" title={active ? "Save these filters as a new view" : "Save the current filters and sort as a view"}>
              <Icon name="bookmark-plus" size={15} />
              {active && dirty ? "Save as new" : "Save view"}
            </button>
          }
        >
          <div className="td-sv-pop">
            <div className="td-sv-pop-title">Save as a view</div>
            <input
              className="td-sv-input"
              value={name}
              autoFocus
              placeholder="Name, e.g. Bugs this sprint"
              aria-label="View name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
                if (e.key === "Enter") commitSave();
              }}
            />
            {summary.length ? (
              <div className="td-sv-summary">
                {summary.map((s, i) => (
                  <code key={i}>{s}</code>
                ))}
              </div>
            ) : null}
            <Checkbox checked={shared} onChange={setShared} label="Share with the project" />
            <div className="td-sv-row">
              <Button variant="subtle" onClick={save.close}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!name.trim()} onClick={commitSave}>
                Save
              </Button>
            </div>
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
