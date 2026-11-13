// SortMenu — the Sort action's panel: "Sort lists" and "Sort items" radio groups; picking the active
// key reverses it (the direction label says which way). Body of a toolbar-tier Popover.
import { Button } from "../core/Button";
import { Icon, type IconName } from "../core/Icon";
import "./SortMenu.css";

export interface SortMenuOption {
  key: string;
  label: string;
  icon: IconName;
  dirs?: { asc: string; desc: string };
  hint?: string;
}
export interface SortMenuSpec {
  key: string;
  dir: "asc" | "desc";
}
export interface SortMenuProps {
  /** [section label, dimension] */
  sections: ReadonlyArray<[string, string]>;
  options: Record<string, SortMenuOption[]>;
  sort: Record<string, SortMenuSpec | null>;
  onSelect: (dim: string, key: string) => void;
  onReset?: () => void;
}

export function SortMenu({ sections, options, sort, onSelect, onReset }: SortMenuProps) {
  const anyActive = Object.values(sort).some(Boolean);
  return (
    <div className="td-sort-menu" role="group" aria-label="Sort options">
      <div className="td-sort-menu-head">
        <Icon name="arrow-up-narrow-wide" size={16} />
        <span className="td-sort-menu-title">Sort</span>
        {anyActive && onReset ? (
          <Button variant="chrome" className="td-sort-menu-reset" onClick={onReset}>
            Reset
          </Button>
        ) : null}
      </div>
      <div className="td-sort-menu-scroll">
        {sections.map(([label, dim]) => (
          <div key={dim}>
            <div className="td-sort-menu-section">{label}</div>
            <div role="radiogroup" aria-label={label}>
              {(options[dim] ?? []).map((o) => {
                const cur = sort[dim] ?? null;
                const isOn = o.key === "none" ? !cur : cur?.key === o.key;
                const dirLabel = isOn && cur && o.dirs ? o.dirs[cur.dir] : null;
                return (
                  <button key={o.key} type="button" className="td-sort-menu-row" role="radio" aria-checked={isOn} title={isOn && cur ? "Click to reverse order" : undefined} onClick={() => onSelect(dim, o.key)}>
                    <span className="td-sort-menu-check">{isOn ? <Icon name="check" size={15} color="var(--text-link)" /> : null}</span>
                    <Icon name={o.icon} size={14} color="var(--ink-600)" />
                    <span className="td-sort-menu-label">{o.label}</span>
                    {dirLabel && cur ? (
                      <span className="td-sort-menu-direction">
                        {dirLabel}
                        <Icon name={cur.dir === "asc" ? "arrow-up" : "arrow-down"} size={12} />
                      </span>
                    ) : o.hint ? (
                      <span className="td-sort-menu-hint">{o.hint}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
