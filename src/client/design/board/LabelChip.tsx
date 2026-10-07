// LabelChip — a label as a 40×8 bar (compact), a small pill (sm) or a 32px chip (expanded).
// Colours are the eight label tokens; ink is light on red / pink / blue, navy on the rest.
import type { CSSProperties } from "react";

import { LABEL_COLORS, type LabelColor } from "../../../shared/enums";
import "./LabelChip.css";

const LIGHT_INK: ReadonlySet<string> = new Set(["red", "pink", "blue"]);
const isPalette = (c: string): c is LabelColor => (LABEL_COLORS as ReadonlyArray<string>).includes(c);

export interface LabelChipProps {
  /** Palette name ("teal") or any CSS colour @default "teal" */
  color?: string;
  text?: string;
  /** 32px chip with 14px text (the overlay's labels row) */
  expanded?: boolean;
  /** "sm" = 20px pill with 11px text (rows, quick-add preview) */
  size?: "sm";
  style?: CSSProperties;
  className?: string;
}

export function LabelChip({ color = "teal", text, expanded, size, style, className }: LabelChipProps) {
  const palette = isPalette(color);
  const bg = palette ? `var(--label-${color})` : color;
  const ink = LIGHT_INK.has(color) ? "light" : "dark";
  const cls = ["td-label", className ?? ""].join(" ").trim();
  const base: CSSProperties = { ...(palette ? null : { background: bg }), ...style };
  // The bar has no text: name it by its colour so the label is not silent.
  if (!expanded && !text) return <span className={cls} data-color={palette ? color : undefined} data-form="bar" role="img" aria-label={palette ? `${color.charAt(0).toUpperCase()}${color.slice(1)} label` : "Label"} title={color} style={base} />;
  return (
    <span className={cls} data-color={palette ? color : undefined} data-ink={ink} data-form={size === "sm" ? "sm" : "chip"} style={base}>
      {text}
    </span>
  );
}
