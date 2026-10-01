// AuthShell — the canvas behind every page before a person is inside a project: chrome colour edge to
// edge, the wordmark in plain type, one white card centred, a quiet footer line. Spec: DESIGN.md › Sign-in.
import type { CSSProperties, ReactNode } from "react";

import { Icon, type IconName } from "../core/Icon";
import "./AuthShell.css";

export function AuthShell({ brand = "Todoi", footer, children, width, style }: { brand?: string; footer?: ReactNode | null; children: ReactNode; width?: number; style?: CSSProperties }) {
  return (
    <div className="td-auth" style={style}>
      <div className="td-auth-mark" aria-label={brand}>
        {brand}
      </div>
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

export const AuthLink = ({ label, onClick }: { label: string; onClick?: () => void }) => (
  <a
    href="#"
    onClick={(e) => {
      e.preventDefault();
      onClick?.();
    }}
  >
    {label}
  </a>
);

export function AuthError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div className="td-auth-error" role="alert">
      <Icon name="circle-alert" size={14} className="td-auth-error-ico" />
      {error}
    </div>
  );
}
