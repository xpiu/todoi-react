// AuthShell — the canvas behind every page before a person is inside a project: chrome colour edge to
// edge, the wordmark in plain type, one white card centred, a quiet footer line. Spec: DESIGN.md › Sign-in.
import type { ComponentPropsWithRef, CSSProperties, ReactNode } from "react";

import { Icon, type IconName } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import "./AuthShell.css";

export function AuthShell({ brand = "Todoi", footer, children, width, style }: { brand?: string; footer?: ReactNode | null; children: ReactNode; width?: number; style?: CSSProperties }) {
  return (
    <div className="td-auth" style={style}>
      <div className="td-auth-mark">{brand}</div>
      <div className="td-auth-card" style={width ? { width } : undefined}>
        {children}
      </div>
      {footer === null ? null : (
        <div className="td-auth-foot">
          {footer ?? (
            <>
              <a href="https://todoi.app/privacy">Privacy</a>
              <a href="https://todoi.app/terms">Terms</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A state card body: glyph (tone), title, one sentence. */
export function AuthState({ icon, tone, title, children }: { icon: IconName; tone?: "danger" | "success"; title: string; children?: ReactNode }) {
  return (
    <div className="td-auth-state">
      <span className="td-auth-state-icon" data-tone={tone}>
        <Icon name={icon} size={20} />
      </span>
      <div>
        <h1 className="td-auth-title">{title}</h1>
        {children ? <p className="td-auth-sub">{children}</p> : null}
      </div>
    </div>
  );
}

/** A text-sized action under or beside a field. The pages hand it callbacks rather than URLs, so it is a
 *  real button that reads like a link. */
export const AuthLink = ({ label, onClick, ...rest }: { label: string; onClick?: () => void } & Pick<ComponentPropsWithRef<"button">, "aria-label" | "aria-controls">) => (
  <button type="button" className="td-auth-link" onClick={onClick} {...rest}>
    {label}
  </button>
);

export function AuthError({ error }: { error?: string | null }) {
  return <InlineError message={error} className="td-auth-error" />;
}
