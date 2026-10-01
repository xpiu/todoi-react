// Tooltip — the one styled hover hint for icon-only controls. Deliberately CSS-only (attribute +
// pseudo-elements): it lives inside the anchor's stacking context and needs no portal, so Base UI's
// Tooltip is not used here. Rules: 2–4 words, sentence case, never the only label, never on text,
// never on disabled controls. Spec: DESIGN.md › Tooltips.
import { Children, cloneElement, isValidElement, type ReactElement } from "react";

import "./Tooltip.css";

export type TooltipSide = "bottom" | "bottom-end" | "bottom-start" | "top" | "left";

export interface TipAttributes {
  className: string;
  "data-tip"?: string;
  "data-tip-side"?: TooltipSide;
}

/** Props for any element that should carry the shared hint; spread onto a control and merge the className. */
export function tipProps(text?: string, side?: TooltipSide, labeled?: boolean): TipAttributes {
  if (!text) return { className: "" };
  return {
    className: "td-tip" + (labeled ? " td-tip-labeled" : ""),
    "data-tip": text,
    "data-tip-side": side && side !== "bottom" ? side : undefined,
  };
}

export interface TooltipProps {
  /** 2–4 words. Nothing renders when empty. */
  text?: string;
  /** @default "bottom" */
  side?: TooltipSide;
  /** Hide while true (a menu is open, a drag is in progress) */
  off?: boolean;
  /** Exactly one element; it must accept className and data-* attributes */
  children: ReactElement<{ className?: string }>;
}

export function Tooltip({ text, side, off, children }: TooltipProps) {
  const child = Children.only(children);
  if (!text || !isValidElement(child)) return child;
  const props = child.props as { className?: string };
  return cloneElement(child, {
    className: [props.className ?? "", "td-tip"].join(" ").trim(),
    "data-tip": text,
    "data-tip-side": side && side !== "bottom" ? side : undefined,
    "data-tip-off": off ? "true" : undefined,
  } as Partial<typeof props>);
}
