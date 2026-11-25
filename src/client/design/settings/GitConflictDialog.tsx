// GitConflictDialog — "Resolve GitHub sync conflict": each thing that changed in Todoi and in the file
// since the last sync, with its three versions (before the sync, Todoi's, the file's) and a choice per
// conflict; "Keep all" picks one side for every conflict. Sync stays paused until Apply. Pure: the host
// sends the choices. Values read the way Todoi shows them (Status names, dates, list names).
// From Design's ConflictDialog (SettingsSections.jsx). Spec: DESIGN.md › Storage & sync › Git sync.
import { useState } from "react";

import type { MergeConflict, MergeField } from "../../../shared/projectDoc/merge";
import { Button } from "../core/Button";
import { formatDate } from "../core/dates";
import { Icon } from "../core/Icon";
import type { DialogCloseReason } from "../core/Dialog";
import { InlineError } from "../core/InlineError";
import { PRIORITY_OPTIONS } from "../core/itemFields";
import { statusById } from "../core/statuses";
import { FlowFrame } from "./accountFlow";
import "./GitSync.css";

export type ConflictChoice = "ours" | "theirs";

export interface GitConflictDialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  /** "acme/plans" */
  repoName: string;
  conflicts: readonly MergeConflict[];
  /** "list:<id>" / "item:<id>" → a name, for "place" conflicts */
  places?: Readonly<Record<string, string>>;
  onApply?: (choices: Record<string, ConflictChoice>) => void;
  busy?: boolean;
  error?: string | null;
  offline?: boolean;
}

const FIELD_NAMES: Record<MergeField, string> = { title: "Title", done: "Done", status: "Status", priority: "Priority", start: "Start date", due: "Due date", description: "Description", place: "List" };

/** A conflict's subject line: what it is about. */
export function conflictSubject(c: MergeConflict): string {
  switch (c.kind) {
    case "field":
      return `${FIELD_NAMES[c.field!]} changed in Todoi and in the file`;
    case "edited-deleted":
      return "Changed in Todoi, deleted in the file";
    case "deleted-edited":
      return "Deleted in Todoi, changed in the file";
    case "list-name":
      return "List renamed in Todoi and in the file";
    case "list-removed":
      return c.ours ? "List changed in Todoi, removed in the file" : "List removed in Todoi, changed in the file";
  }
}

function show(c: MergeConflict, side: "base" | ConflictChoice, places: Readonly<Record<string, string>>): string | null {
  if (c.kind === "edited-deleted") return side === "base" ? "As it was" : side === "ours" ? "Changed" : "Deleted";
  if (c.kind === "deleted-edited") return side === "base" ? "As it was" : side === "ours" ? "Deleted" : "Changed";
  if (c.kind === "list-removed") return side === "base" ? "As it was" : c[side] ? "Kept, with changes" : "Removed";
  const v = c[side];
  if (v === undefined || v === null || v === "") return null;
  switch (c.field) {
    case "done":
      return v ? "Done" : "Open";
    case "status":
      return statusById(String(v))?.name ?? String(v);
    case "priority":
      return PRIORITY_OPTIONS.find((o) => o.value === v)?.label ?? String(v);
    case "start":
    case "due":
      return formatDate(String(v));
    case "place": {
      const [kind, id] = String(v).split(/:(.+)/);
      const name = places[String(v)] ?? id ?? "";
      return kind === "item" ? `Under “${name}”` : `In “${name}”`;
    }
    default:
      return String(v);
  }
}

export function GitConflictDialog({ open, onClose, repoName, conflicts, places = {}, onApply, busy = false, error, offline = false }: GitConflictDialogProps) {
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setChoices({});
  }
  const pick = (key: string, side: ConflictChoice) => setChoices((cs) => ({ ...cs, [key]: side }));
  const all = (side: ConflictChoice) => setChoices(Object.fromEntries(conflicts.map((c) => [c.key, side])));
  const chosen = conflicts.filter((c) => choices[c.key]).length;
  const ready = chosen === conflicts.length && conflicts.length > 0;
  const n = conflicts.length;

  return (
    <FlowFrame
      open={open}
      onClose={onClose}
      title="Resolve GitHub sync conflict"
      width={640}
      footerLead={ready ? undefined : n > 1 ? `${chosen} of ${n} decided` : "Pick a version to apply"}
      footer={
        <>
          <Button variant="outline" onClick={() => onClose("cancel")}>
            Leave paused
          </Button>
          <Button variant="primary" icon="git-merge" disabled={!ready || busy || offline} onClick={() => onApply?.(choices)}>
            {busy ? "Syncing…" : "Apply and sync"}
          </Button>
        </>
      }
    >
      <p className="td-account-text">
        {n === 1 ? "One thing" : `${n} things`} changed in Todoi and in the file in <b>{repoName}</b> since the last sync. Pick the version to keep; everything else has already merged. Sync is paused until you apply.
      </p>
      {n > 1 ? (
        <div className="td-git-bulk">
          <span className="td-git-bulk-note">For every conflict:</span>
          <Button variant="ghost" onClick={() => all("ours")}>
            Keep Todoi's for all
          </Button>
          <Button variant="ghost" onClick={() => all("theirs")}>
            Keep the file's for all
          </Button>
        </div>
      ) : null}
      <ul className="td-git-conflicts">
        {conflicts.map((c) => {
          const picked = choices[c.key];
          // A title that changed on both sides is named by what it was.
          const heading = c.field === "title" && typeof c.base === "string" && c.base ? c.base : c.title;
          const before = show(c, "base", places);
          return (
            <li key={c.key} className="td-git-conflict">
              <div className="td-git-conflict-title">
                {heading}
                <span>{conflictSubject(c)}</span>
              </div>
              <div className="td-git-versions" role="group" aria-label={`Keep which version of “${heading}”`}>
                <div className="td-git-version" data-muted="true">
                  <span className="td-git-version-side">At last sync</span>
                  <span className="td-git-version-value" data-empty={before === null ? "true" : undefined}>{before ?? "Empty"}</span>
                </div>
                {(["ours", "theirs"] as const).map((side) => {
                  const text = show(c, side, places);
                  return (
                    <button key={side} type="button" className="td-git-version" aria-pressed={picked === side} data-picked={picked === side ? "true" : undefined} onClick={() => pick(c.key, side)}>
                      <span className="td-git-version-side">
                        <Icon name={picked === side ? "circle-check" : "circle"} size={14} />
                        {side === "ours" ? "Keep Todoi's" : "Keep the file's"}
                      </span>
                      <span className="td-git-version-value" data-empty={text === null ? "true" : undefined}>{text ?? "Empty"}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <InlineError message={offline ? "You're offline. Reconnect to the internet to apply your choices." : error ?? null} />
    </FlowFrame>
  );
}
