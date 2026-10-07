// Recovery keeps the saved draft inspectable until the user chooses how to resolve it.
import { useState } from "react";

import { discardOperation, retryOperation, type SyncOperation } from "../data/sync";
import { operationBody } from "../data/syncModel";
import { Button } from "../design/core/Button";
import { copyIcon, useCopy } from "../design/core/clipboard";
import { ConfirmDialog } from "../design/core/Dialog";
import { TextField } from "../design/core/TextField";
import { notifyFailure } from "./feedback";
import "./SyncRecovery.css";

export function syncOperationLabel(operation: SyncOperation): string {
  const values = operationBody(operation);
  const parts = operation.path.split("?")[0]!.split("/").filter(Boolean);
  const kind = parts[1] === "archive" ? parts[2] : parts[1];
  const resources: Record<string, string> = { items: "item", comments: "comment", labels: "label", lists: "list", projects: "project", groups: "group", "saved-views": "view", attachments: "attachment" };
  const resource = parts[3] === "comments" ? "comment" : resources[kind ?? ""] ?? "workspace";
  const action = operation.method === "DELETE" ? "Delete" : operation.method === "POST" && (!parts[2] || parts[3] === "comments") ? "Add" : "Update";
  const title = typeof values.title === "string" ? values.title : typeof values.name === "string" ? values.name : null;
  return `${action} ${resource}${title ? ` “${title}”` : ""}`;
}

function savedDraft(operation: SyncOperation): string {
  const values = operationBody(operation);
  const texts = Object.entries(values).filter(([key, value]) => ["title", "name", "description", "body", "text", "draft"].includes(key) && typeof value === "string");
  if (texts.length === 1) return texts[0]![1] as string;
  if (texts.length) return texts.map(([key, value]) => `${key[0]!.toUpperCase()}${key.slice(1)}\n${value as string}`).join("\n\n");
  const fields = Object.entries(values).filter(([key]) => key !== "id" && key !== "quiet");
  if (fields.length) return fields.map(([key, value]) => {
    const label = key === "done" ? "Completed" : key[0]!.toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
    const text = typeof value === "boolean" ? value ? "Yes" : "No" : typeof value === "string" ? value : JSON.stringify(value);
    return `${label}: ${text}`;
  }).join("\n");
  return operation.method === "DELETE" ? "This saved change deletes the record." : "This saved change updates the record.";
}

export function SyncRecovery({ operation, online }: { operation: SyncOperation; online: boolean }) {
  const [open, setOpen] = useState(operation.state === "failed");
  const [copied, copy] = useCopy();
  const [confirm, setConfirm] = useState<"discard" | "overwrite" | null>(null);
  const [busy, setBusy] = useState(false);
  const conflict = operation.status === 409;
  const draft = savedDraft(operation);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setConfirm(null);
    } catch (error) {
      notifyFailure(error, "Couldn't resolve this saved change: ");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="td-sync-recovery">
      <Button variant="ghost" icon={open ? "chevron-up" : "chevron-down"} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide saved change" : "Review saved change"}
      </Button>
      {open ? (
        <>
          {conflict ? <p className="td-sync-explanation">Another edit changed this record. Copy your draft, apply your saved fields over the latest version, or keep the server version.</p> : null}
          <TextField multiline readOnly rows={4} aria-label="Saved change" value={draft} className="td-sync-draft" />
          <div className="td-sync-actions">
            <Button icon={copyIcon(copied, "copy")} onClick={() => void copy(draft)}>{copied === "copied" ? "Copied" : "Copy saved change"}</Button>
            {operation.state === "failed" ? <Button icon="refresh-cw" disabled={!online || busy} onClick={() => conflict ? setConfirm("overwrite") : void run(() => retryOperation(operation.id))}>{conflict ? "Apply my change" : busy ? "Retrying…" : "Retry"}</Button> : null}
            <Button variant="ghost" icon="trash-2" disabled={busy} onClick={() => setConfirm("discard")}>{conflict ? "Use server version" : "Discard change"}</Button>
          </div>
          {copied === "failed" ? <p className="td-sync-explanation" role="status">Couldn't copy. Select the saved change above and copy it yourself.</p> : null}
        </>
      ) : null}
      <ConfirmDialog
        open={!!confirm}
        title={confirm === "overwrite" ? "Apply your change over the latest version?" : "Discard this saved change?"}
        body={confirm === "overwrite" ? "Your saved fields replace those fields in the latest server version. Other fields keep their latest values." : "This removes your saved change from this device and shows the server version. Copy the saved change first if you want to keep it."}
        confirmLabel={confirm === "overwrite" ? "Apply my change" : "Discard change"}
        danger={confirm === "discard"}
        busy={busy}
        busyLabel={confirm === "overwrite" ? "Applying…" : "Discarding…"}
        onClose={() => { if (!busy) setConfirm(null); }}
        onConfirm={() => void run(() => confirm === "overwrite" ? retryOperation(operation.id, true) : discardOperation(operation.id))}
      />
    </div>
  );
}
