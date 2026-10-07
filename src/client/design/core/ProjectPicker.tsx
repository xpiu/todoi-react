// ProjectPicker — move or copy items to another project: pick the project (search, glyph in its
// colour, group at the trailing edge; projects without lists are inert), then the destination list.
// ↑↓ + Enter move and pick from the search field, then from the focused lists listbox (ItemPicker's
// usePickerCursor). Panel body only. onPick(project, list) fires once; the consumer moves / copies and raises ONE toast.
// TransferDialog puts it in the "Move to project" / "Copy to project" dialog.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { listIconFor } from "../board/listIcons";
import { Dialog } from "./Dialog";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { usePickerCursor } from "./ItemPicker";
import "./ItemPicker.css";
import "./ProjectPicker.css";

export interface PickableList {
  id: string;
  name: string;
  icon?: IconName | null;
}
export interface PickableProject {
  id: string;
  name: string;
  icon?: IconName | null;
  color?: string;
  group?: string;
  /** Known lists; `loadLists` fetches them when absent */
  lists?: PickableList[];
}

export interface ProjectPickerProps {
  projects: PickableProject[];
  /** Excluded from the list */
  current?: string;
  action?: "move" | "copy";
  count?: number;
  onPick: (project: PickableProject, list: PickableList) => void;
  onBack?: () => void;
  loadLists?: (projectId: string) => Promise<PickableList[]>;
  heading?: string;
  /** false hides the heading row */
  showHeading?: boolean;
  note?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  /** The search field, for a host Dialog's initialFocus */
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function ProjectPicker({ projects, current, action = "move", count = 1, onPick, onBack, loadLists, heading, showHeading = true, note, placeholder = "Search projects…", autoFocus = true, inputRef }: ProjectPickerProps) {
  const [q, setQ] = useState("");
  const [proj, setProj] = useState<PickableProject | null>(null);
  // Back from the lists step returns focus to the search field, which remounts.
  const [returned, setReturned] = useState(false);
  const [loaded, setLoaded] = useState<{ id: string; lists: PickableList[] } | null>(null);
  const lists = proj ? (proj.lists ?? (loaded?.id === proj.id ? loaded.lists : null)) : null;
  const ql = q.trim().toLowerCase();
  const list = projects.filter((p) => p.id !== current && (!ql || [p.name, p.group].filter(Boolean).some((s) => String(s).toLowerCase().includes(ql))));
  const projCursor = usePickerCursor(list, (p) => p.id, setProj);
  const listCursor = usePickerCursor(lists ?? [], (l) => l.id, (l) => {
    if (proj) onPick(proj, l);
  });
  // The lists listbox takes focus when it mounts (the search field it replaces is gone).
  const focusOnMount = useCallback((el: HTMLElement | null) => {
    el?.focus();
  }, []);
  const verb = action === "copy" ? "Copy" : "Move";
  const title = heading ?? `${verb} to project`;
  const noteText = note !== undefined ? note : action === "copy" ? (count === 1 ? "The copy gets its own key and starts without comments or activity." : "Each copy gets its own key and starts without comments or activity.") : `Subitems, attachments and comments move along; labels match by name. ${count === 1 ? "The key changes" : "Keys change"} if the group differs. Non-member assignees and relations to items left behind are removed.`;
  useEffect(() => {
    if (!proj || proj.lists) return;
    let live = true;
    void loadLists?.(proj.id).then((ls) => live && setLoaded({ id: proj.id, lists: ls }));
    return () => {
      live = false;
    };
  }, [proj, loadLists]);
  if (proj) {
    return (
      <div className="td-prp">
        <div className="td-prp-head">
          <IconButton
            name="arrow-left"
            label="Back"
            size={22}
            iconSize={13}
            onClick={() => {
              setProj(null);
              setReturned(true);
              listCursor.reset();
            }}
          />
          <span className="td-prp-head-title">
            {verb} to {proj.name}
          </span>
        </div>
        {lists == null ? <div className="td-menu-note">Loading lists…</div> : null}
        {lists?.length ? (
          <div
            ref={focusOnMount}
            className="td-picker-list"
            {...listCursor.listboxProps}
            aria-label={`Lists in ${proj.name}`}
            tabIndex={0}
            aria-activedescendant={listCursor.activeId}
            onKeyDown={(e) => {
              // No field to type into here, so Space picks like Enter instead of scrolling.
              if (e.key === " ") {
                e.preventDefault();
                listCursor.pick();
              } else listCursor.onKeyDown(e);
            }}
          >
            {lists.map((l, i) => {
              const auto = listIconFor(l.name);
              return (
                <div key={l.id} className="td-picker-row" {...listCursor.optionProps(l, i)}>
                  <Icon name={l.icon ?? auto.icon} size={15} color={auto.color} />
                  <span className="td-prp-name">{l.name}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {lists && !lists.length ? <div className="td-menu-note">This project has no lists yet.</div> : null}
        {noteText ? <div className="td-menu-note">{noteText}</div> : null}
      </div>
    );
  }
  return (
    <div className="td-prp">
      {onBack || showHeading ? (
        <div className="td-prp-head">
          {onBack ? <IconButton name="arrow-left" label="Back" size={22} iconSize={13} onClick={onBack} /> : null}
          <span className="td-prp-head-title">{title}</span>
        </div>
      ) : null}
      <div className="td-picker-search">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          className="td-picker-input"
          autoFocus={autoFocus || returned}
          placeholder={placeholder}
          aria-label={placeholder}
          value={q}
          {...projCursor.comboboxProps}
          onChange={(e) => {
            setQ(e.target.value);
            projCursor.reset();
          }}
        />
      </div>
      {list.length ? (
        <div className="td-picker-list" {...projCursor.listboxProps} aria-label={title}>
          {list.map((p, i) => (
            <div key={p.id} className="td-picker-row" {...projCursor.optionProps(p, i)}>
              <Icon name={p.icon ?? "kanban"} size={15} color={p.color ?? "var(--ink-600)"} />
              <span className="td-prp-name">{p.name}</span>
              {p.group ? <span className="td-prp-group">{p.group}</span> : null}
              <Icon name="chevron-right" size={13} className="td-prp-chev" />
            </div>
          ))}
        </div>
      ) : (
        <div className="td-menu-note">No projects match</div>
      )}
    </div>
  );
}

export type TransferKind = "move" | "copy";

/** The picker in its dialog: open while `kind` is set, closing first on a pick; it keeps saying Move or Copy while it closes. */
export function TransferDialog({ kind, onClose, onPick, ...picker }: { kind: TransferKind | null; onClose: () => void; onPick: (kind: TransferKind, project: PickableProject, list: PickableList) => void } & Omit<ProjectPickerProps, "action" | "onPick" | "showHeading">) {
  const [shown, setShown] = useState<TransferKind>("move");
  const searchRef = useRef<HTMLInputElement>(null);
  if (kind && kind !== shown) setShown(kind);
  return (
    <Dialog open={!!kind} onClose={onClose} title={shown === "copy" ? "Copy to project" : "Move to project"} width={380} initialFocus={searchRef}>
      <ProjectPicker
        {...picker}
        autoFocus={false}
        inputRef={searchRef}
        action={shown}
        showHeading={false}
        onPick={(project, list) => {
          onClose();
          onPick(shown, project, list);
        }}
      />
    </Dialog>
  );
}
