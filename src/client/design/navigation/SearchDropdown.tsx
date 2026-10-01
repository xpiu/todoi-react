// SearchDropdown — the results panel under the top-bar search field: project groups, projects,
// items and Inbox in grouped sections; ↑↓ + Enter navigate at document level so the field keeps
// focus; Esc closes. Anchored inside the field's wrapper (the top bar is never clipped), which is
// the one listed exception to the Popover rule until it migrates. Spec: DESIGN.md › Search dropdown.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { Icon, type IconName } from "../core/Icon";
import "./SearchDropdown.css";

export interface SearchSourceGroup {
  id: string;
  name: string;
  projects?: unknown[];
}
export interface SearchSourceProject {
  id: string;
  name: string;
  icon?: IconName;
  color?: string;
  groupName?: string;
}
export interface SearchSourceItem {
  id: string;
  itemId?: string;
  title: string;
  listName?: string;
  done?: boolean;
}
export type SearchResultType = "group" | "project" | "item" | "inbox";
export interface SearchSources {
  groups?: SearchSourceGroup[];
  projects?: SearchSourceProject[];
  items?: SearchSourceItem[];
  inbox?: SearchSourceItem[];
}
export type SearchEntity = SearchSourceGroup | SearchSourceProject | SearchSourceItem;
export interface SearchRecent {
  type: SearchResultType;
  entity: SearchEntity;
}

interface Row {
  type: SearchResultType;
  id: string;
  itemId?: string;
  icon?: IconName;
  iconColor?: string;
  title: string;
  meta?: string;
  done?: boolean;
  entity: SearchEntity;
}

function mark(text: string, needle: string): ReactNode {
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

export interface SearchDropdownProps {
  query?: string;
  sources?: SearchSources;
  recent?: SearchRecent[];
  onSelect?: (type: SearchResultType, id: string, entity: SearchEntity) => void;
  onClose?: () => void;
  /** @default 4 */
  maxPerSection?: number;
  style?: CSSProperties;
  className?: string;
}

export function SearchDropdown({ query = "", sources = {}, recent = [], onSelect, onClose, maxPerSection = 4, style, className }: SearchDropdownProps) {
  const needle = query.trim().toLowerCase();
  const has = (s?: string) => !!s && s.toLowerCase().includes(needle);
  const { groups = [], projects = [], items = [], inbox = [] } = sources;
  const rowOf = {
    group: (g: SearchSourceGroup): Row => ({ type: "group", id: g.id, icon: "folders", title: g.name, meta: g.projects ? `${g.projects.length} ${g.projects.length === 1 ? "project" : "projects"}` : "Project group", entity: g }),
    project: (p: SearchSourceProject): Row => ({ type: "project", id: p.id, icon: p.icon ?? "kanban", iconColor: p.color, title: p.name, meta: p.groupName ?? "Project", entity: p }),
    item: (it: SearchSourceItem): Row => ({ type: "item", id: it.id, itemId: it.itemId, title: it.title, meta: it.listName, done: it.done, entity: it }),
    inbox: (it: SearchSourceItem): Row => ({ type: "inbox", id: it.id, itemId: it.itemId, icon: "inbox", title: it.title, meta: "Inbox", entity: it }),
  };
  let sections: Array<{ label: string; rows: Row[] }>;
  if (needle) {
    sections = [
      { label: "Projects", rows: projects.filter((p) => has(p.name)).map(rowOf.project) },
      { label: "Project groups", rows: groups.filter((g) => has(g.name)).map(rowOf.group) },
      { label: "Items", rows: items.filter((it) => has(it.title) || has(it.itemId) || has(it.listName)).map(rowOf.item) },
      { label: "Inbox", rows: inbox.filter((it) => has(it.title) || has(it.itemId)).map(rowOf.inbox) },
    ]
      .map((s) => ({ ...s, rows: s.rows.slice(0, maxPerSection) }))
      .filter((s) => s.rows.length);
  } else {
    const rec: Row[] = recent.slice(0, maxPerSection).map((r) => {
      if (r.type === "group") return rowOf.group(r.entity as SearchSourceGroup);
      if (r.type === "project") return rowOf.project(r.entity as SearchSourceProject);
      if (r.type === "inbox") return rowOf.inbox(r.entity as SearchSourceItem);
      return rowOf.item(r.entity as SearchSourceItem);
    });
    sections = [
      ...(rec.length ? [{ label: "Recent", rows: rec }] : []),
      { label: "Projects", rows: projects.slice(0, maxPerSection).map(rowOf.project) },
      { label: "Inbox", rows: inbox.slice(0, maxPerSection).map(rowOf.inbox) },
    ].filter((s) => s.rows.length);
  }
  const flat = sections.flatMap((s) => s.rows);
  const [cur, setCur] = useState(0);
  const sel = Math.min(cur, Math.max(0, flat.length - 1));
  const pick = (r: Row) => onSelect?.(r.type, r.id, r.entity);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCur((c) => (flat.length ? (Math.min(c, flat.length - 1) + 1) % flat.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCur((c) => (flat.length ? (Math.min(c, flat.length - 1) - 1 + flat.length) % flat.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = flat[sel];
        if (r) pick(r);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });
  let idx = -1;
  return (
    <div className={["td-sd", className ?? ""].join(" ").trim()} style={style} role="listbox" id="td-sd-listbox" aria-label="Search results" onMouseDown={(e) => e.preventDefault()}>
      {flat.length ? (
        <div className="td-sd-scroll">
          {sections.map((s) => (
            <div key={s.label}>
              <div className="td-sd-head">{s.label}</div>
              {s.rows.map((r) => {
                idx++;
                const i = idx;
                return (
                  <button key={r.type + r.id} id={`td-sd-opt-${i}`} type="button" className="td-sd-row" role="option" aria-selected={i === sel} onMouseEnter={() => setCur(i)} onClick={() => pick(r)}>
                    {r.itemId ? (
                      <span className="td-sd-id">{r.itemId}</span>
                    ) : (
                      <span className="td-sd-ico">
                        <Icon name={r.icon ?? "kanban"} size={14} color={r.iconColor} />
                      </span>
                    )}
                    <span className="td-sd-title" data-done={r.done ? "true" : undefined}>
                      {mark(r.title, needle)}
                    </span>
                    {r.meta ? <span className="td-sd-meta">{r.meta}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="td-sd-empty">No results for “{query}”</div>
      )}
      <div className="td-sd-foot">
        <span>
          <kbd className="td-kbd">↑↓</kbd> navigate
        </span>
        <span>
          <kbd className="td-kbd">↵</kbd> open
        </span>
        <span>
          <kbd className="td-kbd">esc</kbd> close
        </span>
      </div>
    </div>
  );
}
