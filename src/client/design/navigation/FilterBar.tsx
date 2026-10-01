// FilterBar — the chip row under the SubNavbar: active filters always show here (the view never
// silently looks empty), quick-toggle chips for labels and Overdue, the sort summary, and
// "Clear filters". Spec: DESIGN.md › Filtering.
import { FilterChip } from "../board/FilterChip";
import { Icon, type IconName } from "../core/Icon";
import "./FilterBar.css";

export interface FilterBarChip {
  type: string;
  value: string;
  color?: string;
  icon?: IconName;
  selected: boolean;
}
export interface FilterBarProps {
  chips: FilterBarChip[];
  /** "Items by Due date · Soonest first" pills */
  sorts?: Array<{ dim: string; label: string }>;
  onToggle: (chip: FilterBarChip) => void;
  onClearFilters?: () => void;
  onClearSort?: (dim: string) => void;
  /** Number of items the filters hide, for the quiet count */
  hidden?: number;
}

export function FilterBar({ chips, sorts = [], onToggle, onClearFilters, onClearSort, hidden }: FilterBarProps) {
  const active = chips.filter((c) => c.selected).length;
  return (
    <div className="td-fbar" role="group" aria-label="Filters and sort">
      <span className="td-fbar-lead">
        <Icon name="filter" size={14} />
      </span>
      {chips.map((c) => (
        <FilterChip key={`${c.type}:${c.value}`} value={c.value} category={c.type === "label" || c.type === "due" ? undefined : c.type} color={c.color} icon={c.icon} selected={c.selected} onClick={() => onToggle(c)} onRemove={() => onToggle(c)} />
      ))}
      {sorts.map((s) => (
        <FilterChip key={`sort:${s.dim}`} value={s.label} icon="arrow-up-narrow-wide" selected onRemove={() => onClearSort?.(s.dim)} />
      ))}
      {active ? (
        <button type="button" className="td-fbar-clear" onClick={onClearFilters}>
          Clear filters
          <kbd className="td-fbar-kbd">X</kbd>
        </button>
      ) : null}
      {active && hidden ? <span className="td-fbar-count">{hidden} hidden</span> : null}
    </div>
  );
}
