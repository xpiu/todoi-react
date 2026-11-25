// SignInPage — one card, email + password with "Log in", and "Log in with a passkey" under an "or" rule;
// `context` says why the person is here. With passkeys offered, the email field also takes the browser's
// passkey autofill (`autocomplete="username webauthn"`; the screen starts WebAuthn conditional mediation).
// (Provider buttons and magic links come with their backends.) Spec: DESIGN.md › Sign-in.
import { useState } from "react";

import { validEmail } from "../core/text";
import { Button } from "../core/Button";
import { AuthError, AuthLink, AuthShell } from "./AuthShell";

export interface SignInPageProps {
  context?: string;
  defaultEmail?: string;
  onSignIn: (v: { email: string; password: string }) => void;
  /** Offers "Log in with a passkey" (the browser's own prompt does the work) */
  onPasskey?: () => void;
  /** The passkey prompt is up: "Waiting for your device…" */
  passkeyBusy?: boolean;
  onForgotPassword?: (email: string) => void;
  onCreateAccount?: () => void;
  error?: string | null;
  busy?: boolean;
}

export function SignInPage({ context, defaultEmail = "", onSignIn, onPasskey, passkeyBusy = false, onForgotPassword, onCreateAccount, error, busy }: SignInPageProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [pw, setPw] = useState("");
  const validMail = validEmail(email);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validMail || !pw || busy) return;
    onSignIn({ email: email.trim(), password: pw });
  };
  return (
    <AuthShell>
      <h1 className="td-auth-title">Log in</h1>
      {context ? <p className="td-auth-sub">{context}</p> : null}
      <form className="td-auth-form" onSubmit={submit} noValidate>
        <div className="td-auth-field">
          <label className="td-auth-label" htmlFor="td-signin-email">
            Email
          </label>
          <input id="td-signin-email" className="td-field" type="email" autoComplete={onPasskey ? "username webauthn" : "email"} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus={!defaultEmail} />
        </div>
        <div className="td-auth-field">
          <div className="td-auth-label">
            <label htmlFor="td-signin-pw">Password</label>
            {onForgotPassword ? <AuthLink label="Forgot?" onClick={() => onForgotPassword(email.trim())} /> : null}
          </div>
          <input id="td-signin-pw" className="td-field" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoFocus={!!defaultEmail} />
        </div>
        <AuthError error={error} />
        <div className="td-auth-stack is-tight">
          <Button type="submit" variant="primary" size="lg" disabled={!validMail || !pw || busy}>
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </div>
      </form>
      {onPasskey ? (
        <>
          <div className="td-auth-or">or</div>
          <div className="td-auth-stack">
            <Button variant="outline" size="lg" icon="key-round" disabled={passkeyBusy || busy} onClick={onPasskey}>
              {passkeyBusy ? "Waiting for your device…" : "Log in with a passkey"}
            </Button>
          </div>
        </>
      ) : null}
      {onCreateAccount ? (
        <div className="td-auth-links is-center">
          New here? <AuthLink label="Create an account" onClick={onCreateAccount} />
        </div>
      ) : null}
    </AuthShell>
  );
}
