// accountFlow — the shared parts of the Account dialogs (ChangeEmailDialog, DeleteAccountDialog, PasskeysDialog, ConfirmAccessDialog): the
// frame on the shared Dialog with the `td-account-dialog` class on its portaled popup, and the state
// block (glyph, one bold line, one or two quiet sentences). Styles: AccountDialogs.css. Spec: DESIGN.md › Account.
import type { ReactNode, RefObject } from "react";

import { Dialog, type DialogCloseReason } from "../core/Dialog";
import { Icon, type IconName } from "../core/Icon";
import "./AccountDialogs.css";

export interface FlowFrameProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  title: ReactNode;
  /** @default 480 */
  width?: number;
  footer?: ReactNode;
  footerLead?: ReactNode;
  /** The element focused on open (focus returns to the opener on close) */
  initialFocus?: RefObject<HTMLElement | null>;
  children?: ReactNode;
  /** A dialog stacked over this one (the host's ConfirmAccessDialog), rendered inside it so Base UI nests the two */
  stacked?: ReactNode;
}

export function FlowFrame({ open, onClose, title, width = 480, footer, footerLead, initialFocus, children, stacked }: FlowFrameProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} width={width} footer={footer} footerLead={footerLead} initialFocus={initialFocus} className="td-account-dialog">
      {children}
      {stacked}
    </Dialog>
  );
}

/** A state inside a dialog: "Check your inbox", "Email changed". */
export function FlowState({ icon, tone, title, children }: { icon: IconName; tone?: "success" | "danger"; title: string; children?: ReactNode }) {
  return (
    <div className="td-account-state" role="status">
      <span className="td-account-state-icon" data-tone={tone} aria-hidden>
        <Icon name={icon} size={20} />
      </span>
      <div>
        <b>{title}</b>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}
