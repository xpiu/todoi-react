// Select — one-of-N picker (Status, list, Priority, calendar period, settings rows). Replaces every
// native <select>. Built on Base UI Combobox with the input inside the popup, which is the library's
// "searchable select" pattern: the filter field appears automatically above 8 options. Footer rows
// (Create new list…, Manage links…) sit under the options after a divider. Spec: DESIGN.md › Select.
import { Combobox } from "@base-ui/react/combobox";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { Button, type ButtonVariant } from "./Button";
import { Icon, type IconName } from "./Icon";
import { closeReasonOf, placementToSide, usePickerOpen, type PickerOpenProps, type PopoverPlacement, type PopoverTier } from "./Popover";
import { usePortalContainer } from "./portalContainer";
import { useViewport } from "./viewport";
import "./Popover.css";
import "./Menu.css";
import "./Select.css";

export type SelectValue = string | number | null;

export interface SelectOption<V extends SelectValue = SelectValue> {
  value: V;
  /** Display text; falls back to String(value) */
  label?: string;
  icon?: IconName;
  iconColor?: string;
  /** Quiet right-aligned text on the row */
  hint?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export interface SelectProps<V extends SelectValue = SelectValue> extends PickerOpenProps {
  value?: V;
  options: ReadonlyArray<SelectOption<V>>;
  /** Called with (value, option) when a different option is picked */
  onChange?: (value: V, option: SelectOption<V>) => void;
  /** Trigger text when nothing is picked @default "Select" */
  placeholder?: string;
  /** Trigger glyph when the picked option has none */
  icon?: IconName;
  /** @default "outline"; "chrome" on the app bar */
  variant?: ButtonVariant;
  size?: "md" | "lg";
  placement?: PopoverPlacement;
  tier?: PopoverTier;
  /** Popover width @default 200 */
  width?: number | string;
  /** Show the filter field. Default: on when options.length > 8 */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Extra MenuDivider / MenuNote / action rows rendered after the options */
  footer?: ReactNode;
  /** Required when the trigger text alone does not name the field ("Status", "Move to list") */
  "aria-label"?: string;
  title?: string;
  /** Full-width trigger (the overlay rail) */
  block?: boolean;
  disabled?: boolean;
  /** Custom trigger text from the current option (undefined when none) */
  renderValue?: (option?: SelectOption<V>) => ReactNode;
  style?: CSSProperties;
  className?: string;
}

const labelOf = (o: SelectOption<SelectValue>) => o.label ?? String(o.value);

export function Select<V extends SelectValue = SelectValue>({
  value,
  options,
  onChange,
  placeholder = "Select",
  icon,
  variant = "outline",
  size,
  placement = "bottom-start",
  tier = "menu",
  width = 200,
  searchable,
  searchPlaceholder = "Search…",
  footer,
  title,
  block,
  disabled,
  renderValue,
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  anchorRef,
  id,
  style,
  className,
  ...rest
}: SelectProps<V>) {
  const vp = useViewport();
  const container = usePortalContainer();
  const isSheet = vp.phone;
  const { side, align } = placementToSide(placement);
  const pop = usePickerOpen({ open: openProp, onOpenChange, defaultOpen });
  // Opened with the pointer, the picked row carries only its check (as in Design): Base UI's opening highlight
  // on it stays unpainted until a key or the pointer moves the highlight. Opened from the keyboard it shows at once.
  const [quietHighlight, setQuietHighlight] = useState(false);
  const search = searchable ?? options.length > 8;
  const cur = options.find((o) => o.value === value);
  const handleOpenChange = (next: boolean, details: { reason?: string; event?: Event }) => {
    // Triggerless: a press on the anchor is the opener's own (it toggles), not an outside press
    const target = details.reason === "outside-press" ? details.event?.target : null;
    if (!next && anchorRef && target instanceof Node && anchorRef.current?.contains(target)) return;
    if (next) setQuietHighlight(details.event instanceof MouseEvent && details.event.detail > 0);
    pop.setOpen(next, closeReasonOf(details.reason));
  };
  const items = useMemo(() => options as SelectOption<V>[], [options]);
  const listName = rest["aria-label"] ?? placeholder;
  const trigIcon = cur?.icon ? <Icon name={cur.icon} size={16} color={cur.iconColor} /> : icon ? <Icon name={icon} size={16} /> : null;

  return (
    <Combobox.Root<SelectOption<V>>
      items={items}
      value={cur ?? null}
      onValueChange={(next) => {
        if (next && next.value !== value) onChange?.(next.value, next);
      }}
      itemToStringLabel={(o) => (o ? labelOf(o) : "")}
      isItemEqualToValue={(a, b) => a?.value === b?.value}
      open={pop.open}
      onOpenChange={handleOpenChange}
      onItemHighlighted={(_, details) => {
        if (details.reason !== "none") setQuietHighlight(false);
      }}
      modal={isSheet}
      disabled={disabled}
      filter={search ? undefined : null}
    >
      {anchorRef ? null : <Combobox.Trigger
        render={
          <Button variant={variant} size={size} iconAfter="chevron-down" disabled={disabled} className="td-select-trigger" data-block={block ? "true" : undefined} aria-label={rest["aria-label"]} title={title} style={style}>
            {trigIcon}
            <span className="td-select-value" data-placeholder={cur ? undefined : "true"}>
              {renderValue ? renderValue(cur) : cur ? labelOf(cur) : placeholder}
            </span>
          </Button>
        }
      />}
      <Combobox.Portal container={container ?? undefined}>
        {isSheet ? <Combobox.Backdrop className="td-sheet-backdrop" /> : null}
        <Combobox.Positioner
          className="td-popover-positioner"
          data-tier={tier}
          data-sheet={isSheet ? "true" : undefined}
          anchor={anchorRef}
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          positionMethod={tier === "detached" ? "fixed" : "absolute"}
        >
          <Combobox.Popup id={id} className={["td-popover", className ?? ""].filter(Boolean).join(" ")} data-sheet={isSheet ? "true" : undefined} data-quiet-highlight={quietHighlight ? "true" : undefined} aria-label={listName} style={{ width }}>
            {isSheet ? <div className="td-sheet-handle" aria-hidden /> : null}
            {search ? (
              <div className="td-select-search">
                <Icon name="search" size={14} />
                <Combobox.Input className="td-select-input" placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
              </div>
            ) : null}
            <Combobox.List className="td-select-list" aria-label={listName}>
              {(o: SelectOption<V>) => (
                <Combobox.Item key={String(o.value)} value={o} disabled={o.disabled} className="td-menu-item" title={o.title}>
                  {o.icon ? (
                    <span className="td-menu-item-icon">
                      <Icon name={o.icon} size={15} color={o.iconColor} />
                    </span>
                  ) : null}
                  <span className="td-menu-item-label">{labelOf(o)}</span>
                  {o.hint ? <span className="td-menu-item-trail">{o.hint}</span> : null}
                  <Combobox.ItemIndicator className="td-menu-item-check" data-after-trail={o.hint ? "true" : "false"}>
                    <Icon name="check" size={14} />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            <Combobox.Empty>{/* Base UI keeps this live region mounted; the note inside appears only when nothing matches */}<div className="td-menu-note">No matches</div></Combobox.Empty>
            {footer}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
