// InlineError — a quiet danger line next to the control that failed ("Couldn't save: …"), announced
// as an alert. Errors stay where the work is; the Toast explains only failures that have no such place.
import type { CSSProperties } from "react";

import { Icon } from "./Icon";
import "./InlineError.css";

export function InlineError({ message, className, style }: { message?: string | null; className?: string; style?: CSSProperties }) {
  if (!message) return null;
  return (
    <div className={["td-inline-error", className ?? ""].join(" ").trim()} role="alert" style={style}>
      <Icon name="circle-alert" size={14} className="td-inline-error-ico" />
      <span>{message}</span>
    </div>
  );
}
