// List grouping inside the Sort popover. The disclosure shows the current key even when closed.
import { Collapsible } from "@base-ui/react/collapsible";
import { useId } from "react";

import { CheckboxBox } from "../core/Checkbox";
import { Icon } from "../core/Icon";
import { GROUP_OPTIONS, type GroupKey } from "./viewState";
import "./GroupOptions.css";

interface GroupOptionsProps {
  group: GroupKey | null;
  onSelect: (key: "none" | GroupKey) => void;
  showEmpty: boolean;
  onShowEmptyChange: (showEmpty: boolean) => void;
  allCollapsed: boolean;
  onCollapseAll: (collapsed: boolean) => void;
}

export function GroupOptions({ group, onSelect, showEmpty, onShowEmptyChange, allCollapsed, onCollapseAll }: GroupOptionsProps) {
  const current = group ?? "none";
  const labelId = useId();
  return (
    <Collapsible.Root className="td-group-options">
      <Collapsible.Trigger className="td-sort-menu-row td-group-options-trigger">
        <Icon name="layers" size={16} />
        <span className="td-sort-menu-label" id={labelId}>Group items by</span>
        <span className="td-sort-menu-hint">{GROUP_OPTIONS.find((option) => option.key === current)?.label}</span>
        <Icon name="chevron-down" size={14} className="td-group-options-chevron" />
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <div role="radiogroup" aria-labelledby={labelId}>
          {GROUP_OPTIONS.map((option) => {
            const selected = option.key === current;
            return (
              <button key={option.key} type="button" className="td-sort-menu-row" role="radio" aria-checked={selected} onClick={() => onSelect(option.key)}>
                <span className="td-sort-menu-check">{selected ? <Icon name="check" size={15} color="var(--text-link)" /> : null}</span>
                <Icon name={option.icon} size={14} color="var(--ink-600)" />
                <span className="td-sort-menu-label">{option.label}</span>
                {option.hint ? <span className="td-sort-menu-hint">{option.hint}</span> : null}
              </button>
            );
          })}
        </div>
        {group ? (
          <>
            <button type="button" className="td-sort-menu-row" role="checkbox" aria-checked={showEmpty} onClick={() => onShowEmptyChange(!showEmpty)}>
              <span className="td-sort-menu-check"><CheckboxBox on={showEmpty} /></span>
              <span className="td-sort-menu-label">Show empty groups</span>
            </button>
            <button type="button" className="td-sort-menu-row" onClick={() => onCollapseAll(!allCollapsed)}>
              <span className="td-sort-menu-check"><Icon name={allCollapsed ? "chevron-down" : "chevron-right"} size={14} color="var(--ink-600)" /></span>
              <span className="td-sort-menu-label">{allCollapsed ? "Expand all groups" : "Collapse all groups"}</span>
            </button>
          </>
        ) : null}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
