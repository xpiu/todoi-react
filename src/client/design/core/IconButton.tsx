// IconButton — square icon-only button (32px default). `label` is the accessible name; `tooltip` the
// 2–4 word hint through the shared Tooltip rules. Contract: components/core/IconButton.d.ts.
import type { ComponentPropsWithRef } from "react";

import { Icon, type IconName } from "./Icon";
import { tipProps, type TooltipSide } from "./Tooltip";
import "./IconButton.css";

export interface IconButtonProps extends Omit<ComponentPropsWithRef<"button">, "type" | "name"> {
  /** Icon name */
  name: IconName;
  /** Accessible label (required — there is no visible text) */
  label: string;
  /** ghost = ink glyph; chrome = white glyph on the app frame and dark covers. @default "ghost" */
  variant?: "ghost" | "chrome";
  /** Button square size in px @default 32 */
  size?: number;
  /** Icon size override; defaults to size / 2 + 4 */
  iconSize?: number;
  /** Short hover tooltip (2–4 words) */
  tooltip?: string;
  /** @default "bottom" */
  tooltipSide?: TooltipSide;
  /** Fully round (top-bar avatar area) */
  round?: boolean;
}

export function IconButton({
  name,
  label,
  tooltip,
  tooltipSide,
  variant = "ghost",
  size = 32,
  iconSize,
  round,
  className,
  style,
  ...rest
}: IconButtonProps) {
  const tip = tipProps(tooltip, tooltipSide);
  const cls = ["td-iconbtn", variant !== "ghost" ? `td-iconbtn-${variant}` : "", round ? "td-iconbtn-round" : "", tip.className, className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      data-tip={tip["data-tip"]}
      data-tip-side={tip["data-tip-side"]}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <Icon name={name} size={iconSize ?? Math.round(size / 2) + 4} />
    </button>
  );
}
