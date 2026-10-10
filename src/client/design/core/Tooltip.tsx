// Tooltip — the one styled hover hint for icon-only controls. Deliberately CSS-only (attribute +
// pseudo-elements). Scroll-clipped anchors opt into Base UI's positioned portal. Rules:
// 2–4 words, sentence case, never the only label, never on text,
// never on disabled controls. Spec: DESIGN.md › Tooltips.
import { Children, cloneElement, isValidElement, type ReactElement } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";

import { usePortalContainer } from "./portalContainer";

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
  /** Escape a scrolling ancestor using the existing floating-layer container. */
  portal?: boolean;
  /** Exactly one element; it must accept className and data-* attributes */
  children: ReactElement<{ className?: string }>;
}

export function Tooltip({ text, side, off, portal, children }: TooltipProps) {
  const child = Children.only(children);
  if (!text || !isValidElement(child)) return child;
  if (portal) return <FloatingTooltip text={text} side={side} off={off}>{child}</FloatingTooltip>;
  const props = child.props as { className?: string };
  return cloneElement(child, {
    className: [props.className ?? "", "td-tip"].join(" ").trim(),
    "data-tip": text,
    "data-tip-side": side && side !== "bottom" ? side : undefined,
    "data-tip-off": off ? "true" : undefined,
  } as Partial<typeof props>);
}

function FloatingTooltip({ text, side = "bottom", off, children }: TooltipProps) {
  const container = usePortalContainer();
  const [edge, align = "center"] = side.split("-") as ["bottom" | "top" | "left", "start" | "end" | "center"];
  const disabled = off || (children.props as { disabled?: boolean }).disabled;
  return (
    <BaseTooltip.Root disabled={disabled}>
      <BaseTooltip.Trigger render={children} delay={400} />
      <BaseTooltip.Portal container={container ?? undefined}>
        <BaseTooltip.Positioner className="td-tip-positioner" positionMethod="fixed" side={edge} align={align} sideOffset={6} collisionPadding={8}>
          <BaseTooltip.Popup className="td-tip-popup">
            <BaseTooltip.Arrow className="td-tip-arrow" />
            {text}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
