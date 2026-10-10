// Switch — a preference row's on/off control (role="switch"). Checkbox stays for list items.
import type { ComponentPropsWithRef } from "react";

import "./Switch.css";

export interface SwitchProps extends Omit<ComponentPropsWithRef<"button">, "type" | "role" | "onChange" | "children" | "aria-checked"> {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** Optional inline label text (to the right of the track) */
  label?: string;
  /** Required when there is no visible label */
  "aria-label"?: string;
}

export function Switch({ checked, onChange, label, className, onClick, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      className={["td-switch", checked ? "td-switch-on" : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !rest.disabled) onChange?.(!checked);
      }}
    >
      <span className="td-switch-track" aria-hidden>
        <span className="td-switch-thumb" />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
