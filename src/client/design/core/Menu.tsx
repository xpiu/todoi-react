// Menu — the ⋯ menu and every option list, on Base UI Menu (arrow / Home / End roving, typeahead,
// Escape, outside press, focus return). MenuPopover = Root + custom trigger + Popover surface;
// MenuButton = MenuPopover with an IconButton trigger. Rows: MenuItem / MenuDivider / MenuNote /
// MenuGroup + MenuHeading. Spec: DESIGN.md › Inline editing primitives.
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { createContext, useCallback, useContext, useRef, type CSSProperties, type MouseEvent, type ReactElement, type ReactNode } from "react";

import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { closeReasonOf, placementToSide, type PopoverCloseReason, type PopoverPlacement, type PopoverTier } from "./Popover";
import type { TooltipSide } from "./Tooltip";
import { usePortalContainer } from "./portalContainer";
import { useViewport } from "./viewport";
import "./Popover.css";
import "./kbd.css";
import "./Menu.css";

export interface MenuItemProps {
  /** 15px glyph, --ink-600 (currentColor on danger rows) */
  icon?: IconName;
  iconColor?: string;
  children?: ReactNode;
  /** Right-aligned quiet text (current value, count, "Suggested") */
  trailing?: ReactNode;
  /** Mono kbd chip at the trailing edge, e.g. "D" or "ctrl ↵" */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Set (true/false) to make the row a menuitemradio with a trailing check when true; put the set in a MenuGroup */
  checked?: boolean;
  /** Chevron-right at the trailing edge; keeps the menu open so the parent can swap in a sub-view */
  drill?: boolean;
  onSelect?: (e: MouseEvent) => void;
  /** @default true (false for rows that swap the menu's content) */
  closeOnSelect?: boolean;
  /** Override the ARIA role ("menuitemcheckbox") */
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  title?: string;
  "aria-label"?: string;
  style?: CSSProperties;
  className?: string;
}

export function MenuItem({ icon, iconColor, children, trailing, shortcut, danger, disabled, checked, drill, onSelect, closeOnSelect, role, title, style, className, ...rest }: MenuItemProps) {
  const r = role ?? (checked !== undefined ? "menuitemradio" : "menuitem");
  const hasTrail = !!(trailing || drill || shortcut);
  return (
    <BaseMenu.Item
      role={r}
      aria-checked={checked !== undefined ? !!checked : undefined}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      data-danger={danger ? "true" : undefined}
      closeOnClick={!(closeOnSelect === false || drill)}
      className={["td-menu-item", className ?? ""].join(" ").trim()}
      onClick={(e) => {
        if (!disabled) onSelect?.(e);
      }}
      title={title}
      style={style}
    >
      {icon ? (
        <span className="td-menu-item-icon">
          <Icon name={icon} size={15} color={iconColor} />
        </span>
      ) : null}
      <span className="td-menu-item-label">{children}</span>
      {hasTrail ? (
        <span className="td-menu-item-trail">
          {trailing}
          {shortcut ? <kbd className="td-kbd">{shortcut}</kbd> : null}
          {drill ? <Icon name="chevron-right" size={13} /> : null}
        </span>
      ) : null}
      {checked ? <Icon name="check" size={14} className="td-menu-item-check" data-after-trail={hasTrail ? "true" : "false"} /> : null}
    </BaseMenu.Item>
  );
}

export function MenuDivider() {
  return <BaseMenu.Separator className="td-menu-divider" />;
}

/** 11/15 --ink-400 explanatory text; wraps at 220px */
export function MenuNote({ children, title }: { children?: ReactNode; title?: string }) {
  return (
    <div className="td-menu-note" title={title}>
      {children}
    </div>
  );
}

const InMenuGroup = createContext(false);

/** A set of rows announced as one group (role="group"), named by the MenuHeading inside it — e.g. the options of a choice. */
export function MenuGroup({ children }: { children?: ReactNode }) {
  return (
    <InMenuGroup.Provider value>
      <BaseMenu.Group className="td-menu-group">{children}</BaseMenu.Group>
    </InMenuGroup.Provider>
  );
}

/** Uppercase 11px group label: names its MenuGroup; outside one it is decoration only. */
export function MenuHeading({ children }: { children?: ReactNode }) {
  return useContext(InMenuGroup) ? (
    <BaseMenu.GroupLabel className="td-menu-heading">{children}</BaseMenu.GroupLabel>
  ) : (
    <div className="td-menu-heading" role="presentation">
      {children}
    </div>
  );
}

