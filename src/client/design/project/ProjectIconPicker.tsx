// ProjectIconPicker — the project's glyph + colour in one popover: a row of the eight label-colour
// swatches above a 6-wide grid of project glyphs. The trigger is the tile the sidebar and Projects page draw.
import type { CSSProperties } from "react";

import { LABEL_COLORS, type LabelColor } from "../../../shared/enums";
import { Icon, type IconName } from "../core/Icon";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "../core/Popover";
import "./ProjectIconPicker.css";

export const PROJECT_ICONS: ReadonlyArray<IconName> = ["kanban", "globe", "megaphone", "package", "wrench", "rocket", "star", "flag", "calendar", "book-open", "camera", "chart-line", "tent", "briefcase", "shopping-cart", "users", "code", "lightbulb"];
export const projectColorVar = (c: LabelColor | string | null | undefined) => (c ? `var(--label-${c})` : "var(--ink-600)");

export interface ProjectIconPickerProps {
  icon?: IconName | null;
  color?: LabelColor | null;
  onChange: (v: { icon: IconName; color: LabelColor }) => void;
  /** Tile size @default 32 */
  size?: number;
  iconSize?: number;
  label?: string;
  /** Text beside the glyph (the dialog's "Change" trigger) */
  caption?: string;
  placement?: PopoverPlacement;
  tier?: PopoverTier;
  disabled?: boolean;
  style?: CSSProperties;
}

export function ProjectIconPicker({ icon = "kanban", color = "blue", onChange, size = 32, iconSize, label = "Change icon and color", caption, placement = "bottom-start", tier = "detached", disabled, style }: ProjectIconPickerProps) {
  const pop = usePopover();
  const cur = { icon: icon ?? "kanban", color: color ?? "blue" };
  const glyph = <Icon name={cur.icon} size={iconSize ?? Math.round(size / 2)} color={projectColorVar(cur.color)} />;
  return (
    <Popover
      open={pop.open}
      onOpenChange={pop.setOpen}
      placement={placement}
      tier={tier}
      role="dialog"
      aria-label={label}
      minWidth={0}
      trigger={
        caption ? (
          <button type="button" className="td-pip-tile td-pip-captioned" style={{ height: size, ...style }} aria-label={label} title={label} disabled={disabled}>
            <span className="td-pip-glyph" style={{ width: size - 10, height: size - 10 }}>
              {glyph}
            </span>
            <span className="td-pip-caption">{caption}</span>
            <span className="td-pip-chev">
              <Icon name="chevron-down" size={14} />
            </span>
          </button>
        ) : (
          <button type="button" className="td-pip-tile" style={{ width: size, height: size, ...style }} aria-label={label} title={label} disabled={disabled}>
            {glyph}
          </button>
        )
      }
    >
      <div className="td-pip-panel">
        <div className="td-pip-colors" role="radiogroup" aria-label="Color">
          {LABEL_COLORS.map((c) => (
            <button key={c} type="button" role="radio" className="td-pip-swatch" style={{ background: `var(--label-${c})` }} aria-label={c} title={c} aria-checked={c === cur.color} onClick={() => onChange({ icon: cur.icon, color: c })} />
          ))}
        </div>
        <div className="td-pip-div" />
        <div className="td-pip-grid" role="radiogroup" aria-label="Icon">
          {PROJECT_ICONS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              className="td-pip-opt"
              aria-label={n}
              title={n}
              aria-checked={n === cur.icon}
              onClick={() => {
                onChange({ icon: n, color: cur.color });
                pop.close();
              }}
            >
              <Icon name={n} size={16} color={projectColorVar(cur.color)} />
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
}
