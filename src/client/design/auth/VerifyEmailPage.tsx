// VerifyEmailPage — where the link in "Confirm your email" lands: confirmed, expired, or a link that
// doesn't work (used up by a newer one, cut short when copied). On AuthShell, one state card and one
// button. Spec: DESIGN.md › Sign-in, invites and guests.
import { EMAIL_LINK_HOURS } from "../../../shared/accountLinks";
import { Button } from "../core/Button";
import { AuthShell, AuthState } from "./AuthShell";

export type VerifyEmailStage = "confirmed" | "expired" | "invalid";

export interface VerifyEmailPageProps {
  stage: VerifyEmailStage;
  /** The confirmed address, when the page knows it (signed in) */
  email?: string | null;
  /** Hours the link works @default 24 */
  linkHours?: number;
  /** Confirmed: "Continue to todoi" */
  onContinue?: () => void;
  /** Expired or not working: "Open Account", where a new link is sent */
  onOpenAccount?: () => void;
}

export function VerifyEmailPage({ stage, email, linkHours = EMAIL_LINK_HOURS, onContinue, onOpenAccount }: VerifyEmailPageProps) {
  if (stage === "confirmed")
    return (
      <AuthShell>
        <AuthState icon="circle-check" tone="success" title="Email confirmed">
          {email ? (
            <>
              <b>{email}</b> is confirmed. Reset links and invites reach you there.
            </>
          ) : (
            "Your email is confirmed. Reset links and invites reach you there."
          )}
        </AuthState>
        <div className="td-auth-stack">
          <Button variant="primary" size="lg" onClick={onContinue}>
            Continue to todoi
          </Button>
        </div>
      </AuthShell>
    );
  return (
    <AuthShell>
      {stage === "expired" ? (
        <AuthState icon="clock" tone="danger" title="This link has expired">
          Links work for {linkHours} hours. Your email isn't confirmed yet. Send a new link from Account.
        </AuthState>
      ) : (
        <AuthState icon="circle-alert" tone="danger" title="This link doesn't work">
          It may be cut short, or a newer link replaced it. Send a new link from Account.
        </AuthState>
      )}
      <div className="td-auth-stack">
        <Button variant="primary" size="lg" onClick={onOpenAccount}>
          Open Account
        </Button>
      </div>
    </AuthShell>
  );
}
