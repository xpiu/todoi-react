// SwatchGroup — pick-one-colour row (Background colours, Foreground presets). Every swatch carries an
// accessible label; the picked one shows the ring and a check. Contract: components/core/SwatchGroup.d.ts.
import type { CSSProperties } from "react";

import { Icon } from "./Icon";
import "./SwatchGroup.css";
import "./Tooltip.css";

export interface SwatchOption {
  /** The value reported by onChange; also the fill unless `swatch` is given */
  value: string;
  label: string;
  /** Tooltip when it should say more than the label, e.g. "Graphite (default)" */
  title?: string;
  /** CSS background when it differs from the value (a split gradient, a token) */
  swatch?: string;
  /** Check-mark colour; defaults to the fixed navy chrome ink */
  ink?: string;
  /** Per-option shape override; Minimal theme backgrounds carry "square" */
  shape?: "circle" | "square";
}

export interface SwatchGroupProps {
  options: ReadonlyArray<SwatchOption>;
  value?: string | null;
  onChange?: (value: string) => void;
  /** Diameter in px — 26 in dropdowns, 22 in settings rows @default 26 */
  size?: number;
  /** "square" renders 4:3 sheets with a small radius @default "circle" */
  shape?: "circle" | "square";
  /** Chips with a dot + the label instead of bare discs (near-identical shades) @default false */
  labeled?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  style?: CSSProperties;
  className?: string;
}

export function SwatchGroup({ options, value, onChange, size = 26, shape = "circle", labeled = false, disabled = false, style, className, ...rest }: SwatchGroupProps) {
  const radiusOf = (sh: "circle" | "square") => (sh === "circle" ? "var(--radius-full)" : `${Math.max(3, Math.round(size / 8))}px`);
  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      data-disabled={disabled ? "true" : undefined}
      data-labeled={labeled ? "true" : undefined}
      className={["td-swatches", className ?? ""].join(" ").trim()}
      style={style}
    >
      {options.map((o) => {
        const on = o.value === value;
        const pick = () => {
          if (!on) onChange?.(o.value);
        };
        if (labeled) {
          return (
            <button key={o.value} type="button" className="td-swatch-chip" title={o.title ?? o.label} aria-pressed={on} disabled={disabled} onClick={pick}>
              <span className="td-swatch-dot" aria-hidden style={{ background: o.swatch ?? o.value }} />
              <span>{o.label}</span>
              {on ? <Icon name="check" size={12} strokeWidth={3} className="td-swatch-check" /> : null}
            </button>
          );
        }
        const sh = o.shape ?? shape;
        return (
          <button
            key={o.value}
            type="button"
            className="td-swatch td-tip"
            data-tip={o.title ?? o.label}
            aria-label={o.label}
            aria-pressed={on}
            disabled={disabled}
            style={{ width: sh === "circle" ? size : Math.round((size * 4) / 3), height: size, "--td-swatch-r": radiusOf(sh), background: o.swatch ?? o.value } as CSSProperties}
            onClick={pick}
          >
            <Icon name="check" size={Math.round(size / 2)} strokeWidth={3} color={o.ink ?? "var(--chrome-selected-text)"} style={{ visibility: on ? "visible" : "hidden" }} />
          </button>
        );
      })}
    </div>
  );
}
