// Switch — a preference row's on/off control (role="switch"). Checkbox stays for list items.
import type { CSSProperties } from "react";

import "./Switch.css";

export interface SwitchProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** Optional inline label text (to the right of the track) */
  label?: string;
  disabled?: boolean;
  /** Required when there is no visible label */
  "aria-label"?: string;
  style?: CSSProperties;
  className?: string;
}

export function Switch({ checked, onChange, label, disabled, style, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      className={["td-switch", checked ? "td-switch-on" : "", className ?? ""].filter(Boolean).join(" ")}
      style={style}
      onClick={() => {
        if (!disabled) onChange?.(!checked);
      }}
    >
      <span className="td-switch-track" aria-hidden>
        <span className="td-switch-thumb" />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
