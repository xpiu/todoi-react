// ListColumn — a board list: header (icon → IconPicker, name, count, ⋯ list actions), the card stack,
// and the "Add an item" composer. Exposes data-status-role so "Colorize Board columns" can tint it.
// Spec: DESIGN.md › Board, Lists & Status linking.
import { useState, type CSSProperties, type ReactNode } from "react";

import type { ItemStatus } from "../../../shared/item-status";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import type { QuickAddOptions, QuickAddResult } from "../core/quickAdd";
import { QuickAddInput } from "../core/QuickAddInput";
import { suggestedRoleForTitle } from "../core/statuses";
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
  onAddItem?: (title: string, parsed: QuickAddResult) => void;
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
  const [adding, setAdding] = useState(false);
  const commitAdd = (parsed: QuickAddResult, keep: boolean) => {
    if (parsed.title) onAddItem?.(parsed.title, parsed);
    if (!keep) setAdding(false);
  };
  // Effective role (set role, else the title suggestion) drives the Colorize-columns tint.
  const effRole = statusRole ?? suggestedRoleForTitle(name) ?? undefined;
  return (
    <div className={"td-list" + (dropTarget ? " is-drop-target" : "")} data-status-role={effRole} data-list-name={name} data-list-id={listId} style={style} {...rootProps}>
      <div className="td-list-head">
        <ListIconButton name={name} icon={icon} iconColor={iconColor} onIconChange={onIconChange} className="td-list-iconbtn" size={16} />
        {rename.renaming ? <input className="td-list-rename" {...rename.inputProps} /> : <span className="td-list-name">{name}</span>}
        {!rename.renaming && count != null ? <span className="td-list-count">{count}</span> : null}
        <ListActionsPopover
          label={`Actions for ${name}`}
          trigger={<IconButton name="ellipsis" label={`List actions for ${name}`} tooltip="List actions" tooltipSide="bottom-end" size={28} className="td-list-more" />}
          name={name}
          activeIcon={icon}
          statusRole={statusRole}
          onStatusRoleChange={onStatusRoleChange}
          onManageLinks={onManageLinks}
          onStartRename={rename.startRename}
          onIconChange={onIconChange}
          onSelectAll={onSelectAll}
          onHide={onHide}
        />
      </div>
      <div className="td-list-cards" tabIndex={0} role="list" aria-label={`${name} cards`}>
        {children}
      </div>
      {adding ? (
        <div className="td-list-composer">
          <QuickAddInput {...quickAdd} placeholder="Item title" aria-label={`New item in ${name}`} onSubmit={(p) => commitAdd(p, true)} onCancel={() => setAdding(false)} onBlur={(p) => commitAdd(p, false)} />
        </div>
      ) : (
        <div className="td-list-foot">
          <button type="button" className="td-list-add" data-add-item={name} onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} />
            Add an item
          </button>
        </div>
      )}
    </div>
  );
}
