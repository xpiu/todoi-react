// ArchiveView — where archived and deleted projects and items wait: Archive keeps things out of the
// way for good, Trash keeps them 90 days. One block: Archive · Trash segment, search, a project
// filter (account scope), then a card of 44px rows with Restore and a ⋯ (Open · Delete / Delete
// forever, confirmed inline). Spec: DESIGN.md › Archive & Trash.
import { useState, type ReactNode } from "react";

import { listIconFor } from "../board/listIcons";
import { Button } from "../core/Button";
import { EmptyState } from "../core/EmptyState";
import { Icon, type IconName } from "../core/Icon";
import { count } from "../core/text";
import { MenuButton, MenuDivider, MenuItem } from "../core/Menu";
import { Segmented } from "../core/Segmented";
import { Select } from "../core/Select";
import { TextField } from "../core/TextField";
import { relativeTime } from "./ActivityLog";
import "./ArchiveView.css";

export const ARCHIVE_RETENTION_DAYS = 90;
const DAY = 86400000;
export function daysLeft(deletedAt: string, now = Date.now(), retention = ARCHIVE_RETENTION_DAYS): number | null {
  const t = new Date(deletedAt).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, retention - Math.floor((now - t) / DAY));
}
const goneIn = (n: number | null) => (n == null ? "" : n <= 0 ? "gone today" : n === 1 ? "gone tomorrow" : `gone in ${n} days`);

export interface ArchiveEntry {
  id: string;
  kind: "project" | "item";
  removed: "archived" | "deleted";
  title: string;
  key?: string;
  at?: string | null;
  by?: string;
  done?: boolean;
  icon?: IconName | null;
  color?: string;
  projectId?: string;
  projectName?: string;
  groupName?: string;
  listName?: string;
  itemCount?: number;
}

export interface ArchiveViewProps {
  entries: ArchiveEntry[];
  tab?: "archive" | "trash";
  onTabChange?: (tab: "archive" | "trash") => void;
  /** Project scope: no project filter, project-less meta */
  project?: boolean;
  projects?: Array<{ id: string; name: string; icon?: IconName | null; color?: string }>;
  onRestore: (e: ArchiveEntry) => void;
  /** Archive → trash */
  onDelete?: (e: ArchiveEntry) => void;
  /** Trash → gone */
  onDestroy?: (e: ArchiveEntry) => void;
  onOpen?: (e: ArchiveEntry) => void;
  onEmptyTrash?: (entries: ArchiveEntry[]) => void;
  now?: number;
  retentionDays?: number;
  surface?: "chrome" | "card";
}

