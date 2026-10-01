// ProgressBar — slim rounded progress bar. Contract: components/core/ProgressBar.d.ts.
import type { CSSProperties } from "react";

import "./ProgressBar.css";

export interface ProgressBarProps {
  /** 0–100 */
  value?: number;
  /** Fill colour @default var(--ink-600) */
  color?: string;
  /** @default 8 */
  height?: number;
  "aria-label"?: string;
  style?: CSSProperties;
  className?: string;
}

export function ProgressBar({ value = 0, color, height = 8, style, className, ...rest }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={rest["aria-label"]}
      className={["td-progress", className ?? ""].join(" ").trim()}
      style={{ height, ...style }}
    >
      <div className="td-progress-fill" style={{ width: `${pct}%`, ...(color ? ({ "--td-progress-color": color } as CSSProperties) : null) }} />
    </div>
  );
}
