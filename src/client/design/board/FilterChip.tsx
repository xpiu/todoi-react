// FilterChip — a filter toggle on the chrome canvas: selected is the white pill with ×, unselected
// the translucent chrome fill. Active filters always render as chips so a view never silently looks empty.
import type { CSSProperties } from "react";

import { Icon, type IconName } from "../core/Icon";
import "./FilterChip.css";

export interface FilterChipProps {
  value: string;
  /** Faint prefix, e.g. "label" renders "label: bug" */
  category?: string;
  /** Swatch dot, e.g. "var(--label-red)" */
  color?: string;
  /** Glyph instead of a dot, e.g. "clock" for Overdue */
  icon?: IconName;
  /** @default true */
  selected?: boolean;
  onClick?: () => void;
  /** Fires on click when selected (falls back to onClick) */
  onRemove?: () => void;
  style?: CSSProperties;
  className?: string;
}

export function FilterChip({ value, category, color, icon, selected = true, onClick, onRemove, style, className }: FilterChipProps) {
  const act = selected ? (onRemove ?? onClick) : (onClick ?? onRemove);
  return (
    <button type="button" className={["td-fchip", selected ? "td-fchip-on" : "td-fchip-off", className ?? ""].filter(Boolean).join(" ")} aria-pressed={selected} title={selected ? "Remove filter" : "Add filter"} onClick={act} style={style}>
      {color ? <span className="td-fchip-dot" style={{ background: color }} /> : icon ? <Icon name={icon} size={14} /> : null}
      {category ? <span className="td-fchip-cat">{category}:</span> : null}
      {value}
      {selected ? (
        <span className="td-fchip-x" aria-hidden>
          <Icon name="x" size={12} />
        </span>
      ) : null}
    </button>
  );
}
