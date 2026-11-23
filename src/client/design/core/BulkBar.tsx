// BulkBar — fixed bottom-centre on navy (the Toast owns bottom-left, ShortcutHint bottom-right) while
// one or more items are selected. Every action applies to the whole selection and raises ONE undo
// toast. Option menus are the shared Menu on the detached tier. Spec: DESIGN.md › Selection.
// Base UI Toolbar gives it the WAI-ARIA toolbar keyboard model: one Tab stop, ←/→ (Home/End) between buttons.
import { Toolbar } from "@base-ui/react/toolbar";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { MenuDivider, MenuItem, MenuPopover, useMenuDrill } from "./Menu";
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
  /** A panel swapped in for the option list (a drill row, as Design's BulkBar): "Move to another project…" opens the
   * ProjectPicker. close() closes the menu; back() returns to the options. */
  panel?: (close: () => void, back: () => void) => ReactNode;
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
    <Toolbar.Root className="td-bulk" aria-label={`Actions for ${count} selected ${noun}${count === 1 ? "" : "s"}`} style={style}>
      <span className="td-bulk-count" aria-live="polite">
        {count} selected
      </span>
      {actions.map((a) => {
        const btn = (
          <Toolbar.Button className={"td-bulk-btn" + (a.danger ? " is-danger" : "")} onClick={a.options ? undefined : () => onAction(a.id)}>
            {a.icon ? <Icon name={a.icon} size={15} /> : null}
            {a.label}
            {a.options ? <Icon name="chevron-up" size={13} className="td-bulk-chevron" /> : null}
          </Toolbar.Button>
        );
        if (!a.options) return <span key={a.id}>{btn}</span>;
        return <BulkMenu key={a.id} action={a} options={a.options} trigger={btn} onAction={onAction} />;
      })}
      {onClear ? (
        <>
          <Toolbar.Button className="td-bulk-btn td-bulk-clear" aria-label="Clear selection" onClick={onClear}>
            Clear
            {/* The key is drawn from data-key (BulkBar.css): a hint beside the label, not part of its name. */}
            {clearHint ? <kbd className="td-bulk-kbd" data-key={clearHint} aria-hidden="true" /> : null}
          </Toolbar.Button>
          <Toolbar.Button render={<IconButton name="x" label="Close" variant="chrome" size={28} />} onClick={onClear} />
        </>
      ) : null}
    </Toolbar.Root>
  );
}

/** One action's option menu; an option with a panel drills into it in place (Escape or its Back returns to the options). */
function BulkMenu({ action, options, trigger, onAction }: { action: BulkAction; options: BulkOption[]; trigger: ReactElement; onAction: BulkBarProps["onAction"] }) {
  const drill = useMenuDrill<string | null>(null);
  const panel = options.find((o) => o.panel && o.value === drill.view)?.panel;
  return (
    <MenuPopover label={action.label} tier="detached" placement="top-start" minWidth={176} width={panel ? 280 : undefined} trigger={trigger} shouldClose={drill.shouldClose} onOpenChange={(o) => !o && drill.back()}>
      {(close) =>
        panel
          ? panel(close, drill.back)
          : options.map((o, i) =>
              o.divider ? (
                <MenuDivider key={`div${i}`} />
              ) : (
                <MenuItem key={String(o.value)} icon={o.swatch ? undefined : o.icon} iconColor={o.iconColor} checked={o.checked} drill={!!o.panel} onSelect={() => (o.panel ? drill.setView(o.value) : onAction(action.id, o.value))}>
                  {o.swatch ? <span className="td-bulk-dot" style={{ background: o.swatch }} /> : null}
                  {o.label}
                </MenuItem>
              ),
            )
      }
    </MenuPopover>
  );
}
