// The Account flows wired to the API: change the sign-in email (Primary email row + ChangeEmailDialog).
// Each hook returns the Settings row that opens its dialog and the dialog itself, for SettingsScreen's
// Account registry. Spec: DESIGN.md › Account.
import { useState } from "react";

import { ApiError, errorMessage } from "../data/api";
import { useAccountMutations, type Me } from "../data/account";
import { ChangeEmailDialog, primaryEmailRow } from "../design/settings/ChangeEmailDialog";
import { useFeedback } from "./feedback";

/** Settings › Account › Primary email: the row, and the dialog it opens (form → sent → confirmed). */
export function useChangeEmailFlow(me: Me | undefined, fallbackEmail: string, online: boolean) {
  const am = useAccountMutations();
  const notify = useFeedback((s) => s.notify);
  const [open, setOpen] = useState(false);
  /** The address this dialog is waiting for: once the account has it, the dialog says "Email changed". */
  const [awaited, setAwaited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const email = me?.email ?? fallbackEmail;
  const pending = me?.pendingEmail ?? null;
  const confirmed = !!awaited && email.toLowerCase() === awaited.toLowerCase();
  const busy = am.requestEmailChange.isPending || am.resendEmailChange.isPending;
  const reset = () => {
    setError(null);
    setPasswordError(null);
    setResent(false);
  };
  const row = primaryEmailRow({
    email,
    pendingEmail: pending,
    verified: !!me?.emailVerified,
    onOpen: () => {
      reset();
      setAwaited(pending);
      setOpen(true);
    },
  });
  const dialog = (
    <ChangeEmailDialog
      open={open}
      onClose={() => setOpen(false)}
      currentEmail={email}
      pendingEmail={pending}
      stage={confirmed ? "confirmed" : pending ? "sent" : "form"}
      requirePassword
      busy={busy}
      error={error}
      passwordError={passwordError}
      offline={!online}
      resent={resent}
      onSend={({ email: next, password }) => {
        reset();
        am.requestEmailChange.mutate(
          { email: next, password: password ?? "", quiet: true },
          {
            onSuccess: (r) => setAwaited(r.pendingEmail),
            onError: (err) => {
              if (err instanceof ApiError && err.fields.password) setPasswordError(err.fields.password);
              else setError(errorMessage(err).replace(/\.$/, ""));
            },
          },
        );
      }}
      onResend={() => {
        reset();
        am.resendEmailChange.mutate({ quiet: true }, { onSuccess: () => setResent(true), onError: (err) => setError(errorMessage(err).replace(/\.$/, "")) });
      }}
      onCancelChange={() => {
        am.cancelEmailChange.mutate(
          { quiet: true },
          {
            onSuccess: () => {
              setOpen(false);
              setAwaited(null);
              notify({ message: "Email change cancelled", icon: "mail" });
            },
            onError: (err) => setError(errorMessage(err).replace(/\.$/, "")),
          },
        );
      }}
    />
  );
  return { row, dialog };
}
