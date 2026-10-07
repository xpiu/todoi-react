// The behaviour a list header shares between the board column (ListColumn) and the list section
// (ListSection): inline rename, the icon button that opens IconPicker, and the ⋯ menu of ListActionsMenu
// rows. Each header keeps its own markup and classes — they look different and sync separately with
// Claude Design — and composes these pieces. Spec: DESIGN.md › Lists & Status linking.
import { useState, type InputHTMLAttributes, type ReactElement } from "react";

import { Icon, type IconName } from "../core/Icon";
import { IconPicker } from "../core/IconPicker";
import { MenuPopover } from "../core/Menu";
import { Popover, usePopover } from "../core/Popover";
import { ListActionsMenu, type ListActionsMenuProps } from "./ListActionsMenu";
import { listIconFor } from "./listIcons";

/** Inline rename: `startRename` swaps the name for an input; Enter or blur commits a changed, non-empty name, Escape cancels. */
export function useListRename(name: string, onRename?: (name: string) => void) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    setRenaming(false);
    if (v && v !== name) onRename?.(v);
  };
  const startRename = () => {
    setDraft(name);
    setRenaming(true);
  };
  /** Spread onto the header's own <input> */
  const inputProps = {
    value: draft,
    autoFocus: true,
    "aria-label": "List name",
    onFocus: (e) => e.target.select(),
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") setRenaming(false);
    },
  } satisfies InputHTMLAttributes<HTMLInputElement>;
  return { renaming, startRename, inputProps };
}

export interface ListIconButtonProps {
  name: string;
  /** Explicit icon override; null/undefined shows the automatic name-derived icon */
  icon?: IconName | null;
  iconColor?: string;
  onIconChange?: (icon: IconName | null) => void;
  /** The header's own class for the button (td-tip is added) */
  className: string;
  size: number;
}

/** The list's icon as a button that opens IconPicker in a popover. */
export function ListIconButton({ name, icon, iconColor, onIconChange, className, size }: ListIconButtonProps) {
  const auto = listIconFor(name);
  const pop = usePopover();
  const override = icon ?? null;
  return (
    <Popover open={pop.open} onOpenChange={pop.setOpen} placement="bottom-start" offset={2} minWidth={0} role="dialog" aria-label={`Icon for ${name}`} trigger={<button type="button" className={`${className} td-tip`} data-tip="Change icon" aria-label={`Change icon for ${name}`}><Icon name={override ?? auto.icon} size={size} color={iconColor ?? auto.color} /></button>}>
      <IconPicker
        value={override}
        autoIcon={auto.icon}
        onChange={(n) => {
          onIconChange?.(n);
          pop.close();
        }}
      />
    </Popover>
  );
}

export interface ListActionsPopoverProps extends Omit<ListActionsMenuProps, "onClose"> {
  /** The menu's accessible name */
  label: string;
  /** The header's own ⋯ button */
  trigger: ReactElement;
}

/** The ⋯ menu: ListActionsMenu rows behind the header's trigger, closed through MenuPopover. */
export function ListActionsPopover({ label, trigger, ...menu }: ListActionsPopoverProps) {
  return (
    <MenuPopover label={label} placement="bottom-end" trigger={trigger}>
      {(close) => <ListActionsMenu {...menu} onClose={close} />}
    </MenuPopover>
  );
}
