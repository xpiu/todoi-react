// Popover — the one anchored floating surface every dropdown, picker and panel sits on. Base UI owns
// outside-press close, Escape (nested first), collision flip, focus return and the portal; this file
// owns the look (td-pop), the z-tier, and the phone bottom sheet. Menus use MenuButton (Base UI Menu);
// reach for Popover directly only for a custom panel (Share, Style, Save view, pickers).
// Spec: DESIGN.md › Inline editing primitives · Responsive › Popover → bottom sheet.
import { Popover as BasePopover } from "@base-ui/react/popover";
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode, type RefObject } from "react";

import { usePortalContainer } from "./portalContainer";
import { useViewport } from "./viewport";
import "./Popover.css";

export type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";
/** menu → --z-menu (default) · nav → sidebar / top bar · detached → anchors inside scroll or transform ancestors · toolbar → app-bar dropdowns */
export type PopoverTier = "menu" | "nav" | "detached" | "toolbar";
export type PopoverCloseReason = "outside" | "escape" | "select" | "swipe" | "trigger" | "focus-out" | "other";

export function placementToSide(placement: PopoverPlacement) {
  const [side, align] = placement.split("-") as ["bottom" | "top", "start" | "end"];
  return { side, align };
}

export function closeReasonOf(reason: string | undefined): PopoverCloseReason {
  switch (reason) {
    case "outside-press":
      return "outside";
    case "escape-key":
      return "escape";
    case "item-press":
    case "close-press":
      return "select";
    case "trigger-press":
    case "trigger-hover":
      return "trigger";
    case "focus-out":
      return "focus-out";
    default:
      return "other";
  }
}

export interface PopoverProps {
  open: boolean;
  /** Called with (false, reason) when the popover wants to close, and (true) when a trigger opens it */
  onOpenChange: (open: boolean, reason?: PopoverCloseReason) => void;
  /** The element that opens it (a Button, an IconButton…): rendered through Base UI's trigger so a click on it toggles */
  trigger?: ReactElement;
  /** Anchor elsewhere than the trigger (a card, a row) */
  anchorRef?: RefObject<HTMLElement | null>;
  /** @default "bottom-start" */
  placement?: PopoverPlacement;
  /** @default "menu" */
  tier?: PopoverTier;
  /** Gap to the anchor in px @default 4 */
  offset?: number;
  width?: number | string;
  minWidth?: number | string;
  /** Leave unset for a plain panel; "dialog" for pickers and custom panels with their own fields */
  role?: "dialog";
  "aria-label"?: string;
  /** Bottom sheet on phones. "auto" follows useViewport() @default "auto" */
  sheet?: boolean | "auto";
  /** Full-width trigger wrapper */
  block?: boolean;
  /** Initial focus inside the popup; false keeps focus on the trigger (Base UI default moves it in) */
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** Class on the trigger wrapper */
  anchorClassName?: string;
}

const SWIPE_CLOSE_PX = 80;

export function Popover({
  open,
  onOpenChange,
  trigger,
  anchorRef,
  placement = "bottom-start",
  tier = "menu",
  offset = 4,
  width,
  minWidth,
  role,
  sheet = "auto",
  block,
  initialFocus,
  children,
  style,
  className,
  anchorClassName,
  ...rest
}: PopoverProps) {
  const vp = useViewport();
  const container = usePortalContainer();
  const isSheet = sheet === true || (sheet === "auto" && vp.phone);
  const { side, align } = placementToSide(placement);
  const popupRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ y: number; id: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    swipe.current = { y: e.clientY, id: e.pointerId, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id || !popupRef.current) return;
    s.dy = Math.max(0, e.clientY - s.y);
    popupRef.current.style.transform = `translateY(${s.dy}px)`;
  };
  const onHandleUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    swipe.current = null;
    setDragging(false);
    if (popupRef.current) popupRef.current.style.transform = "";
    if (s.dy > SWIPE_CLOSE_PX) onOpenChange(false, "swipe");
  };

  const handleOpenChange = useCallback(
    (next: boolean, details: { reason?: string }) => onOpenChange(next, next ? undefined : closeReasonOf(details.reason)),
    [onOpenChange],
  );

  // A bottom sheet spans the screen: the anchored width would leave it short of the right edge.
  const popupStyle: CSSProperties = { ...(width != null && !isSheet ? { width } : null), ...(minWidth != null && !isSheet ? { minWidth } : null), ...style };
  const popupCls = ["td-pop", dragging ? "is-dragging" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <BasePopover.Root open={open} onOpenChange={handleOpenChange} modal={isSheet}>
      {trigger ? <BasePopover.Trigger render={trigger} className={anchorClassName} data-block={block ? "true" : undefined} /> : null}
      <BasePopover.Portal container={container ?? undefined}>
        {isSheet ? <BasePopover.Backdrop className="td-sheet-backdrop" /> : null}
        <BasePopover.Positioner
          className="td-pop-positioner"
          data-tier={tier}
          data-sheet={isSheet ? "true" : undefined}
          anchor={anchorRef}
          side={side}
          align={align}
          sideOffset={offset}
          collisionPadding={8}
          positionMethod={tier === "detached" ? "fixed" : "absolute"}
        >
          <BasePopover.Popup
            ref={popupRef}
            className={popupCls}
            data-sheet={isSheet ? "true" : undefined}
            role={role}
            aria-label={rest["aria-label"]}
            style={popupStyle}
            initialFocus={initialFocus}
          >
            {isSheet ? <div className="td-sheet-handle" aria-hidden onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} /> : null}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/** Open state for a controlled Popover; one call per popover. */
export function usePopover(initial = false) {
  const [open, setOpen] = useState(initial);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, setOpen, toggle, close };
}

/** A control inside a Popover's body that closes it when clicked (and still runs its own onClick), e.g. a row that opens a dialog. */
export function PopoverClose({ render }: { render: ReactElement }) {
  return <BasePopover.Close render={render} />;
}
