// ListSection — one list as a grouped section: header (icon → IconPicker, name, count, hover + and ⋯,
// collapse chevron) over a white block of ListRows ending in the "Add an item" ghost row that becomes
// the quick-add field. Spec: DESIGN.md › List view.
import { useState, type CSSProperties, type ReactNode } from "react";

import type { ItemStatus } from "../../../shared/item-status";
import { ListActionsPopover, ListIconButton, useListRename } from "../board/listHeader";
import { Icon, type IconName } from "../core/Icon";
import type { QuickAddOptions, QuickAddResult } from "../core/quickAdd";
import { QuickAddInput } from "../core/QuickAddInput";
import "./ListSection.css";

export type AddPosition = "top" | "bottom";

export interface ListSectionProps {
  name: string;
  count?: number | string;
  /** Explicit icon override; omit for the automatic name-derived icon */
  icon?: IconName | null;
  iconColor?: string;
  statusRole?: ItemStatus | null;
  onStatusRoleChange?: (role: ItemStatus | null) => void;
  onManageLinks?: () => void;
  /** The quick-add field committed: the parsed title plus the full parse and where it goes */
  onAddItem?: (title: string, parsed: QuickAddResult, position: AddPosition) => void;
  quickAdd?: QuickAddOptions;
  onRename?: (name: string) => void;
  onIconChange?: (icon: IconName | null) => void;
  onSelectAll?: () => void;
  onHide?: () => void;
  /** Identifies the section for drop handlers (data-list-id) */
  listId?: string;
  /** @default true */
  showAddRow?: boolean;
  /** @default true — false for a lone list with its own page title (Inbox) */
  showHeader?: boolean;
  /** Always-visible header controls (the Inbox's "Mark all read") */
  actions?: ReactNode;
  /** @default true */
  menu?: boolean;
  /** @default true */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function ListSection({ listId, name, count, icon, iconColor, statusRole, onStatusRoleChange, onManageLinks, onAddItem, quickAdd, showAddRow = true, showHeader = true, defaultCollapsed = false, onRename, onIconChange, onSelectAll, onHide, actions, menu = true, collapsible = true, children, style }: ListSectionProps) {
  const rename = useListRename(name, onRename);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [adding, setAdding] = useState<AddPosition | false>(false);
  const startAdd = (where: AddPosition) => {
    if (adding === where) {
      setAdding(false);
      return;
    }
    setCollapsed(false);
    setAdding(where);
  };
  const commitAdd = (parsed: QuickAddResult, keep: boolean) => {
    if (parsed.title) onAddItem?.(parsed.title, parsed, adding || "bottom");
    if (!keep) setAdding(false);
  };
  const addRow = (
    <div className="td-lsec-addrow">
      <span className="td-lsec-plus">
        <Icon name="plus" size={18} />
      </span>
      <QuickAddInput {...quickAdd} placeholder="Add an item" aria-label={`New item in ${name}`} onSubmit={(p) => commitAdd(p, true)} onCancel={() => setAdding(false)} onBlur={(p) => commitAdd(p, false)} />
    </div>
  );
  return (
    <section className={collapsed && showHeader ? "td-lsec td-lsec-collapsed" : "td-lsec"} data-list-name={name} data-list-id={listId} style={style}>
      {showHeader ? (
        <div className="td-lsec-head">
          <ListIconButton name={name} icon={icon} iconColor={iconColor} onIconChange={onIconChange} className="td-lsec-iconbtn" size={18} />
          {rename.renaming ? <input className="td-lsec-rename" {...rename.inputProps} /> : <span className="td-lsec-name">{name}</span>}
          {!rename.renaming && count != null ? <span className="td-lsec-count">{count}</span> : null}
          {actions ? (
            <div className="td-lsec-extra" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          ) : null}
          <div className="td-lsec-actions">
            {collapsible ? (
              <button type="button" className="td-lsec-chev" aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`} onClick={() => setCollapsed((c) => !c)}>
                <Icon name="chevron-down" size={16} />
              </button>
            ) : null}
            {/* A toggle with one name: aria-pressed says whether the top add row is open. */}
            <button type="button" className="td-lsec-addbtn td-tip" data-tip={adding === "top" ? "Hide add row" : "Add an item"} aria-label={`Add an item at the top of ${name}`} aria-pressed={adding === "top"} data-add-item={name} onMouseDown={(e) => e.preventDefault()} onClick={() => startAdd("top")}>
              <Icon name="plus" size={16} />
            </button>
            {menu ? (
              <ListActionsPopover
                label={`List actions for ${name}`}
                trigger={<button type="button" className="td-lsec-more td-tip" data-tip="List actions" data-tip-side="bottom-end" aria-label={`List actions for ${name}`}><Icon name="ellipsis" size={16} /></button>}
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
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="td-lsec-fold" data-collapsed={collapsed && showHeader ? "true" : "false"} aria-hidden={collapsed && showHeader} inert={collapsed && showHeader ? true : undefined}>
        <div className="td-lsec-fold-in">
          <div className="td-lsec-body" data-flush={showHeader ? undefined : "true"}>
            {adding === "top" ? addRow : null}
            <div className="td-lsec-rows" role="list" aria-label={`${name} items`}>
              {children}
            </div>
            {!showAddRow ? null : adding === "bottom" ? (
              addRow
            ) : (
              <button type="button" className="td-lsec-add" data-add-item={name} onClick={() => startAdd("bottom")}>
                <span className="td-lsec-plus">
                  <Icon name="plus" size={18} />
                </span>
                Add an item
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
