// ChangeEmailDialog — change the primary (sign-in) email in three stages on the shared Dialog: "form"
// (the new address and the current password) → "sent" (check your inbox; the old address keeps working)
// → "confirmed" (the link was opened). While a change waits, Settings › Account shows it on the Primary
// email row (`primaryEmailRow`) and Review reopens this dialog on "sent". The link lands on
// ConfirmEmailChangePage. From Design's settings/ChangeEmailDialog (2026-11-24). Spec: DESIGN.md › Account.
import { useEffect, useRef, useState } from "react";

import { EMAIL_LINK_HOURS } from "../../../shared/accountLinks";
import { PasswordField } from "../auth/PasswordField";
import { Button } from "../core/Button";
import type { DialogCloseReason } from "../core/Dialog";
import { InlineError } from "../core/InlineError";
import { validEmail } from "../core/text";
import { FlowFrame, FlowState } from "./accountFlow";
import type { SettingsRow } from "./SettingsShell";

export type ChangeEmailStage = "form" | "sent" | "confirmed";

export interface ChangeEmailDialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  /** The address the account logs in with now (after "confirmed": the new one) */
  currentEmail: string;
  /** The address waiting for confirmation; with no `stage` the dialog opens on "sent" */
  pendingEmail?: string | null;
  /** @default "sent" while pendingEmail is set, else "form" */
  stage?: ChangeEmailStage;
  /** Send the confirmation link; the host sets pendingEmail once the server accepted it */
  onSend?: (value: { email: string; password?: string }) => void;
  onResend?: () => void;
  /** Drop the pending change; the host closes the dialog and raises a toast ("Email change cancelled") */
  onCancelChange?: () => void;
  /** A request is running: "Sending…" */
  busy?: boolean;
  /** The server's reason, shown as "Couldn't send the link: …"; nothing typed is cleared */
  error?: string | null;
  /** The server refused the current password: shown under that field */
  passwordError?: string | null;
  /** No connection: sending is disabled and the line says why */
  offline?: boolean;
  /** Ask for the current password before sending @default false */
  requirePassword?: boolean;
  /** "Sent again." beside the buttons */
  resent?: boolean;
  /** Hours the link works @default 24 */
  linkHours?: number;
}

export function ChangeEmailDialog({ open, onClose, currentEmail, pendingEmail, stage: stageProp, onSend, onResend, onCancelChange, busy = false, error, passwordError, offline = false, requirePassword = false, resent = false, linkHours = EMAIL_LINK_HOURS }: ChangeEmailDialogProps) {
  const stage = stageProp ?? (pendingEmail ? "sent" : "form");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [touched, setTouched] = useState(false);
  // A fresh form each time the dialog opens (reset while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setEmail("");
      setPw("");
      setTouched(false);
    }
  }
  const emailRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // Focus follows the stage: the field on the form, Done once there is nothing to type.
  useEffect(() => {
    if (open && stage !== "form") doneRef.current?.focus();
  }, [open, stage]);
  const typed = email.trim();
  const same = !!typed && typed.toLowerCase() === currentEmail.toLowerCase();
  const local = !touched ? null : !typed ? "Enter the new email address." : same ? "That's already your email." : !validEmail(typed) ? "Enter a full email address, like name@company.com." : null;
  const can = validEmail(typed) && !same && (!requirePassword || pw.length > 0) && !busy && !offline;
  const send = () => {
    setTouched(true);
    if (can) onSend?.({ email: typed, password: requirePassword ? pw : undefined });
  };
  const done = (
    <Button ref={doneRef} variant="primary" onClick={() => onClose("close")}>
      Done
    </Button>
  );

  if (stage === "confirmed")
    return (
      <FlowFrame open={open} onClose={onClose} title="Change email" footer={done} initialFocus={doneRef}>
        <FlowState icon="circle-check" tone="success" title="Email changed">
          You now sign in with <b>{currentEmail}</b>.
        </FlowState>
      </FlowFrame>
    );
  if (stage === "sent")
    return (
      <FlowFrame open={open} onClose={onClose} title="Change email" footer={done} initialFocus={doneRef}>
        <FlowState icon="mail" title="Check your inbox">
          We sent a link to <b>{pendingEmail}</b>. Open it within {linkHours} hours to confirm. Until then you sign in with <b>{currentEmail}</b>.
        </FlowState>
        <div className="td-account-actions">
          <Button variant="outline" disabled={busy || offline} onClick={onResend}>
            {busy ? "Sending…" : "Send it again"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCancelChange}>
            Cancel the change
          </Button>
          {resent ? (
            <span className="td-account-note" role="status">
              Sent again.
            </span>
          ) : null}
          <InlineError className="td-account-wide" message={offline ? "You're offline. Connect to send the link again." : error ? `Couldn't send the link: ${error}` : null} />
        </div>
      </FlowFrame>
    );
  return (
    <FlowFrame
      open={open}
      onClose={onClose}
      title="Change email"
      initialFocus={emailRef}
      footer={
        <>
          <Button variant="outline" onClick={() => onClose("cancel")}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || offline} onClick={send}>
            {busy ? "Sending…" : "Send confirmation link"}
          </Button>
        </>
      }
    >
      <form
        className="td-account-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        // Enter in either field sends: the visible button sits in the dialog's footer, outside the form.
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
          e.preventDefault();
          send();
        }}
      >
        <p className="td-account-text">
          Your sign-in email is <b>{currentEmail}</b>. We'll send a link to the new address. Nothing changes until you open it.
        </p>
        <div className="td-account-field">
          <label className="td-account-label" htmlFor="td-account-new-email">
            New email
          </label>
          <input ref={emailRef} id="td-account-new-email" className="td-field" type="email" autoComplete="email" value={email} placeholder="name@company.com" aria-invalid={local ? true : undefined} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} />
          <InlineError message={local} />
        </div>
        {requirePassword ? <PasswordField label="Current password" autoComplete="current-password" value={pw} onChange={setPw} hint="So nobody else can change it" error={passwordError} /> : null}
        <InlineError message={offline ? "You're offline. Connect to change your email." : error ? `Couldn't send the link: ${error}` : null} />
      </form>
    </FlowFrame>
  );
}

/** Settings › Account › Primary email: the address and whether it is confirmed, or the change waiting for its link. */
export function primaryEmailRow({ email, pendingEmail, verified, onOpen }: { email: string; pendingEmail?: string | null; verified: boolean; onOpen: () => void }): SettingsRow {
  return {
    id: "primaryEmail",
    label: "Primary email",
    hint: pendingEmail ? `${email} · Waiting for you to confirm ${pendingEmail}` : `${email} · ${verified ? "Verified" : "Not confirmed yet"}`,
    keywords: ["change email", "address"],
    control: (
      <Button icon="mail" onClick={onOpen}>
        {pendingEmail ? "Review" : "Change email"}
      </Button>
    ),
  };
}
