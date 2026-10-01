// SyncNotice — a persistent notice for a condition that holds right now (sync failed, offline, remote
// changes waiting). Toast is for undoable outcomes only; never put an error in a Toast. One at a time,
// most severe wins. Spec: DESIGN.md › States › SyncNotice.
import type { CSSProperties } from "react";

import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import "./SyncNotice.css";

export type NoticeTone = "danger" | "warn" | "info";

export interface SyncNoticeAction {
  label: string;
  onClick?: () => void;
  icon?: IconName;
  /** Disables the button and shows busyLabel while a retry runs */
  busy?: boolean;
  /** @default label — e.g. "Retrying…" */
  busyLabel?: string;
  disabled?: boolean;
}

export interface SyncNoticeProps {
  /** Tone colours the glyph only, never the border @default "danger" */
  tone?: NoticeTone;
  /** Glyph override */
  icon?: IconName;
  /** Bold, one clause: "Sync failed — GitHub didn't respond" */
  message: string;
  /** Quiet continuation: what is safe, what happens next, when it last worked */
  detail?: string;
  /** Primary: Retry / Reconnect / Resolve */
  action?: SyncNoticeAction;
  /** Quiet second action, usually "Details" */
  secondary?: SyncNoticeAction;
  /** "bottom" pins it to the viewport; "inline" leaves it in flow @default "bottom" */
  placement?: "bottom" | "inline";
  /** Renders the × — hides until the condition next changes */
  onDismiss?: () => void;
  /** @default "alert" for danger, "status" otherwise */
  role?: "alert" | "status";
  style?: CSSProperties;
  className?: string;
}

const TONE_ICON: Record<NoticeTone, IconName> = { danger: "cloud-off", warn: "circle-alert", info: "circle-help" };

export function SyncNotice({ tone = "danger", icon, message, detail, action, secondary, onDismiss, placement = "bottom", role, style, className }: SyncNoticeProps) {
  const busy = !!action?.busy;
  return (
    <div className={["td-notice", `td-notice-${tone}`, placement === "bottom" ? "td-notice-fixed" : "", className ?? ""].filter(Boolean).join(" ")} role={role ?? (tone === "danger" ? "alert" : "status")} style={style}>
      <span className="td-notice-icon">
        <Icon name={icon ?? TONE_ICON[tone]} size={16} />
      </span>
      <div className="td-notice-body">
        {message ? <span className="td-notice-msg">{message}</span> : null}
        {detail ? <span className="td-notice-detail">{detail}</span> : null}
      </div>
      <div className="td-notice-actions">
        {secondary ? (
          <Button variant="ghost" icon={secondary.icon} onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        ) : null}
        {action ? (
          <Button variant="subtle" icon={action.icon} disabled={busy || action.disabled} aria-busy={busy || undefined} onClick={action.onClick}>
            {busy ? (action.busyLabel ?? action.label) : action.label}
          </Button>
        ) : null}
        {onDismiss ? <IconButton name="x" label="Dismiss" size={28} onClick={onDismiss} /> : null}
      </div>
    </div>
  );
}
