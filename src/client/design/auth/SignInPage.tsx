// SignInPage — one card, email + password with "Log in", then under an "or" rule "Log in with a passkey" and
// the provider buttons (Continue with GitHub · Google; AuthProviders, unavailable for now);
// `context` says why the person is here. With passkeys offered, the email field also takes the browser's
// passkey autofill (`autocomplete="username webauthn"`; the screen starts WebAuthn conditional mediation).
// (Magic links come with their backend.) Spec: DESIGN.md › Sign-in.
import { useState } from "react";

import type { SocialProvider, SocialProviderId } from "../../../shared/socialSignIn";

import { validEmail } from "../core/text";
import { Button } from "../core/Button";
import { AuthError, AuthLink, AuthProviders, AuthShell } from "./AuthShell";

export interface SignInPageProps {
  context?: string;
  defaultEmail?: string;
  onSignIn: (v: { email: string; password: string }) => void;
  /** Offers "Log in with a passkey" (the browser's own prompt does the work) */
  onPasskey?: () => void;
  /** The passkey prompt is up: "Waiting for your device…" */
  passkeyBusy?: boolean;
  /** Social sign-in buttons, after the passkey; an unavailable provider shows disabled with why */
  providers?: readonly SocialProvider[];
  onProvider?: (id: SocialProviderId) => void;
  onForgotPassword?: (email: string) => void;
  onCreateAccount?: () => void;
  error?: string | null;
  busy?: boolean;
}

export function SignInPage({ context, defaultEmail = "", onSignIn, onPasskey, passkeyBusy = false, providers = [], onProvider, onForgotPassword, onCreateAccount, error, busy }: SignInPageProps) {
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
          <label className="td-auth-label" htmlFor="td-signin-pw">
            Password
          </label>
          <input id="td-signin-pw" className="td-field" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoFocus={!!defaultEmail} />
          {onForgotPassword ? <AuthLink label="Forgot password?" onClick={() => onForgotPassword(email.trim())} /> : null}
        </div>
        <AuthError error={error} />
        <div className="td-auth-stack is-tight">
          <Button type="submit" variant="primary" size="lg" disabled={!validMail || !pw || busy}>
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </div>
      </form>
      {onPasskey || providers.length ? (
        <>
          <div className="td-auth-or">or</div>
          <div className="td-auth-stack">
            {onPasskey ? (
              <Button variant="outline" size="lg" icon="key-round" disabled={passkeyBusy || busy} onClick={onPasskey}>
                {passkeyBusy ? "Waiting for your device…" : "Log in with a passkey"}
              </Button>
            ) : null}
            <AuthProviders providers={providers} onPick={onProvider} disabled={passkeyBusy || busy} />
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
