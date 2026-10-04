// FilterBar — the "Filter by" row under the SubNavbar. While the Filter menu is open it shows every
// quick option as a chip (active ones selected); once it closes, only the active ones — so the view
// never silently looks empty. Hidden when the menu is closed and nothing is filtered.
// Spec: DESIGN.md › Subnavbar rows.
import { FilterChip } from "../board/FilterChip";
import type { IconName } from "../core/Icon";
import { ChipBar, ChipBarAction } from "./ChipBar";

export interface FilterBarOption {
  type: string;
  value: string;
  color?: string;
  icon?: IconName;
}
export interface FilterBarProps {
  /** The Filter menu is open */
  open: boolean;
  /** Chips offered while open (the quick filters plus anything active) */
  available: FilterBarOption[];
  filters: ReadonlyArray<{ type: string; value: string }>;
  onToggle: (f: FilterBarOption) => void;
  /** "Reset filters": clears them and closes the menu */
  onClear: () => void;
}

export function FilterBar({ open, available, filters, onToggle, onClear }: FilterBarProps) {
  const isOn = (f: FilterBarOption) => filters.some((a) => a.type === f.type && a.value === f.value);
  if (!open && !filters.length) return null;
  const shown = open ? available : available.filter(isOn);
  return (
    <ChipBar label="Filter by" icon="filter" aria-label="Filters" moreLabel="More filters" backLabel="Previous filters" actions={<ChipBarAction icon="x" active={filters.length > 0} onClick={onClear}>Reset filters</ChipBarAction>}>
      {shown.map((f) => (
        <FilterChip key={`${f.type}:${f.value}`} value={f.value} category={f.type === "label" ? "label" : undefined} color={f.color} icon={f.icon} selected={isOn(f)} onClick={() => onToggle(f)} onRemove={() => onToggle(f)} />
      ))}
    </ChipBar>
  );
}
