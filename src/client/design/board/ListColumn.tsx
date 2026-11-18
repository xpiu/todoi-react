// ListColumn — a board list: header (icon → IconPicker, name, count, ⋯ list actions), the card stack,
// and the "Add an item" composer. Exposes data-status-role so "Colorize Board columns" can tint it.
// Spec: DESIGN.md › Board, Lists & Status linking.
import { useState, type CSSProperties, type ReactNode } from "react";

import type { ItemStatus } from "../../../shared/item-status";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { AddItemKey } from "../core/ShortcutHint";
import type { QuickAddOptions, QuickAddResult } from "../core/quickAdd";
import { QuickAddInput } from "../core/QuickAddInput";
import { suggestedRoleForTitle } from "../core/statuses";
import type { AddPosition } from "../list/ListSection";
import { ListActionsPopover, ListIconButton, useListRename } from "./listHeader";
import "./ListColumn.css";

export interface ListColumnProps {
  name: string;
  count?: number | string;
  icon?: IconName | null;
  iconColor?: string;
  statusRole?: ItemStatus | null;
  onStatusRoleChange?: (role: ItemStatus | null) => void;
  onManageLinks?: () => void;
  children?: ReactNode;
  /** The foot "Add an item" appends (position "bottom"); ⋯ › Add an item opens the composer above the first card and the item lands first ("top") */
  onAddItem?: (title: string, parsed: QuickAddResult, position: AddPosition) => void;
  quickAdd?: QuickAddOptions;
  onRename?: (name: string) => void;
  onIconChange?: (icon: IconName | null) => void;
  onSelectAll?: () => void;
  onHide?: () => void;
  /** Outlines the column while a card from another list is dragged over it */
  dropTarget?: boolean;
  /** Spread onto the column root (drag-and-drop handlers) */
  rootProps?: Record<string, unknown>;
  /** Identifies the column for drop handlers */
  listId?: string;
  style?: CSSProperties;
}

export function ListColumn({ name, count, children, onAddItem, quickAdd, icon, iconColor, statusRole, onStatusRoleChange, onManageLinks, onRename, onIconChange, onSelectAll, onHide, dropTarget, rootProps, listId, style }: ListColumnProps) {
  const rename = useListRename(name, onRename);
  // adding: "top" (⋯ › Add an item, new items land first) | "bottom" (foot "Add an item", new items append)
  const [adding, setAdding] = useState<AddPosition | false>(false);
  const commitAdd = (parsed: QuickAddResult, keep: boolean) => {
    if (parsed.title) onAddItem?.(parsed.title, parsed, adding || "bottom");
    if (!keep) setAdding(false);
  };
  // The plus leads the composer like the add row it replaces (shown in Minimal, where the composer is a plain row)
  const composer = (where: AddPosition) => (
    <div className={"td-list-column-composer" + (where === "top" ? " is-top" : "")}>
      <span className="td-list-column-composer-plus" aria-hidden="true">
        <Icon name="plus" size={16} />
      </span>
      <QuickAddInput {...quickAdd} placeholder="Item title" aria-label={where === "top" ? `New first item in ${name}` : `New item in ${name}`} onSubmit={(p) => commitAdd(p, true)} onCancel={() => setAdding(false)} onBlur={(p) => commitAdd(p, false)} />
    </div>
  );
  // Effective role (set role, else the title suggestion) drives the Colorize-columns tint.
  const effRole = statusRole ?? suggestedRoleForTitle(name) ?? undefined;
  return (
    <div className={"td-list-column" + (dropTarget ? " is-drop-target" : "")} data-status-role={effRole} data-list-name={name} data-list-id={listId} style={style} {...rootProps}>
      <div className="td-list-column-head">
        <ListIconButton name={name} icon={icon} iconColor={iconColor} onIconChange={onIconChange} className="td-list-column-iconbtn" size={16} />
        {rename.renaming ? <input className="td-list-column-rename" {...rename.inputProps} /> : <span className="td-list-column-name">{name}</span>}
        {!rename.renaming && count != null ? <span className="td-list-column-count">{count}</span> : null}
        <ListActionsPopover
          label={`Actions for ${name}`}
          trigger={<IconButton name="ellipsis" label={`List actions for ${name}`} tooltip="List actions" tooltipSide="bottom-end" size={28} className="td-list-column-more" />}
          name={name}
          activeIcon={icon}
          statusRole={statusRole}
          onStatusRoleChange={onStatusRoleChange}
          onManageLinks={onManageLinks}
          onStartRename={rename.startRename}
          onIconChange={onIconChange}
          onSelectAll={onSelectAll}
          onHide={onHide}
          onAddItem={onAddItem ? () => setAdding("top") : undefined}
        />
      </div>
      {adding === "top" ? composer("top") : null}
      <div className="td-list-column-cards" tabIndex={0} role="list" aria-label={`${name} cards`}>
        {children}
      </div>
      {adding === "bottom" ? (
        composer("bottom")
      ) : (
        <div className="td-list-column-foot">
          <button type="button" className="td-list-column-add" data-add-item={name} onClick={() => setAdding("bottom")}>
            <Icon name="plus" size={16} />
            Add an item
            <AddItemKey />
          </button>
        </div>
      )}
    </div>
  );
}
