// Settings › Notifications › Email notifications: one switch per kind (stored on the account), where the
// emails go, and the account emails that are always sent. Built from the settings row model and Switch,
// as Design drew it (components/settings/email-notifications.card.html, 2026-11-24). While the address
// isn't confirmed the switches are disabled and the group offers the confirmation link.
// Spec: DESIGN.md › Secondary pages › Notifications.
import { Button } from "../core/Button";
import { InlineError } from "../core/InlineError";
import { Switch } from "../core/Switch";
import type { SettingsGroup, SettingsRow } from "./SettingsShell";

export const EMAIL_KINDS = [
  { key: "emailMentions", label: "Mentions", hint: "When someone @mentions you in a comment" },
  { key: "emailAssignments", label: "Assignments", hint: "When an item is assigned to you" },
  { key: "emailComments", label: "Comments", hint: "New comments on items you watch or are assigned to" },
  { key: "emailInvites", label: "Invites", hint: "When someone invites you to a project" },
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number]["key"];

export type ConfirmationState = "idle" | "busy" | "sent" | { error: string };

export interface EmailNotificationsOptions {
  values: Record<EmailKind, boolean>;
  onChange: (key: EmailKind, on: boolean) => void;
  /** The address emails go to (the account's sign-in email) */
  email: string;
  /** A change of address waiting for its link */
  pendingEmail?: string | null;
  /** Whether the address is confirmed; until it is, nothing is emailed and the switches are disabled */
  confirmed: boolean;
  /** A switch whose save failed: it shows its saved state again and the reason under its row */
  failed?: { key: EmailKind; message: string } | null;
  /** "Account": Account › Sign-in methods */
  onOpenAccount?: () => void;
  /** "Send confirmation", while the address isn't confirmed */
  onSendConfirmation?: () => void;
  confirmation?: ConfirmationState;
}

export function emailNotificationsGroup({ values, onChange, email, pendingEmail, confirmed, failed, onOpenAccount, onSendConfirmation, confirmation = "idle" }: EmailNotificationsOptions): SettingsGroup {
  const rows: SettingsRow[] = EMAIL_KINDS.map(({ key, label, hint }) => ({
    id: key,
    label,
    hint: failed?.key === key ? undefined : hint,
    control: <Switch aria-label={`Email me about ${label.toLowerCase()}`} checked={confirmed && values[key]} disabled={!confirmed} onChange={(on) => onChange(key, on)} />,
    body: failed?.key === key ? <InlineError message={`Couldn't save: ${failed.message}. The switch is back where it was.`} /> : undefined,
  }));
  const sentHint = !confirmed
    ? confirmation === "sent"
      ? `Sent. Open the link in the email to ${email}`
      : typeof confirmation === "object"
        ? `Couldn't send the link: ${confirmation.error}`
        : "Confirm this address to get emails"
    : pendingEmail
      ? `Until you confirm ${pendingEmail}, emails still go to this address`
      : "Change the address in Account";
  rows.push({
    id: "emailTo",
    label: `Sent to ${email}`,
    hint: sentHint,
    control: confirmed ? (
      <Button icon="arrow-right" onClick={onOpenAccount}>
        Account
      </Button>
    ) : (
      <Button icon="mail-check" disabled={confirmation === "busy"} onClick={onSendConfirmation}>
        {confirmation === "busy" ? "Sending…" : confirmation === "sent" ? "Send it again" : "Send confirmation"}
      </Button>
    ),
  });
  rows.push({ id: "emailAlways", label: "Account emails", hint: "Password resets, email confirmations and invites you send are always sent" });
  return { id: "nt-email", title: "Email notifications", tone: confirmed ? undefined : "info", rows };
}
