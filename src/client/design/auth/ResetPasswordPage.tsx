// ResetPasswordPage — both ends of the reset flow: "request" → "sent", and the link's landing
// "new" → "done" or "expired". Spec: DESIGN.md › Sign-in.
import { useState } from "react";

import { Button } from "../core/Button";
import { Checkbox } from "../core/Checkbox";
import { AuthError, AuthLink, AuthShell, AuthState } from "./AuthShell";
import { PasswordField } from "./PasswordField";

export const RESET_LINK_MINUTES = 60;
export type ResetStage = "request" | "sent" | "new" | "done" | "expired";

export interface ResetPasswordPageProps {
  stage: ResetStage;
  email?: string;
  onSend: (email: string) => void;
  onSave?: (v: { password: string; signOutOthers: boolean }) => void;
  onBackToLogin?: () => void;
  onContinue?: () => void;
  onRequestAgain?: () => void;
  error?: string | null;
  busy?: boolean;
  minLength?: number;
}

export function ResetPasswordPage({ stage, email: emailProp = "", onSend, onSave, onBackToLogin, onContinue, onRequestAgain, error, busy, minLength = 10 }: ResetPasswordPageProps) {
  const [email, setEmail] = useState(emailProp);
  const [pw, setPw] = useState("");
  const [others, setOthers] = useState(true);
  const validMail = /^\S+@\S+\.\S+$/.test(email.trim());
  const back = onBackToLogin ? <AuthLink label="Back to log in" onClick={onBackToLogin} /> : null;
  const span = RESET_LINK_MINUTES >= 60 ? `${Math.round(RESET_LINK_MINUTES / 60)} hour${RESET_LINK_MINUTES >= 120 ? "s" : ""}` : `${RESET_LINK_MINUTES} minutes`;
  if (stage === "sent")
    return (
      <AuthShell>
        <AuthState icon="mail" title="Check your inbox">
          We sent a reset link to <b>{email || emailProp}</b>. It works once and expires in {span}.
        </AuthState>
        <div className="td-auth-stack">
          <Button variant="outline" onClick={() => onSend(email.trim() || emailProp)}>
            Send it again
          </Button>
        </div>
        <div className="td-auth-links">
          <AuthLink label="Use a different email" onClick={onRequestAgain} />
          {back}
        </div>
      </AuthShell>
    );
  if (stage === "expired")
    return (
      <AuthShell>
        <AuthState icon="clock" tone="danger" title="This reset link has expired">
          Links work once and stop working after {span}. Ask for a new one and use it right away.
        </AuthState>
        <div className="td-auth-stack">
          <Button variant="primary" size="lg" onClick={onRequestAgain}>
            Send a new link
          </Button>
        </div>
        {back ? <div className="td-auth-links is-center">{back}</div> : null}
      </AuthShell>
    );
  if (stage === "done")
    return (
      <AuthShell>
        <AuthState icon="circle-check" tone="success" title="Password updated">
          You're logged in on this device{others ? " and logged out everywhere else" : ""}.
        </AuthState>
        <div className="td-auth-stack">
          <Button variant="primary" size="lg" onClick={onContinue}>
            Continue to Todoi
          </Button>
        </div>
      </AuthShell>
    );
  if (stage === "new") {
    const canSave = pw.length >= minLength && !busy;
    return (
      <AuthShell>
        <h1 className="td-auth-title">Set a new password</h1>
        {emailProp ? (
          <p className="td-auth-sub">
            for <b>{emailProp}</b>
          </p>
        ) : null}
        <form
          className="td-auth-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave?.({ password: pw, signOutOthers: others });
          }}
        >
          <PasswordField label="New password" value={pw} onChange={setPw} minLength={minLength} error={error} autoFocus disabled={busy} />
          <div className="td-auth-check">
            <Checkbox checked={others} onChange={setOthers} label="Log out other devices" />
          </div>
          <div className="td-auth-stack">
            <Button type="submit" variant="primary" size="lg" disabled={!canSave}>
              {busy ? "Saving…" : "Save password and log in"}
            </Button>
          </div>
        </form>
        {back ? <div className="td-auth-links is-center">{back}</div> : null}
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <h1 className="td-auth-title">Reset your password</h1>
      <p className="td-auth-sub">Enter your email and we'll send a link to set a new one.</p>
      <form
        className="td-auth-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (validMail && !busy) onSend(email.trim());
        }}
      >
        <div className="td-auth-field">
          <label className="td-auth-label" htmlFor="td-reset-email">
            Email
          </label>
          <input id="td-reset-email" className="td-field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
        </div>
        <AuthError error={error} />
        <div className="td-auth-stack is-tight">
          <Button type="submit" variant="primary" size="lg" disabled={!validMail || busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </div>
      </form>
      {back ? <div className="td-auth-links is-center">{back}</div> : null}
    </AuthShell>
  );
}
