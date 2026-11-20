// Switch — a preference row's on/off control (role="switch"). Checkbox stays for list items. glyph="link" (Link lists
// with statuses): two woven chain links ride in the knob while on; off is the plain switch.
import type { ComponentPropsWithRef } from "react";

import "./Switch.css";

export interface SwitchProps extends Omit<ComponentPropsWithRef<"button">, "type" | "role" | "onChange" | "children" | "aria-checked"> {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** Optional inline label text (to the right of the track) */
  label?: string;
  /** Required when there is no visible label */
  "aria-label"?: string;
  /** "link": two woven chain links in the knob while on (Link lists with statuses). Same 32×18 track */
  glyph?: "link";
}

// The .td-switch-cut strokes, in the knob colour, break the link underneath at each crossing.
function LinkGlyph() {
  return (
    <svg className="td-switch-glyph" viewBox="0 0 12 12" aria-hidden>
      <g transform="rotate(-45 6 6)">
        <g className="td-switch-link-r">
          <rect x={4.5} y={3} width={6.5} height={4} rx={1.6} />
          <path className="td-switch-cut" d="M3.7 5h1.6" />
        </g>
        <g className="td-switch-link-l">
          <rect x={1} y={5} width={6.5} height={4} rx={1.6} />
          <path className="td-switch-cut" d="M6.7 7h1.6" />
        </g>
        <g className="td-switch-link-r">
          <path d="M6.5 7h2" />
        </g>
      </g>
    </svg>
  );
}

export function Switch({ checked, onChange, label, glyph, className, onClick, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      className={["td-switch", glyph === "link" ? "td-switch-link" : "", checked ? "td-switch-on" : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !rest.disabled) onChange?.(!checked);
      }}
    >
      <span className="td-switch-track" aria-hidden>
        <span className="td-switch-thumb">{glyph === "link" ? <LinkGlyph /> : null}</span>
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
