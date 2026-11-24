// GroupMenu — the Group action's panel (List view): one radio group None · Status · Priority · Assignee · Label · Due
// (GROUP_OPTIONS) and, while a group is picked, "Show empty groups" and "Collapse all groups". Rows are the Sort menu's
// (td-sort-menu-*), so both themes style them once. Body of the SubNavbar's toolbar-tier Popover, which owns
// positioning, outside-close, Escape and focus return; the menu stays open on a pick. Spec: DESIGN.md › Group by.
import { useId } from "react";

import { Button } from "../core/Button";
import { CheckboxBox } from "../core/Checkbox";
import { Icon } from "../core/Icon";
import { GROUP_OPTIONS, type GroupKey } from "./viewState";
import "./SortMenu.css";
import "./GroupMenu.css";

export interface GroupMenuProps {
  /** The picked group, or null for None (the lists show) */
  group?: GroupKey | null;
  /** A radio row was picked: "none" or a GroupKey. The host stores `key === "none" ? null : key`. */
  onSelect?: (key: "none" | GroupKey) => void;
  /** "Reset" in the head (shown while a group is picked) */
  onReset?: () => void;
  /** Keep groups without items @default false */
  showEmpty?: boolean;
  onShowEmptyChange?: (showEmpty: boolean) => void;
  /** Every group is collapsed — the row then reads "Expand all groups" */
  allCollapsed?: boolean;
  /** Renders the "Collapse all groups" / "Expand all groups" row; called with the new collapsed state */
  onCollapseAll?: (collapsed: boolean) => void;
  /** Rows cannot be picked (Board and Calendar: groups only show in List view). Pair with `note`. */
  disabled?: boolean;
  /** One line under the head saying why, e.g. "Groups show in List view." */
  note?: string;
  /** Renders "Open List view" beside the note */
  onOpenList?: () => void;
  /** Rows that cannot be picked in this project, with the reason shown as the row's hint: {label: "No labels yet"} */
  unavailable?: Partial<Record<GroupKey, string>>;
}

export function GroupMenu({ group = null, onSelect, onReset, showEmpty = false, onShowEmptyChange, allCollapsed = false, onCollapseAll, disabled = false, note, onOpenList, unavailable = {} }: GroupMenuProps) {
  const cur = group ?? "none";
  const picked = !!group && !disabled;
  const sectionId = useId();
  return (
    <div className="td-sort-menu td-group-menu" role="group" aria-label="Group options" data-group-key={cur} data-disabled={disabled ? "true" : undefined}>
      <div className="td-sort-menu-head">
        <Icon name="layers" size={16} />
        <span className="td-sort-menu-title">Group</span>
        {picked && onReset ? (
          <Button variant="chrome" className="td-sort-menu-reset" onClick={onReset}>
            Reset
          </Button>
        ) : null}
      </div>
      {note ? (
        <div className="td-group-menu-note" role="note">
          <span>{note}</span>
          {onOpenList ? (
            <button type="button" className="td-group-menu-link" onClick={onOpenList}>
              Open List view
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="td-sort-menu-scroll">
        <div className="td-sort-menu-section" id={sectionId}>
          Group items by
        </div>
        <div role="radiogroup" aria-labelledby={sectionId}>
          {GROUP_OPTIONS.map((o) => {
            const on = o.key === cur;
            const why = o.key === "none" ? undefined : unavailable[o.key];
            return (
              <button key={o.key} type="button" className="td-sort-menu-row" role="radio" aria-checked={on} disabled={disabled || !!why} data-group-key={o.key} onClick={() => onSelect?.(o.key)}>
                <span className="td-sort-menu-check">{on ? <Icon name="check" size={15} color="var(--text-link)" /> : null}</span>
                <Icon name={o.icon} size={14} color="var(--ink-600)" />
                <span className="td-sort-menu-label">{o.label}</span>
                {why || o.hint ? <span className="td-sort-menu-hint">{why ?? o.hint}</span> : null}
              </button>
            );
          })}
        </div>
        {picked ? (
          <>
            <div className="td-group-menu-divider" role="separator" />
            {/* The row is the checkbox (role, aria-checked); the box is its drawn mark, never a second control */}
            <button type="button" className="td-sort-menu-row" role="checkbox" aria-checked={showEmpty} data-group-option="show-empty" onClick={() => onShowEmptyChange?.(!showEmpty)}>
              <span className="td-sort-menu-check">
                <CheckboxBox on={showEmpty} />
              </span>
              <span className="td-sort-menu-label">Show empty groups</span>
            </button>
            {onCollapseAll ? (
              <button type="button" className="td-sort-menu-row" data-group-option="collapse-all" onClick={() => onCollapseAll(!allCollapsed)}>
                <span className="td-sort-menu-check">
                  <Icon name={allCollapsed ? "chevron-down" : "chevron-right"} size={14} color="var(--ink-600)" />
                </span>
                <span className="td-sort-menu-label">{allCollapsed ? "Expand all groups" : "Collapse all groups"}</span>
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
