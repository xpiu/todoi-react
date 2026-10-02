// Toast — bottom-left status toast for confirmed outcomes ("Moved … to Done", with Undo) and the fallback
// explanation of a failed request that has no form to show it in. Spec: DESIGN.md › Toasts.
// role="status" so screen readers announce it; auto-dismisses after ~5s, hover pauses. One at a time.
import { useEffect, useRef, type CSSProperties } from "react";

import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import "./Toast.css";

export interface ToastProps {
  message: string;
  /** Optional leading glyph */
  icon?: IconName;
  /** Action button text, e.g. "Undo" */
  actionLabel?: string;
  onAction?: () => void;
  /** Mono kbd chip after the action label, e.g. "⌘ Z" */
  shortcutHint?: string;
  /** Quiet 12px secondary text after the message, e.g. "4 more" on an undo confirmation */
  meta?: string;
  /** Renders the dismiss × and enables auto-dismiss */
  onDismiss?: () => void;
  /** ms before auto-dismiss; hover pauses; 0 disables @default 5000 */
  duration?: number;
  /** @default true — role="status" (polite live region) */
  live?: boolean;
  style?: CSSProperties;
}

export const TOAST_DURATION_MS = 5000;

export function Toast({ message, icon, actionLabel, onAction, shortcutHint, meta, onDismiss, duration = TOAST_DURATION_MS, live = true, style }: ToastProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const arm = () => {
    clear();
    if (duration && onDismiss) timer.current = setTimeout(onDismiss, duration);
  };
  useEffect(() => {
    arm();
    return clear;
    // Re-arm when the message changes (a new outcome replaces the toast in place).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, duration]);
  return (
    <div className="td-toast" role={live ? "status" : undefined} onMouseEnter={clear} onMouseLeave={arm} style={style}>
      {icon ? <Icon name={icon} size={16} className="td-toast-icon" /> : null}
      <span className="td-toast-msg">{message}</span>
      {meta ? <span className="td-toast-meta">{meta}</span> : null}
      {actionLabel ? (
        <button type="button" className="td-toast-act" onClick={onAction}>
          {actionLabel}
          {shortcutHint ? <span className="td-toast-kbd">{shortcutHint}</span> : null}
        </button>
      ) : null}
      {onDismiss ? <IconButton name="x" label="Dismiss" variant="chrome" size={28} onClick={onDismiss} /> : null}
    </div>
  );
}
