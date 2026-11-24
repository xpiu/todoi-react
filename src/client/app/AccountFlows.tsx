// The Account flows wired to the API: change the sign-in email (Primary email row + ChangeEmailDialog)
// and delete the account (Data › Delete account + DeleteAccountDialog). Each hook returns the Settings row
// that opens its dialog and the dialog itself, for SettingsScreen's Account registry. Spec: DESIGN.md › Account.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { authClient, forgetBrowserSession } from "../auth";
import { api, apiError, ApiError, errorMessage, unwrap } from "../data/api";
import { useAccountMutations, type Me } from "../data/account";
import { Button } from "../design/core/Button";
import { count } from "../design/core/text";
import { formatBytes } from "../design/overlay/Attachments";
import { ChangeEmailDialog, primaryEmailRow } from "../design/settings/ChangeEmailDialog";
import { DeleteAccountDialog } from "../design/settings/DeleteAccountDialog";
import type { SettingsRow } from "../design/settings/SettingsShell";
import { downloadAccountExport } from "./exportData";
import { useFeedback } from "./feedback";

type DeletionReview = { projects: Array<{ id: string; name: string; items: number }>; groups: Array<{ id: string; name: string; projects: number }>; attachments: { count: number; bytes: number }; memberOf: number; blockers: string[]; fresh: boolean };

/** Account › Data › Delete account: the row, and the two-step dialog. Success leaves for /account-deleted. */
export function useDeleteAccountFlow(email: string, online: boolean) {
  const [open, setOpen] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "busy" | "done">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  // Read fresh every time the dialog opens: projects and members change.
  const review = useQuery({ queryKey: ["me", "deletion"], queryFn: ({ signal }) => api.api.me.deletion.$get(undefined, { init: { signal } }).then((r) => unwrap<DeletionReview>(r)), enabled: open, staleTime: 0, gcTime: 0 });
  const r = review.data;
  const row: SettingsRow = {
    id: "deleteAccount",
    label: "Delete my account",
    hint: "Removes your profile, your project groups and every project only you work in. Projects you share need a new owner first",
    control: (
      <Button
        icon="trash-2"
        className="td-settings-danger"
        onClick={() => {
          setExportState("idle");
          setExportError(null);
          setError(null);
          setOpen(true);
        }}
      >
        Delete
      </Button>
    ),
  };
  const dialog = (
    <DeleteAccountDialog
      open={open}
      onClose={() => setOpen(false)}
      email={email}
      loading={review.isPending}
      reviewError={review.isError ? errorMessage(review.error) : null}
      projects={r?.projects.map((p) => ({ name: p.name, meta: count(p.items, "item") }))}
      groups={r?.groups.map((g) => ({ name: g.name, meta: count(g.projects, "project") }))}
      attachments={r ? { count: r.attachments.count, size: r.attachments.count ? formatBytes(r.attachments.bytes) : undefined } : undefined}
      memberOf={r?.memberOf}
      blockers={r?.blockers}
      needsLogin={stale || r?.fresh === false}
      onLogInAgain={() =>
        void authClient.signOut().finally(() => {
          forgetBrowserSession();
          window.location.assign(`/login?next=${encodeURIComponent("/account?s=data")}&email=${encodeURIComponent(email)}`);
        })
      }
      offline={!online}
      exportState={exportState}
      exportError={exportError}
      onExport={() => {
        setExportState("busy");
        setExportError(null);
        downloadAccountExport("json").then(
          () => setExportState("done"),
          (err: unknown) => {
            setExportState("idle");
            setExportError(errorMessage(err).replace(/\.$/, ""));
          },
        );
      }}
      busy={busy}
      error={error}
      onDelete={async () => {
        setBusy(true);
        setError(null);
        const res = await api.api.me.deletion.$post({ json: { email } }).catch((err: unknown) => err);
        if (res instanceof Response && res.ok) {
          // The server cleared this browser's session; the next page starts signed out.
          forgetBrowserSession();
          window.location.assign(`/account-deleted?email=${encodeURIComponent(email)}`);
          return;
        }
        const err = res instanceof Response ? await apiError(res) : res;
        setBusy(false);
        if (err instanceof ApiError && err.fields.session === "stale") setStale(true);
        else setError(errorMessage(err).replace(/\.$/, ""));
      }}
    />
  );
  return { row, dialog };
}

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