export function ArchiveView({ entries, tab: tabProp, onTabChange, project, projects = [], onRestore, onDelete, onDestroy, onOpen, onEmptyTrash, now, retentionDays = ARCHIVE_RETENTION_DAYS, surface = "chrome" }: ArchiveViewProps) {
  const [tabState, setTabState] = useState<"archive" | "trash">("archive");
  const tab = tabProp ?? tabState;
  const [q, setQ] = useState("");
  const [pf, setPf] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const [mounted] = useState(() => Date.now());
  const t0 = now ?? mounted;
  const setTab = (t: "archive" | "trash") => {
    setTabState(t);
    onTabChange?.(t);
    setConfirm(null);
    setEmptyConfirm(false);
  };
  const inTab = entries.filter((e) => e.removed === (tab === "trash" ? "deleted" : "archived"));
  const nArchive = entries.filter((e) => e.removed === "archived").length, nTrash = entries.length - nArchive;
  const needle = q.trim().toLowerCase();
  const shown = inTab.filter((e) => (!pf || e.projectId === pf || (e.kind === "project" && e.id === pf)) && (!needle || e.title.toLowerCase().includes(needle) || (e.key ?? "").toLowerCase().includes(needle)));
  const projectsShown = shown.filter((e) => e.kind === "project"), itemsShown = shown.filter((e) => e.kind !== "project");
  const both = projectsShown.length > 0 && itemsShown.length > 0;
  const meta = (e: ArchiveEntry): ReactNode[] => {
    const who = e.by ? (
      <>
        {tab === "trash" ? "Deleted by " : "Archived by "}
        <b>{e.by}</b>
      </>
    ) : tab === "trash" ? "Deleted" : "Archived";
    const parts: ReactNode[] = [who, e.at ? relativeTime(e.at, t0) : null];
    if (e.kind === "project") {
      if (e.groupName && !project) parts.push(e.groupName);
      if (e.itemCount != null) parts.push(count(e.itemCount, "item"));
    } else {
      const place = [!project && e.projectName ? e.projectName : null, e.listName].filter(Boolean).join(" › ");
      if (place) parts.push(place);
    }
    if (tab === "trash" && e.at) {
      const d = daysLeft(e.at, t0, retentionDays);
      parts.push(<span className={d != null && d <= 7 ? "td-arc-soon" : undefined}>{goneIn(d)}</span>);
    }
    return parts.filter((x) => x != null && x !== "").flatMap((p, i) => (i ? [" · ", p] : [p]));
  };
  const lead = (e: ArchiveEntry) => {
    if (e.kind === "project")
      return (
        <span className="td-arc-lead" data-kind="project">
          <Icon name={e.icon ?? "kanban"} size={16} color={e.color ?? "var(--ink-600)"} />
        </span>
      );
    const g = e.done ? { icon: "circle-check" as IconName, color: "var(--success-icon)" } : listIconFor(e.listName ?? "");
    return (
      <span className="td-arc-lead">
        <Icon name={g.icon} size={16} color={g.color} />
      </span>
    );
  };
  const row = (e: ArchiveEntry) => {
    const on = confirm === e.id;
    const forever = tab === "trash";
    return (
      <div className="td-arc-row" role="listitem" key={e.id} data-kind={e.kind} data-confirm={on || undefined}>
        {lead(e)}
        <span className="td-arc-text">
          <span className="td-arc-title" data-done={e.done || undefined} title={e.title}>
            {e.title}
          </span>
          <span className="td-arc-meta">{on ? `Delete “${e.title}” forever?${e.kind === "project" ? " Everything in it goes too." : " This can't be undone."}` : meta(e).map((m, i) => <span key={i}>{m}</span>)}</span>
        </span>
        {e.key && !on ? <span className="td-arc-key">{e.key}</span> : null}
        <span className="td-arc-ctl">
          {on ? (
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirm(null);
                  onDestroy?.(e);
                }}
              >
                Delete forever
              </Button>
            </>
          ) : (
            <>
              <Button icon="archive-restore" onClick={() => onRestore(e)}>
                Restore
              </Button>
              <MenuButton label={`More for ${e.title}`} tooltip="More" triggerClassName="td-arc-more" placement="bottom-end" tier="detached" size={28} iconSize={16}>
                {onOpen ? (
                  <MenuItem icon={e.kind === "project" ? "kanban" : "square-arrow-out-up-right"} onSelect={() => onOpen(e)}>
                    Open
                  </MenuItem>
                ) : null}
                {onOpen ? <MenuDivider /> : null}
                {forever ? (
                  <MenuItem icon="trash-2" danger onSelect={() => setConfirm(e.id)}>
                    Delete forever
                  </MenuItem>
                ) : (
                  <MenuItem icon="trash-2" onSelect={() => onDelete?.(e)}>
                    Delete
                  </MenuItem>
                )}
              </MenuButton>
            </>
          )}
        </span>
      </div>
    );
  };
  const group = (label: string, n: number) => (
    <div className="td-arc-group" key={`g-${label}`}>
      {label} · {n}
    </div>
  );
  const empty = () => {
    if (needle || pf) return <EmptyState surface="card" compact icon="search" title={`No matches${needle ? ` for “${q.trim()}”` : ""}`} hint={pf ? "In this project. Pick All projects to search everywhere." : undefined} secondary={{ label: "Clear search", onClick: () => {
      setQ("");
      setPf(null);
    } }} className="td-arc-empty" />;
    return tab === "trash" ? <EmptyState surface="card" compact icon="trash-2" title="Trash is empty" hint={`Deleted projects and items stay here for ${retentionDays} days, then they're gone.`} className="td-arc-empty" /> : <EmptyState surface="card" compact icon="archive" title="Nothing archived" hint={project ? "Items archived from this project show up here, ready to restore." : "Archived projects and items show up here, ready to restore."} className="td-arc-empty" />;
  };
  const cap = tab === "trash" ? `Deleted projects and items are kept for ${retentionDays} days, then removed for good. Restore puts them back where they were.` : "Archived projects and items are out of the way but not gone. Restore puts them back where they were.";
  return (
    <div className={"td-arc" + (surface === "card" ? " td-arc-oncard" : "")} data-tab={tab}>
      <div className="td-arc-bar">
        <Segmented aria-label="Archive or trash" value={tab} onChange={setTab} options={[{ id: "archive", icon: "archive", label: `Archive${nArchive ? ` ${nArchive}` : ""}` }, { id: "trash", icon: "trash-2", label: `Trash${nTrash ? ` ${nTrash}` : ""}` }]} />
        {emptyConfirm ? null : <TextField icon="search" className="td-arc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "trash" ? "Search trash" : "Search archive"} aria-label={tab === "trash" ? "Search trash" : "Search archive"} onKeyDown={(e) => {
          if (e.key === "Escape" && q) {
            e.stopPropagation();
            setQ("");
          } else if (e.key.length === 1) e.stopPropagation();
        }} />}
        {!project && projects.length && !emptyConfirm ? <Select aria-label="Project" value={pf ?? "__all"} options={[{ value: "__all", label: "All projects", icon: "folders" as IconName }, ...projects.map((p) => ({ value: p.id, label: p.name, icon: p.icon ?? ("kanban" as IconName), iconColor: p.color }))]} onChange={(v) => setPf(v === "__all" ? null : v)} width={240} tier="detached" /> : null}
        <span className="td-arc-spacer" />
        {tab === "trash" && onEmptyTrash && inTab.length ? (
          emptyConfirm ? (
            <span className="td-arc-confirm">
              <span className="td-arc-cap td-arc-cap-strong">Delete {inTab.length === 1 ? "1 entry" : `${inTab.length} entries`} forever?</span>
              <Button variant={surface === "card" ? "ghost" : "chrome-ghost"} onClick={() => setEmptyConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setEmptyConfirm(false);
                  onEmptyTrash(inTab);
                }}
              >
                Empty trash
              </Button>
            </span>
          ) : (
            <Button variant={surface === "card" ? "ghost" : "chrome-ghost"} icon="trash-2" onClick={() => setEmptyConfirm(true)}>
              Empty trash
            </Button>
          )
        ) : null}
      </div>
      <p className="td-arc-cap">{cap}</p>
      {shown.length ? (
        <div className="td-arc-list" role="list" aria-label={tab === "trash" ? "Trash" : "Archive"}>
          {both ? group("Projects", projectsShown.length) : null}
          {projectsShown.map(row)}
          {both ? group("Items", itemsShown.length) : null}
          {itemsShown.map(row)}
        </div>
      ) : (
        empty()
      )}
    </div>
  );
}
