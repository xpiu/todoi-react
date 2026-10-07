// PasswordField — the one password input for the auth cards: label row with Show / Hide, the 36px
// field, one quiet requirement line that turns into the red error line.
import { useId, useState, type RefObject } from "react";

export interface PasswordFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
  minLength?: number;
  error?: string | null;
  autoFocus?: boolean;
  /** The input, for a host Dialog's initialFocus */
  inputRef?: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}

export function PasswordField({ id, label = "Password", value, onChange, autoComplete = "new-password", hint, minLength, error, autoFocus, inputRef, disabled }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const gen = useId();
  const uid = id ?? `td-pw-${gen.replace(/:/g, "")}`;
  const ok = minLength ? value.length >= minLength : false;
  const line = error ?? (minLength && !hint ? `At least ${minLength} characters` : hint);
  return (
    <div className="td-auth-field">
      <label className="td-auth-label" htmlFor={uid}>
        {label}
        <span className="td-auth-label-extra">
          <a
            href="#"
            role="button"
            aria-pressed={show}
            aria-controls={uid}
            onClick={(e) => {
              e.preventDefault();
              setShow((s) => !s);
            }}
          >
            {show ? "Hide" : "Show"}
          </a>
        </span>
      </label>
      <input ref={inputRef} id={uid} className="td-field" type={show ? "text" : "password"} autoComplete={autoComplete} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} aria-invalid={!!error || undefined} aria-describedby={line ? `${uid}-hint` : undefined} />
      {line ? (
        <p id={`${uid}-hint`} className="td-pwf-hint" data-ok={!error && ok ? "true" : undefined} data-error={error ? "true" : undefined} role={error ? "alert" : undefined}>
          {line}
        </p>
      ) : null}
    </div>
  );
}
