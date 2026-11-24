// ConfirmEmailChangePage — where the link in "Confirm your new email" lands, on AuthShell: confirmed,
// expired (also a change cancelled in the meantime), or already used. From Design's auth/TwoFactorPage.jsx
// (2026-11-24), which keeps it beside the log-in step the app doesn't have. Spec: DESIGN.md › Account.
import { EMAIL_LINK_HOURS } from "../../../shared/accountLinks";
import { Button } from "../core/Button";
import { AuthShell, AuthState } from "./AuthShell";

export type ConfirmEmailChangeStage = "confirmed" | "expired" | "used";

export interface ConfirmEmailChangePageProps {
  /** @default "confirmed" */
  stage?: ConfirmEmailChangeStage;
  /** The new address (confirmed) */
  email?: string | null;
  /** @default 24 */
  linkHours?: number;
  /** Confirmed: "Continue to Todoi" */
  onContinue?: () => void;
  /** Expired or used: "Open Account" */
  onOpenAccount?: () => void;
}

export function ConfirmEmailChangePage({ stage = "confirmed", email, linkHours = EMAIL_LINK_HOURS, onContinue, onOpenAccount }: ConfirmEmailChangePageProps) {
  return (
    <AuthShell>
      {stage === "expired" ? (
        <AuthState icon="clock" tone="danger" title="This link has expired">
          Links work for {linkHours} hours. Your email was not changed. Start again in Account.
        </AuthState>
      ) : stage === "used" ? (
        <AuthState icon="circle-alert" tone="danger" title="This link was already used">
          If you didn't change your email, check Account and change your password.
        </AuthState>
      ) : (
        <AuthState icon="circle-check" tone="success" title="Email changed">
          {email ? (
            <>
              You now log in with <b>{email}</b>.
            </>
          ) : (
            "You now log in with your new address."
          )}
        </AuthState>
      )}
      <div className="td-auth-stack">
        {stage === "confirmed" ? (
          <Button variant="primary" size="lg" onClick={onContinue}>
            Continue to Todoi
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={onOpenAccount}>
            Open Account
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
