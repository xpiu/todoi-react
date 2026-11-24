// DeleteAccountDialog — two steps on one Dialog. "review": what will be deleted (the projects only you
// work in, your project groups, the files), what you leave, what blocks it, and Export first. "confirm":
// type the account email, then the red Delete account. The end state is AccountDeletedPage (signed out,
// on AuthShell). Deletion is immediate: no grace period (owner decision D13). From Design's
// settings/DeleteAccountDialog (2026-11-24). Spec: DESIGN.md › Account.
import { useEffect, useRef, useState } from "react";

import { AuthShell, AuthState } from "../auth/AuthShell";
import { Button } from "../core/Button";
import type { DialogCloseReason } from "../core/Dialog";
import { Icon, type IconName } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import { count } from "../core/text";
import { FlowFrame } from "./accountFlow";

export interface DeleteAccountRow {
  name: string;
  /** "38 items", "3 projects" */
  meta?: string;
}

export interface DeleteAccountDialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  /** The account email the person must type (compared without case) */
  email: string;
  /** Projects the account owns that nobody else works in */
  projects?: DeleteAccountRow[];
  /** Project groups the account owns */
  groups?: DeleteAccountRow[];
  /** {count: 214, size: "1.2 GB"} */
  attachments?: { count: number; size?: string };
  /** Projects owned by others that the person leaves */
  memberOf?: number;
  /** What stops the deletion, one sentence each; Continue is disabled while any exist */
  blockers?: string[];
  /** The review is still loading: Continue waits */
  loading?: boolean;
  /** The review couldn't load: the reason, and Continue stays disabled */
  reviewError?: string | null;
  /** Renders "Export first" */
  onExport?: () => void;
  exportState?: "idle" | "busy" | "done";
  exportError?: string | null;
  /** The email matched and Delete account was pressed */
  onDelete?: () => void;
  /** "Deleting…" */
  busy?: boolean;
  /** Shown as "Couldn't delete the account: …"; the typed email stays */
  error?: string | null;
  offline?: boolean;
  /** The last log-in is too old for this: the confirm step asks to log in again instead */
  needsLogin?: boolean;
  onLogInAgain?: () => void;
  /** Stories: open on the confirm step @default "review" */
  defaultStep?: "review" | "confirm";
}

