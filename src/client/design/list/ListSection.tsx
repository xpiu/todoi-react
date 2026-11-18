// ListSection — one list as a grouped section: header (icon → IconPicker, name, count, hover + and ⋯,
// collapse chevron) over a white block of ListRows ending in the "Add an item" ghost row that becomes
// the quick-add field. Spec: DESIGN.md › List view.
import { useState, type CSSProperties, type ReactNode } from "react";

import type { ItemStatus } from "../../../shared/item-status";
import { ListActionsPopover, ListIconButton, useListRename } from "../board/listHeader";
import { useThemePreference } from "../core/appearance";
import { Icon, type IconName } from "../core/Icon";
import { AddItemKey, hintKeysText } from "../core/ShortcutHint";
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
  /** Keep the header + visible without hover. Set for a lone list like the Inbox @default false */
  addVisible?: boolean;
  defaultCollapsed?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function ListSection({ listId, name, count, icon, iconColor, statusRole, onStatusRoleChange, onManageLinks, onAddItem, quickAdd, showAddRow = true, showHeader = true, defaultCollapsed = false, onRename, onIconChange, onSelectAll, onHide, actions, menu = true, collapsible = true, addVisible = false, children, style }: ListSectionProps) {
  const rename = useListRename(name, onRename);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [adding, setAdding] = useState<AddPosition | false>(false);
  const suggestShortcuts = useThemePreference("suggestShortcuts");
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
    <div className="td-list-section-addrow">
      <span className="td-list-section-plus">
        <Icon name="plus" size={18} />
      </span>
      <QuickAddInput {...quickAdd} placeholder="Add an item" aria-label={`New item in ${name}`} onSubmit={(p) => commitAdd(p, true)} onCancel={() => setAdding(false)} onBlur={(p) => commitAdd(p, false)} />
    </div>
  );
  return (
    <section className={collapsed && showHeader ? "td-list-section td-list-section-collapsed" : "td-list-section"} data-list-name={name} data-list-id={listId} data-add-visible={addVisible ? "true" : undefined} style={style}>
      {showHeader ? (
        <div className="td-list-section-head">
          <ListIconButton name={name} icon={icon} iconColor={iconColor} onIconChange={onIconChange} className="td-list-section-iconbtn" size={18} />
          {rename.renaming ? <input className="td-list-section-rename" {...rename.inputProps} /> : <span className="td-list-section-name">{name}</span>}
          {!rename.renaming && count != null ? <span className="td-list-section-count">{count}</span> : null}
          {actions ? (
            <div className="td-list-section-extra" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          ) : null}
          <div className="td-list-section-actions">
            {collapsible ? (
              <button type="button" className="td-list-section-chevron" aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`} onClick={() => setCollapsed((c) => !c)}>
                <Icon name="chevron-down" size={16} />
              </button>
            ) : null}
            {/* A toggle with one name: aria-pressed says whether the top add row is open. */}
            <button type="button" className="td-list-section-addbtn td-tooltip" data-tip={adding === "top" ? "Hide add row" : "Add an item"} data-tip-side={menu ? undefined : "bottom-end"} data-tip-kbd={suggestShortcuts && adding !== "top" ? hintKeysText("add-item") : undefined} aria-label={`Add an item at the top of ${name}`} aria-pressed={adding === "top"} data-add-item={name} onMouseDown={(e) => e.preventDefault()} onClick={() => startAdd("top")}>
              <Icon name="plus" size={16} />
            </button>
            {menu ? (
              <ListActionsPopover
                label={`List actions for ${name}`}
                trigger={<button type="button" className="td-list-section-more td-tooltip" data-tip="List actions" data-tip-side="bottom-end" aria-label={`List actions for ${name}`}><Icon name="ellipsis" size={16} /></button>}
                name={name}
                activeIcon={icon}
                statusRole={statusRole}
                onStatusRoleChange={onStatusRoleChange}
                onManageLinks={onManageLinks}
                onStartRename={rename.startRename}
                onIconChange={onIconChange}
                onSelectAll={onSelectAll}
                onHide={onHide}
                onAddItem={onAddItem ? () => startAdd("top") : undefined}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="td-list-section-fold" data-collapsed={collapsed && showHeader ? "true" : "false"} aria-hidden={collapsed && showHeader} inert={collapsed && showHeader ? true : undefined}>
        <div className="td-list-section-fold-in">
          <div className="td-list-section-body" data-flush={showHeader ? undefined : "true"}>
            {adding === "top" ? addRow : null}
            <div className="td-list-section-rows" role="list" aria-label={`${name} items`}>
              {children}
            </div>
            {!showAddRow ? null : adding === "bottom" ? (
              addRow
            ) : (
              <button type="button" className="td-list-section-add" data-add-item={name} onClick={() => startAdd("bottom")}>
                <span className="td-list-section-plus">
                  <Icon name="plus" size={18} />
                </span>
                Add an item
                <AddItemKey />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
