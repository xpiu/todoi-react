// ListSection — one list as a grouped section: header (icon → IconPicker, name, count, hover + and ⋯,
// collapse chevron) over a white block of ListRows ending in the "Add an item" ghost row that becomes
// the quick-add field. With `groupId` it is one group of the grouped List view (ListGroups): the header
// leads with `lead` (GroupLead), always shows its count and chevron, and shows the drop cue the host passes.
// Spec: DESIGN.md › List view, Group by.
import { useState, type CSSProperties, type ReactNode } from "react";

import type { ItemStatus } from "../../../shared/item-status";
import { ListActionsPopover, ListIconButton, useListRename } from "../board/listHeader";
import { useThemePreference } from "../core/appearance";
import { Avatar } from "../core/Avatar";
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
  /** Group sections (ListGroups): sets data-group-id; the header then always shows its count and chevron, and the +
   * only when onAddItem is given. Pair with `lead`, `menu={false}` and `showAddRow={false}`. */
  groupId?: string;
  /** Replaces the list icon button at the start of the header: `<GroupLead group={group} />` */
  lead?: ReactNode;
  /** Controlled collapsed state; omit for the local state seeded by defaultCollapsed */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** While an item is dragged over the section: "accept" draws the drop ring, "refuse" a not-allowed cursor and `dropNote` */
  dropState?: "accept" | "refuse";
  /** Why the section refuses the dragged item, e.g. "This week covers several days. Open the item to pick a date." */
  dropNote?: string;
  /** One grey line under the (empty) rows, e.g. "No items" in an empty group */
  empty?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

/** What leads a group header (Design: ListSection GroupLead): the member's avatar, the label's swatch, or the group's glyph */
export interface GroupLeadSpec {
  avatar?: { name: string; src?: string; color?: string };
  /** Label swatch colour */
  color?: string;
  icon?: IconName;
  iconColor?: string;
}

/** The decorative glyph at the start of a group header: a 20px Avatar, a 12px label swatch, else an 18px glyph. The name beside it is the label. */
export function GroupLead({ group }: { group: GroupLeadSpec }) {
  return (
    <span className="td-list-section-lead" aria-hidden="true">
      {group.avatar ? <Avatar name={group.avatar.name} src={group.avatar.src} color={group.avatar.color} size={20} decorative /> : group.color ? <span className="td-list-section-swatch" style={{ background: group.color }} /> : <Icon name={group.icon ?? "circle"} size={18} color={group.iconColor ?? "var(--ink-600)"} />}
    </span>
  );
}

export function ListSection({ listId, name, count, icon, iconColor, statusRole, onStatusRoleChange, onManageLinks, onAddItem, quickAdd, showAddRow = true, showHeader = true, defaultCollapsed = false, groupId, lead, collapsed: collapsedProp, onCollapsedChange, dropState, dropNote, empty, onRename, onIconChange, onSelectAll, onHide, actions, menu = true, collapsible = true, addVisible = false, children, style }: ListSectionProps) {
  const rename = useListRename(name, onRename);
  // Controlled when `collapsed` is passed (group sections: the host keeps it per device), else local.
  const [ownCollapsed, setOwnCollapsed] = useState(defaultCollapsed);
  const collapsed = collapsedProp ?? ownCollapsed;
  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) setOwnCollapsed(next);
    if (next !== collapsed) onCollapsedChange?.(next);
  };
  const isGroup = groupId != null;
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
    <section className={collapsed && showHeader ? "td-list-section td-list-section-collapsed" : "td-list-section"} data-list-name={name} data-list-id={listId} data-group-id={groupId} data-drop={dropState} data-add-visible={addVisible ? "true" : undefined} style={style}>
      {showHeader ? (
        <div className="td-list-section-head">
          {lead ?? <ListIconButton name={name} icon={icon} iconColor={iconColor} onIconChange={onIconChange} className="td-list-section-iconbtn" size={18} />}
          {rename.renaming ? <input className="td-list-section-rename" {...rename.inputProps} /> : <span className="td-list-section-name">{name}</span>}
          {!rename.renaming && count != null ? <span className="td-list-section-count">{count}</span> : null}
          {/* A group that cannot take the dragged item says why, in place (the host announces it when the drag ends there) */}
          {dropState === "refuse" && dropNote ? (
            <span className="td-list-section-dropnote">
              <Icon name="ban" size={14} />
              <span>{dropNote}</span>
            </span>
          ) : null}
          {actions ? (
            <div className="td-list-section-extra" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          ) : null}
          <div className="td-list-section-actions">
            {collapsible ? (
              <button type="button" className="td-list-section-chevron" aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`} onClick={() => setCollapsed(!collapsed)}>
                <Icon name="chevron-down" size={16} />
              </button>
            ) : null}
            {/* A toggle with one name: aria-pressed says whether the top add row is open. */}
            {isGroup && !onAddItem ? null : <button type="button" className="td-list-section-addbtn td-tooltip" data-tip={adding === "top" ? "Hide add row" : "Add an item"} data-tip-side={menu ? undefined : "bottom-end"} data-tip-kbd={suggestShortcuts && adding !== "top" ? hintKeysText("add-item") : undefined} aria-label={isGroup ? `Add an item to ${name}` : `Add an item at the top of ${name}`} aria-pressed={adding === "top"} data-add-item={name} onMouseDown={(e) => e.preventDefault()} onClick={() => startAdd("top")}>
              <Icon name="plus" size={16} />
            </button>}
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
            {empty ? <div className="td-list-section-empty">{empty}</div> : null}
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