export interface MenuPopoverProps {
  /** The trigger element; its click toggles the menu */
  trigger: ReactElement;
  /** The menu's accessible name — required (it replaces Base UI's default of the trigger's name) */
  label: string;
  open?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean, reason?: PopoverCloseReason) => void;
  /** @default "bottom-end" */
  placement?: PopoverPlacement;
  tier?: PopoverTier;
  width?: number | string;
  /** @default 184 */
  minWidth?: number | string;
  /** Full-width anchor */
  block?: boolean;
  /** MenuItem / MenuDivider / MenuNote / MenuGroup children, or a render function (close) => children; close() goes through Base UI's state and reports "select" */
  children?: ReactNode | ((close: () => void) => ReactNode);
  /** Where focus goes when the menu closes @default the trigger. Return an element (a field the choice opened) or true for the default. */
  finalFocus?: () => HTMLElement | boolean | null;
  style?: CSSProperties;
  className?: string;
}

/** A menu behind any trigger. Uncontrolled unless `open` is given. */
export function MenuPopover({ trigger, label, open, disabled, onOpenChange, placement = "bottom-end", tier = "menu", width, minWidth = 184, block, children, finalFocus, style, className }: MenuPopoverProps) {
  const vp = useViewport();
  const container = usePortalContainer();
  const isSheet = vp.phone;
  const { side, align } = placementToSide(placement);
  const actionsRef = useRef<BaseMenu.Root.Actions>(null);
  // Render-function children get a close() through Base UI's own state. It is the only imperative close and
  // follows a choice, so it reports "select".
  const handleOpenChange = useCallback(
    (next: boolean, details: { reason?: string }) => onOpenChange?.(next, next ? undefined : details.reason === "imperative-action" ? "select" : closeReasonOf(details.reason)),
    [onOpenChange],
  );
  const close = useCallback(() => actionsRef.current?.close(), []);
  return (
    <BaseMenu.Root open={open} onOpenChange={handleOpenChange} modal={isSheet} actionsRef={actionsRef}>
      <BaseMenu.Trigger render={trigger} disabled={disabled} data-block={block ? "true" : undefined} />
      <BaseMenu.Portal container={container ?? undefined}>
        {isSheet ? <BaseMenu.Backdrop className="td-sheet-backdrop" /> : null}
        <BaseMenu.Positioner
          className="td-pop-positioner"
          data-tier={tier}
          data-sheet={isSheet ? "true" : undefined}
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          positionMethod={tier === "detached" ? "fixed" : "absolute"}
        >
          <BaseMenu.Popup
            className={["td-pop", "td-menu", className ?? ""].filter(Boolean).join(" ")}
            data-sheet={isSheet ? "true" : undefined}
            // Base UI names the popup after its trigger; the caller's label is the menu's own name.
            aria-label={label}
            aria-labelledby={undefined}
            finalFocus={finalFocus}
            style={{ ...(width != null ? { width } : null), ...(minWidth != null ? { minWidth } : null), ...style }}
          >
            {isSheet ? <div className="td-sheet-handle" aria-hidden /> : null}
            {typeof children === "function" ? <MenuChildren render={children} close={close} /> : children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

/** Calls the render function only once the popup mounts its content. */
function MenuChildren({ render, close }: { render: (close: () => void) => ReactNode; close: () => void }) {
  return <>{render(close)}</>;
}

export interface MenuButtonProps extends Omit<MenuPopoverProps, "trigger"> {
  /** Trigger glyph @default "ellipsis" */
  icon?: IconName;
  /** Class on the trigger button (className styles the popup) */
  triggerClassName?: string;
  tooltip?: string;
  tooltipSide?: TooltipSide;
  /** IconButton variant @default "ghost" */
  variant?: "ghost" | "chrome";
  /** Trigger size in px @default 32 */
  size?: number;
  iconSize?: number;
}

/** Trigger + Popover + Menu in one: the ⋯ menu. */
export function MenuButton({ icon = "ellipsis", label, tooltip, tooltipSide, variant = "ghost", size = 32, iconSize, triggerClassName, ...rest }: MenuButtonProps) {
  return <MenuPopover label={label} trigger={<IconButton name={icon} label={label} tooltip={tooltip} tooltipSide={tooltipSide} variant={variant} size={size} iconSize={iconSize} className={triggerClassName} />} {...rest} />;
}