export function DeleteAccountDialog({ open, onClose, email, projects = [], groups = [], attachments, memberOf = 0, blockers = [], loading = false, reviewError, onExport, exportState = "idle", exportError, onDelete, busy = false, error, offline = false, needsLogin = false, onLogInAgain, defaultStep = "review" }: DeleteAccountDialogProps) {
  const [step, setStep] = useState(defaultStep);
  const [typed, setTyped] = useState("");
  // Each opening starts on the review with an empty field (reset while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setStep(defaultStep);
      setTyped("");
    }
  }
  const keepRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  // Focus follows the step: the email field on confirm, Continue again after Back.
  const shown = useRef(step);
  useEffect(() => {
    if (!open) shown.current = defaultStep;
    if (!open || shown.current === step) return;
    shown.current = step;
    (step === "confirm" ? fieldRef : continueRef).current?.focus();
  }, [open, step, defaultStep]);
  const match = !!email && typed.trim().toLowerCase() === email.toLowerCase();
  const blocked = blockers.length > 0;
  const remove = () => {
    if (match && !busy && !offline && !needsLogin) onDelete?.();
  };

  if (step === "confirm")
    return (
      <FlowFrame
        open={open}
        onClose={onClose}
        title="Delete account"
        footerLead="This can't be undone"
        initialFocus={fieldRef}
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setStep("review")}>
              Back
            </Button>
            {needsLogin ? (
              <Button variant="primary" onClick={onLogInAgain}>
                Log in again
              </Button>
            ) : (
              <Button variant="danger" disabled={!match || busy || offline} onClick={remove}>
                {busy ? "Deleting…" : "Delete account"}
              </Button>
            )}
          </>
        }
      >
        <form
          className="td-account-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            remove();
          }}
        >
          <p className="td-account-text">Type your account email to confirm. You are signed out on every device as soon as the account is deleted.</p>
          <div className="td-account-field">
            <label className="td-account-label" htmlFor="td-account-delete-email">
              Account email
            </label>
            <input ref={fieldRef} id="td-account-delete-email" className="td-field" type="email" autoComplete="off" spellCheck={false} value={typed} placeholder={email} onChange={(e) => setTyped(e.target.value)} />
            <p className="td-account-note">
              Type <b>{email}</b>
            </p>
          </div>
          {needsLogin ? <p className="td-account-text">For your safety, log in again before you delete your account. You come back to Account afterwards.</p> : null}
          <InlineError message={offline ? "You're offline. Connect to delete your account." : error ? `Couldn't delete the account: ${error}` : null} />
        </form>
      </FlowFrame>
    );

  const list = (title: string, icon: IconName, rows: DeleteAccountRow[], empty: string) => (
    <div className="td-account-list-group">
      <div className="td-account-list-head">
        <Icon name={icon} size={16} />
        <b>{title}</b>
      </div>
      {rows.length ? (
        <ul className="td-account-list">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="td-account-list-name">{r.name}</span>
              {r.meta ? <span className="td-account-list-meta">{r.meta}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="td-account-note">{loading ? "Checking…" : empty}</p>
      )}
    </div>
  );
  return (
    <FlowFrame
      open={open}
      onClose={onClose}
      title="Delete account"
      width={520}
      initialFocus={keepRef}
      footer={
        <>
          <Button ref={keepRef} variant="outline" onClick={() => onClose("cancel")}>
            Keep my account
          </Button>
          <Button ref={continueRef} variant="primary" disabled={blocked || loading || !!reviewError} onClick={() => setStep("confirm")}>
            Continue
          </Button>
        </>
      }
    >
      <p className="td-account-text">Deleting your account removes everything you own, for everyone who works in it.</p>
      {blocked ? (
        <div className="td-account-blockers" role="alert">
          <b>
            <Icon name="circle-alert" size={16} />
            You can't delete your account yet
          </b>
          <ul>
            {blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <InlineError message={reviewError ? `Couldn't check what you own: ${reviewError}` : null} />
      <div className="td-account-lists">
        {list(`${count(projects.length, "project")} you own`, "kanban", projects, "You own no projects.")}
        {list(`${count(groups.length, "project group")} you own`, "folders", groups, "You own no project groups.")}
        <div className="td-account-list-group">
          <div className="td-account-list-head">
            <Icon name="paperclip" size={16} />
            <b>{attachments ? `${count(attachments.count, "attachment")}${attachments.size ? ` · ${attachments.size}` : ""}` : "Attachments"}</b>
          </div>
          <p className="td-account-note">Every file on items in those projects, and your Inbox items.</p>
        </div>
      </div>
      {memberOf ? <p className="td-account-note">You also leave {count(memberOf, "project")} that other people own. Those projects stay, with your comments in them.</p> : null}
      {onExport ? (
        <div className="td-account-export">
          <div className="td-account-export-text">
            <b>Export first</b>
            <span>{exportState === "done" ? "Your export was downloaded." : "Download everything you own as one file before you delete it."}</span>
          </div>
          <Button variant="outline" icon={exportState === "done" ? "check" : "download"} disabled={exportState === "busy" || offline} onClick={onExport}>
            {exportState === "busy" ? "Preparing…" : exportState === "done" ? "Export again" : "Export my data"}
          </Button>
          <InlineError message={exportError ? `Couldn't prepare the export: ${exportError}` : null} className="td-account-wide" />
        </div>
      ) : null}
    </FlowFrame>
  );
}

/** The signed-out end state: the account and everything it owned are gone. On AuthShell. */
export function AccountDeletedPage({ email, onCreateAccount }: { email: string; onCreateAccount?: () => void }) {
  return (
    <AuthShell>
      <AuthState icon="circle-check" title="Your account is deleted">
        You're signed out on every device. <b>{email}</b> can no longer log in, and everything it owned is gone.
      </AuthState>
      {onCreateAccount ? (
        <div className="td-auth-stack">
          <Button variant="primary" size="lg" onClick={onCreateAccount}>
            Create a new account
          </Button>
        </div>
      ) : null}
    </AuthShell>
  );
}
