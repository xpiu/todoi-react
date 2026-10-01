// ListActionsMenu — the rows of a list's ⋯ menu (board column and list section alike): Rename, Icon
// (drill into IconPicker), Status role (drill into the role picker with a title-based suggestion),
// Select all, Hide. Rendered inside MenuPopover / MenuButton. Spec: DESIGN.md › Lists & Status linking.
import { useState } from "react";

import type { ItemStatus } from "../../../shared/item-status";
import type { IconName } from "../core/Icon";
import { IconPicker } from "../core/IconPicker";
import { MenuDivider, MenuItem, MenuNote } from "../core/Menu";
import { STATUSES, statusById, suggestedRoleForTitle } from "../core/statuses";
import { listIconFor } from "./listIcons";

export interface ListActionsMenuProps {
  name: string;
  /** The explicit icon override (null = automatic) */
  activeIcon?: IconName | null;
  statusRole?: ItemStatus | null;
  onStatusRoleChange?: (role: ItemStatus | null) => void;
  onManageLinks?: () => void;
  /** Close the menu (MenuPopover's render-function argument) */
  onClose?: () => void;
  onStartRename?: () => void;
  onIconChange?: (icon: IconName | null) => void;
  onSelectAll?: () => void;
  onHide?: () => void;
}

export function ListActionsMenu({ name, activeIcon, statusRole, onStatusRoleChange, onManageLinks, onClose, onStartRename, onIconChange, onSelectAll, onHide }: ListActionsMenuProps) {
  const [view, setView] = useState<"icon" | "role" | null>(null);
  const auto = listIconFor(name);
  const role = statusRole ? statusById(statusRole) : null;
  const suggestion = statusRole == null ? suggestedRoleForTitle(name) : null;
  if (view === "icon") {
    return (
      <IconPicker
        value={activeIcon ?? null}
        autoIcon={auto.icon}
        onChange={(n) => {
          onClose?.();
          onIconChange?.(n);
        }}
      />
    );
  }
  if (view === "role") {
    const roleRow = (id: ItemStatus | null, label: string, icon: IconName, color?: string) => (
      <MenuItem key={label} icon={icon} iconColor={color} checked={(statusRole ?? null) === id} trailing={suggestion && suggestion === id ? "Suggested" : undefined} onSelect={() => onStatusRoleChange?.(id)}>
        {label}
      </MenuItem>
    );
    return (
      <>
        {roleRow(null, "None", "circle-off")}
        {STATUSES.map((s) => roleRow(s.id, s.name, s.icon, s.color))}
        <MenuNote>Identifies the workflow stage this list represents. The project's "Link lists with statuses" setting decides whether moves update item Status.</MenuNote>
        <MenuDivider />
        <MenuItem icon="link-2" onSelect={() => onManageLinks?.()}>
          Manage list–status links…
        </MenuItem>
      </>
    );
  }
  return (
    <>
      <MenuItem icon="pencil" onSelect={() => onStartRename?.()}>
        Rename
      </MenuItem>
      <MenuItem icon="shapes" drill onSelect={() => setView("icon")}>
        Icon
      </MenuItem>
      <MenuItem icon="milestone" drill trailing={role ? role.name : "None"} onSelect={() => setView("role")}>
        Status role
      </MenuItem>
      <MenuItem icon="square-check-big" onSelect={() => onSelectAll?.()}>
        Select all
      </MenuItem>
      <MenuItem icon="eye-off" onSelect={() => onHide?.()}>
        Hide
      </MenuItem>
    </>
  );
}
