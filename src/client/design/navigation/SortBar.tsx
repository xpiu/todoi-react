// SortBar — the "Sort by" row under the FilterBar. While the Sort menu is open it shows every option
// per dimension ("Lists: Name", "Items: Due date"); once it closes, only the active ones, so the view
// never looks silently reordered. The active chip's arrow shows the direction; removing it resets
// that dimension. Spec: DESIGN.md › Subnavbar rows.
import { FilterChip } from "../board/FilterChip";
import { ChipBar, ChipBarAction } from "./ChipBar";
import type { SortMenuOption, SortMenuSpec } from "./SortMenu";

export interface SortBarProps {
  /** The Sort menu is open */
  open: boolean;
  /** [chip prefix, dimension], e.g. ["Lists", "lists"] */
  dims: ReadonlyArray<[string, string]>;
  options: Record<string, SortMenuOption[]>;
  sort: Record<string, SortMenuSpec | null>;
  onSelect: (dim: string, key: string) => void;
  onReset: () => void;
}

export function SortBar({ open, dims, options, sort, onSelect, onReset }: SortBarProps) {
  const active = dims.some(([, d]) => sort[d]);
  if (!open && !active) return null;
  return (
    <ChipBar label="Sort by" icon="arrow-up-narrow-wide" aria-label="Sorting" moreLabel="More sort options" backLabel="Previous sort options" actions={<ChipBarAction icon="x" active={active} onClick={onReset}>Reset sorting</ChipBarAction>}>
      {dims.flatMap(([prefix, dim]) => {
        const cur = sort[dim] ?? null;
        const shown = (options[dim] ?? []).filter((o) => open || cur?.key === o.key);
        return shown.map((o) => {
          const on = o.key === "none" ? !cur : cur?.key === o.key;
          const icon = on && cur ? (cur.dir === "asc" ? "arrow-up-narrow-wide" : "arrow-down-wide-narrow") : o.icon;
          return <FilterChip key={`${dim}:${o.key}`} value={o.label} category={prefix} icon={icon} selected={on} onClick={() => onSelect(dim, o.key)} onRemove={() => onSelect(dim, "none")} />;
        });
      })}
    </ChipBar>
  );
}
