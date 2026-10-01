// Checkbox — a button with role="checkbox" (never nest it inside another button: make the row a
// div[role=button] instead). `recurring` holds the check for 650ms while the consumer reopens the
// item on its next due (DESIGN.md › Recurring item completion).
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Icon } from "./Icon";
import "./Checkbox.css";

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** square (blue, checklist rows) or circle (green, item complete toggle) @default "square" */
  shape?: "square" | "circle";
  /** The item repeats: hold the checked state for 650ms after checking */
  recurring?: boolean;
  /** Optional inline label text */
  label?: string;
  /** Required when there is no visible label */
  "aria-label"?: string;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
}

export const RECURRING_HOLD_MS = 650;

export function Checkbox({ checked, onChange, shape = "square", label, recurring, disabled, style, className, ...rest }: CheckboxProps) {
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const on = !!checked || flash;
  const boxCls = ["td-check-box", shape === "circle" ? "td-check-circle" : "", on ? "td-check-box-on" : ""].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      className={["td-check", className ?? ""].join(" ").trim()}
      style={style}
      onClick={() => {
        if (recurring && !checked) {
          setFlash(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setFlash(false), RECURRING_HOLD_MS);
        }
        onChange?.(!checked);
      }}
    >
      <span className={boxCls}>
        <Icon name="check" size={shape === "circle" ? 12 : 11} strokeWidth={3.5} className="td-check-ic" />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
