// ListSection — one list as a grouped section: header (icon → IconPicker, name, count, hover + and ⋯,
// collapse chevron) over a white block of ListRows ending in the "Add an item" ghost row that becomes
// the quick-add field. Spec: DESIGN.md › List view.
import { useState, type CSSProperties, type ReactNode } from "react";

import type { ItemStatus } from "../../../shared/item-status";
import { ListActionsMenu } from "../board/ListActionsMenu";
import { listIconFor } from "../board/listIcons";
import { Icon, type IconName } from "../core/Icon";
import { IconPicker } from "../core/IconPicker";
import { MenuPopover } from "../core/Menu";
import { Popover, usePopover } from "../core/Popover";
import type { QuickAddOptions, QuickAddResult } from "../core/quickAdd";
import { QuickAddInput } from "../core/QuickAddInput";
import "./ListSection.css";

export type AddPosition = "top" | "bottom";

export interface ListSectionProps {
  name: string;
  count?: number;
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

export function ListSection({ name, count, icon, iconColor, statusRole, onStatusRoleChange, onManageLinks, onAddItem, quickAdd, showAddRow = true, showHeader = true, defaultCollapsed = false, onRename, onIconChange, onSelectAll, onHide, actions, menu = true, collapsible = true, children, style }: ListSectionProps) {
  const auto = listIconFor(name);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<AddPosition | false>(false);
  const ipop = usePopover();
  const override = icon ?? null;
  const commitRename = () => {
    const v = draft.trim();
    setRenaming(false);
    if (v && v !== name) onRename?.(v);
  };
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
    <section className={collapsed && showHeader ? "td-lsec td-lsec-collapsed" : "td-lsec"} data-list-name={name} style={style}>
      {showHeader ? (
        <div className="td-lsec-head">
          <Popover open={ipop.open} onOpenChange={ipop.setOpen} placement="bottom-start" offset={2} minWidth={0} role="dialog" aria-label={`Icon for ${name}`} trigger={<button type="button" className="td-lsec-iconbtn td-tip" data-tip="Change icon" aria-label={`Change icon for ${name}`}><Icon name={override ?? auto.icon} size={18} color={iconColor ?? auto.color} /></button>}>
            <IconPicker
              value={override}
              autoIcon={auto.icon}
              onChange={(n) => {
                onIconChange?.(n);
                ipop.close();
              }}
            />
          </Popover>
          {renaming ? (
            <input
              className="td-lsec-rename"
              value={draft}
              autoFocus
              aria-label="List name"
              onFocus={(e) => e.target.select()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <span className="td-lsec-name">{name}</span>
          )}
          {!renaming && count != null ? <span className="td-lsec-count">{count}</span> : null}
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
            <button type="button" className="td-lsec-addbtn td-tip" data-tip={adding === "top" ? "Hide add row" : "Add an item"} aria-label={adding === "top" ? "Hide add row" : "Add an item"} aria-pressed={adding === "top"} data-add-item={name} onMouseDown={(e) => e.preventDefault()} onClick={() => startAdd("top")}>
              <Icon name="plus" size={16} />
            </button>
            {menu ? (
              <MenuPopover label={`List actions for ${name}`} placement="bottom-end" trigger={<button type="button" className="td-lsec-more td-tip" data-tip="List actions" data-tip-side="bottom-end" aria-label={`List actions for ${name}`}><Icon name="ellipsis" size={16} /></button>}>
                {(close) => (
                  <ListActionsMenu
                    name={name}
                    activeIcon={override}
                    statusRole={statusRole}
                    onStatusRoleChange={onStatusRoleChange}
                    onManageLinks={onManageLinks}
                    onClose={close}
                    onStartRename={() => {
                      setDraft(name);
                      setRenaming(true);
                    }}
                    onIconChange={onIconChange}
                    onSelectAll={onSelectAll}
                    onHide={onHide}
                  />
                )}
              </MenuPopover>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="td-lsec-fold" data-collapsed={collapsed && showHeader ? "true" : "false"} aria-hidden={collapsed && showHeader} inert={collapsed && showHeader ? true : undefined}>
        <div className="td-lsec-fold-in">
          <div className="td-lsec-body" data-flush={showHeader ? undefined : "true"}>
            {adding === "top" ? addRow : null}
            {children}
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
