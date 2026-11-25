// RestoreArchiveDialog — restore what Export everything made, in three stages on the shared Dialog:
// "choose" (pick the .zip; nothing you have changes) → "review" (what it will create — groups, projects,
// items, comments, files — and what comes back differently) → "done". Restored projects are new copies
// next to yours. Pure: the host reads the file, restores it and owns the stage.
// Spec: DESIGN.md › Export & print › Restore.
import { useRef } from "react";

import type { ArchiveSummary } from "../../../shared/archive";
import { Button } from "../core/Button";
import type { DialogCloseReason } from "../core/Dialog";
import { Icon } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import { count } from "../core/text";
import { FlowFrame, FlowState } from "./accountFlow";
import "./GitSync.css";

export type RestoreStage = "choose" | "review" | "done";
export interface RestorePreview extends ArchiveSummary {
  /** Who exported it, and when (ISO) */
  accountName: string;
  exportedAt: string;
  projectNames: string[];
}

export interface RestoreArchiveDialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  stage: RestoreStage;
  preview?: RestorePreview | null;
  /** The person picked a file: the host reads it and moves to "review" (or sets `error`) */
  onPick?: (file: File) => void;
  onBack?: () => void;
  onRestore?: () => void;
  onOpenProjects?: () => void;
  /** Reading or restoring */
  busy?: boolean;
  error?: string | null;
  offline?: boolean;
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
/** "a, b and c" */
const listOf = (parts: Array<string | null>) => {
  const xs = parts.filter((p): p is string => !!p);
  return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? "");
};
const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });

export function RestoreArchiveDialog({ open, onClose, stage, preview, onPick, onBack, onRestore, onOpenProjects, busy = false, error, offline = false }: RestoreArchiveDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  if (stage === "done" && preview)
    return (
      <FlowFrame
        open={open}
        onClose={onClose}
        title="Restore from an export"
        initialFocus={doneRef}
        footer={
          <>
            <Button variant="outline" onClick={() => onClose("close")}>
              Done
            </Button>
            <Button ref={doneRef} variant="primary" icon="kanban" onClick={onOpenProjects}>
              Open Projects
            </Button>
          </>
        }
      >
        <FlowState icon="circle-check" tone="success" title={`Restored ${count(preview.projects, "project")}`}>
          {listOf([count(preview.items, "item"), preview.comments ? count(preview.comments, "comment") : null, preview.attachments ? count(preview.attachments, "file") : null])} {preview.items + preview.comments + preview.attachments === 1 ? "is" : "are"} back, as new copies next to your projects.
        </FlowState>
      </FlowFrame>
    );

  if (stage === "review" && preview) {
    const shown = preview.projectNames.slice(0, 6);
    return (
      <FlowFrame
        open={open}
        onClose={onClose}
        title="Restore from an export"
        width={520}
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={onBack}>
              Back
            </Button>
            <Button variant="primary" icon="archive-restore" disabled={busy || offline || !preview.projects} onClick={onRestore}>
              {busy ? "Restoring…" : `Restore ${count(preview.projects, "project")}`}
            </Button>
          </>
        }
      >
        <FlowState icon="archive" title={preview.yours ? `Your export from ${dateOf(preview.exportedAt)}` : `Exported by ${preview.accountName} on ${dateOf(preview.exportedAt)}`}>
          {[count(preview.groups, "group"), count(preview.projects, "project"), count(preview.items, "item"), count(preview.comments, "comment"), preview.attachments ? `${count(preview.attachments, "file")} (${size(preview.attachmentBytes)})` : null].filter(Boolean).join(" · ")}
        </FlowState>
        {shown.length ? (
          <ul className="td-restore-projects">
            {shown.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
            {preview.projectNames.length > shown.length ? <li>and {count(preview.projectNames.length - shown.length, "more project")}</li> : null}
            {preview.inboxItems ? <li>{count(preview.inboxItems, "Inbox item")}, which go to your Inbox</li> : null}
          </ul>
        ) : null}
        <p className="td-account-text">They come back as new copies next to your projects, with their lists, items, comments and files. Nothing you have now changes. If you still have any of these projects, you'll see both; delete whichever you don't need.</p>
        {preview.notes.length ? (
          <>
            <div className="td-restore-head">Check before restoring</div>
            <ul className="td-restore-notes">
              {preview.notes.map((n) => (
                <li key={n}>
                  <Icon name="circle-alert" size={14} />
                  {n}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="td-account-note">Git sync, API tokens and sign-in methods aren't part of exports. Set them up again afterwards.</p>
        <InlineError message={offline ? "You're offline. Reconnect to the internet to restore." : error ?? null} />
      </FlowFrame>
    );
  }

  return (
    <FlowFrame
      open={open}
      onClose={onClose}
      title="Restore from an export"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose("cancel")}>
            Cancel
          </Button>
          <Button variant="primary" icon="upload" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Reading…" : "Choose .zip file"}
          </Button>
        </>
      }
    >
      <p className="td-account-text">Choose the .zip file that Export everything downloaded. Its projects come back as new copies next to yours; nothing you have now changes.</p>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick?.(f);
          e.target.value = "";
        }}
      />
      <InlineError message={error ?? null} />
    </FlowFrame>
  );
}
