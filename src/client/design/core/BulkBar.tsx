// BulkBar — fixed bottom-centre on navy (the Toast owns bottom-left, ShortcutHint bottom-right) while
// one or more items are selected. Every action applies to the whole selection and raises ONE undo
// toast. Option menus are the shared Menu on the detached tier. Spec: DESIGN.md › Selection.
import type { CSSProperties } from "react";

import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { MenuDivider, MenuItem, MenuPopover } from "./Menu";
import "./BulkBar.css";

export interface BulkOption {
  value: string | null;
  label: string;
  icon?: IconName;
  iconColor?: string;
  /** Colour tile instead of a glyph (labels) */
  swatch?: string;
  /** Every selected item already has it */
  checked?: boolean;
  divider?: boolean;
}
export interface BulkAction {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  /** With options the button opens a menu; without, it fires directly */
  options?: BulkOption[];
}
export interface BulkBarProps {
  count: number;
  /** @default "item" */
  noun?: string;
  actions: BulkAction[];
  onAction: (id: string, value?: string | null) => void;
  onClear?: () => void;
  /** Kbd chip on Clear @default "esc" */
  clearHint?: string;
  style?: CSSProperties;
}

export function BulkBar({ count, noun = "item", actions, onAction, onClear, clearHint = "esc", style }: BulkBarProps) {
  if (!count) return null;
  return (
    <div className="td-bulk" role="toolbar" aria-label={`Actions for ${count} selected ${noun}${count === 1 ? "" : "s"}`} style={style}>
      <span className="td-bulk-count" aria-live="polite">
        {count} selected
      </span>
      {actions.map((a) => {
        const btn = (
          <button type="button" className={"td-bulk-btn" + (a.danger ? " is-danger" : "")} onClick={a.options ? undefined : () => onAction(a.id)}>
            {a.icon ? <Icon name={a.icon} size={15} /> : null}
            {a.label}
            {a.options ? <Icon name="chevron-up" size={13} className="td-bulk-chev" /> : null}
          </button>
        );
        if (!a.options) return <span key={a.id}>{btn}</span>;
        return (
          <MenuPopover key={a.id} label={a.label} tier="detached" placement="top-start" minWidth={176} trigger={btn}>
            {a.options.map((o, i) =>
              o.divider ? (
                <MenuDivider key={`div${i}`} />
              ) : (
                <MenuItem key={String(o.value)} icon={o.swatch ? undefined : o.icon} iconColor={o.iconColor} checked={o.checked} onSelect={() => onAction(a.id, o.value)}>
                  {o.swatch ? <span className="td-bulk-dot" style={{ background: o.swatch }} /> : null}
                  {o.label}
                </MenuItem>
              ),
            )}
          </MenuPopover>
        );
      })}
      {onClear ? (
        <>
          <button type="button" className="td-bulk-btn td-bulk-clear" onClick={onClear}>
            Clear
            {clearHint ? <kbd className="td-bulk-kbd">{clearHint}</kbd> : null}
          </button>
          <IconButton name="x" label="Clear selection" variant="chrome" size={28} onClick={onClear} />
        </>
      ) : null}
    </div>
  );
}
