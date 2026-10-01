// Dialog — the one modal shell for forms and panels that are not the item overlay (New project,
// Project settings, confirmations), on Base UI Dialog / AlertDialog. Escape closes a Popover inside
// first (Base UI nests), then the dialog. Never hand-roll another backdrop. Spec: DESIGN.md › Dialog.
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useCallback, useId, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { PortalContainerContext } from "./portalContainer";
import "./Dialog.css";

export type DialogCloseReason = "escape" | "outside" | "close" | "cancel";

function dialogReason(reason: string | undefined): DialogCloseReason {
  if (reason === "escape-key") return "escape";
  if (reason === "outside-press") return "outside";
  return "close";
}

export interface DialogProps {
  open: boolean;
  /** Called with "escape" | "outside" | "close" */
  onClose: (reason: DialogCloseReason) => void;
  title?: ReactNode;
  /** Element beside the title (a badge, a crumb) */
  titleExtra?: ReactNode;
  /** Card width @default 480 */
  width?: number | string;
  /** Action buttons, right-aligned */
  footer?: ReactNode;
  /** Quiet 12px text at the footer's left ("Enter creates · Esc cancels") */
  footerLead?: ReactNode;
  children?: ReactNode;
  /** "alertdialog" for confirmations @default "dialog" */
  role?: "dialog" | "alertdialog";
  closeLabel?: string;
  "aria-label"?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  style?: CSSProperties;
  className?: string;
}

export function Dialog({ open, onClose, title, titleExtra, width, footer, footerLead, children, role = "dialog", closeLabel = "Close", initialFocus, style, className, ...rest }: DialogProps) {
  const id = useId();
  // Popovers opened inside the dialog portal into its popup (see portalContainer.ts).
  const [popupEl, setPopupEl] = useState<HTMLElement | null>(null);
  const handleOpenChange = useCallback(
    (next: boolean, details: { reason?: string }) => {
      if (!next) onClose(dialogReason(details.reason));
    },
    [onClose],
  );
  const Parts = role === "alertdialog" ? AlertDialog : BaseDialog;
  const body = (
    <>
      {title || onClose ? (
        <div className="td-dialog-head">
          <h2 className="td-dialog-title" id={id}>
            {title}
          </h2>
          {titleExtra ?? null}
          <IconButton name="x" label={closeLabel} size={28} iconSize={16} onClick={() => onClose("close")} />
        </div>
      ) : null}
      <div className="td-dialog-body">{children}</div>
      {footer ? (
        <div className="td-dialog-foot">
          {footerLead ? <span className="td-dialog-foot-lead">{footerLead}</span> : null}
          {footer}
        </div>
      ) : null}
    </>
  );
  const popupProps = {
    className: ["td-dialog", className ?? ""].join(" ").trim(),
    "aria-labelledby": title ? id : undefined,
    "aria-label": title ? undefined : rest["aria-label"],
    style: { ...(width != null ? { width } : null), ...style },
    initialFocus,
  };
  return (
    <Parts.Root open={open} onOpenChange={handleOpenChange}>
      <Parts.Portal>
        <Parts.Backdrop className="td-dialog-backdrop" />
        <Parts.Viewport className="td-dialog-viewport">
          <Parts.Popup {...popupProps} ref={setPopupEl}>
            <PortalContainerContext.Provider value={popupEl}>{body}</PortalContainerContext.Provider>
          </Parts.Popup>
        </Parts.Viewport>
      </Parts.Portal>
    </Parts.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  /** The question, as a sentence: "Revoke this token?" */
  title: ReactNode;
  /** One paragraph: what happens, then what is safe */
  body?: ReactNode;
  /** Extra content under the body (a choice list, a name-to-type field). Keep it one screen. */
  children?: ReactNode;
  /** Verb first, names the outcome: "Revoke", "Delete project" @default "Confirm" */
  confirmLabel?: string;
  /** @default "Cancel" */
  cancelLabel?: string;
  /** Destructive: red confirm button, focus starts on Cancel */
  danger?: boolean;
  /** Both buttons disabled while the action runs; Confirm reads busyLabel */
  busy?: boolean;
  busyLabel?: string;
  onConfirm?: () => void;
  /** Called with "cancel" | "escape" | "outside" | "close" */
  onClose: (reason: DialogCloseReason) => void;
  /** @default 440 */
  width?: number | string;
  footerLead?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/** The one modal confirm step: only for actions a toast cannot undo or that leave the current context. */
export function ConfirmDialog({ open, title, body, children, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, busy, busyLabel, onConfirm, onClose, width = 440, footerLead, style, className }: ConfirmDialogProps) {
  const confirm = () => {
    if (!busy) onConfirm?.();
  };
  return (
    <Dialog
      open={open}
      title={title}
      role="alertdialog"
      width={width}
      onClose={onClose}
      style={style}
      className={className}
      footerLead={footerLead}
      closeLabel={cancelLabel}
      footer={
        <>
          <Button autoFocus={!!danger} variant="outline" onClick={() => onClose("cancel")} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button autoFocus={!danger} variant={danger ? "danger" : "primary"} onClick={confirm} disabled={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {body ? <p className="td-confirm-body">{body}</p> : null}
      {children ?? null}
    </Dialog>
  );
}
