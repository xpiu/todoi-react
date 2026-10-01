// SignUpPage — "Create an account": Name · Email · Password and a primary Create account; the legal
// line under the button, "Log in" under the card. An invite locks the address it was sent to.
import { useState } from "react";

import { Button } from "../core/Button";
import { AuthLink, AuthShell } from "./AuthShell";
import { PasswordField } from "./PasswordField";

export interface SignUpPageProps {
  context?: string;
  defaultName?: string;
  defaultEmail?: string;
  lockEmail?: boolean;
  onSignUp: (v: { name: string; email: string; password: string }) => void;
  onLogin?: () => void;
  error?: string | null;
  busy?: boolean;
  minLength?: number;
}

export function SignUpPage({ context, defaultName = "", defaultEmail = "", lockEmail = false, onSignUp, onLogin, error, busy, minLength = 10 }: SignUpPageProps) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [pw, setPw] = useState("");
  const validMail = /^\S+@\S+\.\S+$/.test(email.trim());
  const can = name.trim().length > 0 && validMail && pw.length >= minLength && !busy;
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (can) onSignUp({ name: name.trim(), email: email.trim(), password: pw });
  };
  return (
    <AuthShell>
      <h1 className="td-auth-title">Create an account</h1>
      {context ? <p className="td-auth-sub">{context}</p> : null}
      <form className="td-auth-form" onSubmit={submit} noValidate>
        <div className="td-auth-field">
          <label className="td-auth-label" htmlFor="td-signup-name">
            Name
          </label>
          <input id="td-signup-name" className="td-field" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="How your team sees you" autoFocus={!defaultName} disabled={busy} />
        </div>
        <div className="td-auth-field">
          <label className="td-auth-label" htmlFor="td-signup-email">
            Email
          </label>
          <input id="td-signup-email" className="td-field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" readOnly={lockEmail} aria-readonly={lockEmail || undefined} disabled={busy} />
        </div>
        <PasswordField value={pw} onChange={setPw} minLength={minLength} error={error} disabled={busy} />
        <div className="td-auth-stack is-tight">
          <Button type="submit" variant="primary" size="lg" disabled={!can}>
            {busy ? "Creating your account…" : "Create account"}
          </Button>
        </div>
        <p className="td-auth-sub is-legal">
          By creating an account you agree to the <a href="https://todoi.app/terms">Terms</a> and <a href="https://todoi.app/privacy">Privacy policy</a>.
        </p>
      </form>
      {onLogin ? (
        <div className="td-auth-links is-center">
          Already have an account? <AuthLink label="Log in" onClick={onLogin} />
        </div>
      ) : null}
    </AuthShell>
  );
}
