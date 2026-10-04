// Segmented — one-of-N picker for 2–4 short, equally likely options (Rounded / Minimal, Dark / Light).
import type { CSSProperties } from "react";

import { Icon, type IconName } from "./Icon";
import "./Segmented.css";

export interface SegmentedOption<T extends string = string> {
  id: T;
  label?: string;
  icon?: IconName;
  title?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value?: T;
  onChange?: (id: T) => void;
  /** "sm" = 24px segments, 12px type @default "md" */
  size?: "md" | "sm";
  /** Fills the container, segments share the width equally @default false */
  stretch?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  style?: CSSProperties;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, size = "md", stretch = false, disabled = false, style, className, ...rest }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      data-disabled={disabled ? "true" : undefined}
      className={["td-seg", size === "sm" ? "td-seg-sm" : "", stretch ? "td-seg-stretch" : "", className ?? ""].filter(Boolean).join(" ")}
      style={style}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="td-seg-btn"
          aria-pressed={o.id === value}
          aria-label={o.label ? undefined : o.title}
          disabled={disabled || o.disabled}
          title={o.title}
          onClick={() => {
            if (o.id !== value) onChange?.(o.id);
          }}
        >
          {o.icon ? <Icon name={o.icon} size={size === "sm" ? 13 : 14} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
