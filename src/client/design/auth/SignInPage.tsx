// SignInPage — one card, email + password with "Log in"; `context` says why the person is here.
// (Provider buttons and magic links come with their backends.) Spec: DESIGN.md › Sign-in.
import { useState } from "react";

import { Button } from "../core/Button";
import { AuthError, AuthLink, AuthShell } from "./AuthShell";

export interface SignInPageProps {
  context?: string;
  defaultEmail?: string;
  onSignIn: (v: { email: string; password: string }) => void;
  onForgotPassword?: (email: string) => void;
  onCreateAccount?: () => void;
  error?: string | null;
  busy?: boolean;
}

export function SignInPage({ context, defaultEmail = "", onSignIn, onForgotPassword, onCreateAccount, error, busy }: SignInPageProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [pw, setPw] = useState("");
  const validMail = /^\S+@\S+\.\S+$/.test(email.trim());
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
          <input id="td-signin-email" className="td-field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus={!defaultEmail} />
        </div>
        <div className="td-auth-field">
          <div className="td-auth-label">
            <label htmlFor="td-signin-pw">Password</label>
            {onForgotPassword ? <AuthLink label="Forgot?" onClick={() => onForgotPassword(email.trim())} /> : null}
          </div>
          <input id="td-signin-pw" className="td-field" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus={!!defaultEmail} />
        </div>
        <AuthError error={error} />
        <div className="td-auth-stack is-tight">
          <Button type="submit" variant="primary" size="lg" disabled={!validMail || !pw || busy}>
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </div>
      </form>
      {onCreateAccount ? (
        <div className="td-auth-links is-center">
          New here? <AuthLink label="Create an account" onClick={onCreateAccount} />
        </div>
      ) : null}
    </AuthShell>
  );
}
