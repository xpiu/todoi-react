// EmptyState — one block for every "nothing to show" situation (DESIGN.md › States). No illustrations,
// no emoji. `surface="chrome"` on the canvas, `surface="card"` inside a list or section.
import type { CSSProperties, ReactNode } from "react";

import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import "./EmptyState.css";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  icon?: IconName;
  /** Mono kbd chip after the label, e.g. "X" or "shift N" */
  shortcut?: string;
  disabled?: boolean;
}

export interface EmptyStateProps {
  /** 22px glyph (18 when compact) in a dim colour */
  icon?: IconName;
  title?: string;
  hint?: string;
  /** Primary action: inverse Button on the canvas, subtle Button in a card */
  action?: EmptyStateAction;
  /** Quiet second action */
  secondary?: EmptyStateAction;
  /** @default "chrome" */
  surface?: "chrome" | "card";
  /** "danger" colours the glyph --danger for failed loads */
  tone?: "neutral" | "danger";
  /** Tighter padding for in-list use */
  compact?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  role?: string;
}

export function EmptyState({ icon, title, hint, action, secondary, surface = "chrome", tone = "neutral", compact = false, children, style, className, role }: EmptyStateProps) {
  const chrome = surface === "chrome";
  const cls = ["td-empty", chrome ? "td-empty-chrome" : "", tone === "danger" ? "td-empty-danger" : "", compact ? "td-empty-compact" : "", className ?? ""].filter(Boolean).join(" ");
  const btn = (a: EmptyStateAction | undefined, primary: boolean) =>
    a ? (
      <Button variant={chrome ? (primary ? "inverse" : "chrome-ghost") : primary ? "subtle" : "ghost"} icon={a.icon} onClick={a.onClick} disabled={a.disabled}>
        {a.label}
        {a.shortcut ? <kbd className="td-empty-kbd">{a.shortcut}</kbd> : null}
      </Button>
    ) : null;
  return (
    <div className={cls} style={style} role={role}>
      {icon ? (
        <span className="td-empty-icon">
          <Icon name={icon} size={compact ? 18 : 22} />
        </span>
      ) : null}
      {title ? <p className="td-empty-title">{title}</p> : null}
      {hint ? <p className="td-empty-hint">{hint}</p> : null}
      {children}
      {action || secondary ? (
        <div className="td-empty-actions">
          {btn(action, true)}
          {btn(secondary, false)}
        </div>
      ) : null}
    </div>
  );
}
