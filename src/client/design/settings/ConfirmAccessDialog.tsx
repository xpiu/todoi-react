// ConfirmAccessDialog — sudo mode's confirm step ("Confirm it's you"), stacked over the Account flow that
// needs it: deleting the account, changing the sign-in email, adding or removing a passkey. The password,
// or a passkey when the account has one; once confirmed, the session isn't asked again for SUDO_HOURS.
// The host renders it inside the flow's dialog (the flow's `stacked` slot) so Base UI nests the two:
// Esc and × close this one only. App-side (decision Q6, 2026-11-25); built from the Account dialogs' parts.
// Spec: DESIGN.md › Account.
import { useRef, useState } from "react";

import { SUDO_HOURS } from "../../../shared/sudo";
import { PasswordField } from "../auth/PasswordField";
import { Button } from "../core/Button";
import type { DialogCloseReason } from "../core/Dialog";
import { InlineError } from "../core/InlineError";
import { FlowFrame } from "./accountFlow";

export interface ConfirmAccessDialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  /** What waits for the confirmation, as "To … , confirm it's you": "delete your account" */
  action: string;
  /** The account's address, for the browser's password manager */
  email?: string;
  onPassword?: (password: string) => void;
  /** Offers "Use a passkey" (the account has one and the browser can use it) */
  onPasskey?: () => void;
  /** Which check is running: "Checking…" or "Waiting for your device…" */
  busy?: "password" | "passkey" | null;
  /** The password was refused: under the field; what was typed stays */
  passwordError?: string | null;
  /** The passkey prompt ended without a confirmation */
  passkeyError?: string | null;
  /** Anything else: "Couldn't confirm: …" */
  error?: string | null;
  offline?: boolean;
  /** @default SUDO_HOURS (2) */
  hours?: number;
}

export function ConfirmAccessDialog({ open, onClose, action, email, onPassword, onPasskey, busy = null, passwordError, passkeyError, error, offline = false, hours = SUDO_HOURS }: ConfirmAccessDialogProps) {
  const [pw, setPw] = useState("");
  // A fresh field each time it opens (reset while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setPw("");
  }
  const fieldRef = useRef<HTMLInputElement>(null);
  const can = pw.length > 0 && !busy && !offline;
  const submit = () => {
    if (can) onPassword?.(pw);
  };
  return (
    <FlowFrame
      open={open}
      onClose={onClose}
      title="Confirm it's you"
      width={440}
      initialFocus={fieldRef}
      footer={
        <>
          <Button variant="outline" onClick={() => onClose("cancel")}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!can} onClick={submit}>
            {busy === "password" ? "Checking…" : "Confirm"}
          </Button>
        </>
      }
    >
      <form
        className="td-account-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        // Enter confirms: the visible button sits in the dialog's footer, outside the form.
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
          e.preventDefault();
          submit();
        }}
      >
        <p className="td-account-text">
          To {action}, enter your password. You won't be asked again on this device for {hours} hours.
        </p>
        {email ? <input type="email" autoComplete="username" value={email} readOnly hidden /> : null}
        <PasswordField label="Password" autoComplete="current-password" value={pw} onChange={setPw} error={passwordError} inputRef={fieldRef} disabled={busy === "password"} />
        <InlineError message={offline ? "You're offline. Connect to confirm it's you." : error ? `Couldn't confirm: ${error}` : null} />
      </form>
      {onPasskey ? (
        <div className="td-account-row">
          <div className="td-account-row-text">
            <b>Use a passkey instead</b>
            <span>{busy === "passkey" ? "Follow the steps your device shows." : "Your device asks for your fingerprint, face or screen lock."}</span>
          </div>
          <Button variant="outline" icon="key-round" disabled={!!busy || offline} onClick={onPasskey}>
            {busy === "passkey" ? "Waiting for your device…" : "Use a passkey"}
          </Button>
          <InlineError message={passkeyError ?? null} className="td-account-wide" />
        </div>
      ) : null}
    </FlowFrame>
  );
}
