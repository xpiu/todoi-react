// AuthShell — the canvas behind every page before a person is inside a project: chrome colour edge to
// edge, the wordmark in plain type, one white card centred, a quiet footer line. Spec: DESIGN.md › Sign-in.
import { useId, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from "react";

import { unavailableMessage, type SocialProvider, type SocialProviderId } from "../../../shared/socialSignIn";
import { Button } from "../core/Button";
import { Icon, type IconName } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import "./AuthShell.css";

export function AuthShell({ brand = "todoi", footer, children, width, style }: { brand?: string; footer?: ReactNode | null; children: ReactNode; width?: number; style?: CSSProperties }) {
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
              <a href="https://todoi.com/privacy">Privacy</a>
              <a href="https://todoi.com/terms">Terms</a>
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

/**
 * "Continue with GitHub" / "Continue with Google": one 40px outline button per provider, text only (no brand
 * marks). A provider that isn't available keeps its button, disabled, with a warning dot and "<Name> login
 * temporarily unavailable" under it. For now that is both of them: we are disabling these login features until
 * our human lead developer finds enough time to guide us through the slow GUI processes of these social login
 * providers (shared/socialSignIn.ts).
 */
export function AuthProviders({ providers, onPick, disabled }: { providers: readonly SocialProvider[]; onPick?: (id: SocialProviderId) => void; disabled?: boolean }) {
  const id = useId();
  return providers.map((p) => (
    <div key={p.id} className="td-auth-provider">
      <Button variant="outline" size="lg" disabled={disabled || !p.available || !onPick} aria-describedby={p.available ? undefined : `${id}-${p.id}`} onClick={() => onPick?.(p.id)}>
        Continue with {p.name}
      </Button>
      {p.available ? null : (
        <p id={`${id}-${p.id}`} className="td-auth-provider-note">
          <span className="td-auth-provider-dot" aria-hidden />
          {unavailableMessage(p)}
        </p>
      )}
    </div>
  ));
}
