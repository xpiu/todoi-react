// FilterMenu — the Filter action's panel: a search field, one section per filter type, checkbox rows
// with a swatch or glyph and a mono match count. Body of a toolbar-tier Popover. Spec: DESIGN.md › Filtering.
import { useRef, useState } from "react";

import { Button } from "../core/Button";
import { Checkbox } from "../core/Checkbox";
import { Icon, type IconName } from "../core/Icon";
import "./FilterMenu.css";

export interface FilterMenuOption {
  type: string;
  value: string;
  color?: string;
  icon?: IconName;
  iconColor?: string;
}

export interface FilterMenuProps {
  /** [section label, filter type] in display order */
  sections: ReadonlyArray<[string, string]>;
  available: FilterMenuOption[];
  filters: Array<{ type: string; value: string }>;
  /** Match counts keyed "type:value" */
  counts?: Record<string, number>;
  onToggle: (f: FilterMenuOption) => void;
  onClear?: () => void;
}

const key = (f: { type: string; value: string }) => `${f.type}:${f.value}`;

export function FilterMenu({ sections, available, filters, counts = {}, onToggle, onClear }: FilterMenuProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive = (f: FilterMenuOption) => filters.some((a) => a.type === f.type && a.value === f.value);
  const q = query.trim().toLowerCase();
  const groups = sections.map(([label, type]) => ({ label, rows: available.filter((f) => f.type === type && (!q || f.value.toLowerCase().includes(q) || label.toLowerCase().includes(q))) })).filter((s) => s.rows.length);
  return (
    <div className="td-fm" role="group" aria-label="Filter options">
      <div className="td-fm-head">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          className="td-fm-search"
          type="text"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears the query first; a second Escape reaches the Popover and closes it.
            if (e.key === "Escape" && query) {
              e.stopPropagation();
              setQuery("");
            }
          }}
          placeholder="Search filters…"
          aria-label="Search filter options"
        />
        {filters.length && onClear ? (
          <Button variant="chrome" className="td-fm-clear" onClick={onClear}>
            Clear all
          </Button>
        ) : null}
      </div>
      <div className="td-fm-scroll">
        {groups.map((s) => (
          <div key={s.label} role="group" aria-label={s.label}>
            <div className="td-fm-sec">{s.label}</div>
            {s.rows.map((f) => (
              <div
                key={key(f)}
                className="td-fm-row"
                role="checkbox"
                tabIndex={0}
                aria-label={f.value}
                aria-checked={isActive(f)}
                onClick={() => onToggle(f)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    onToggle(f);
                  }
                }}
              >
                {/* The row is the control; the Checkbox inside is only its visual */}
                <span className="td-fm-check" inert aria-hidden>
                  <Checkbox checked={isActive(f)} aria-label={f.value} />
                </span>
                {f.type === "label" ? <span className="td-fm-dot" style={{ background: f.color }} /> : <Icon name={f.icon ?? "clock"} size={14} color={f.iconColor ?? "var(--ink-600)"} />}
                <span className="td-fm-label">{f.value}</span>
                <span className="td-fm-count">{counts[key(f)] ?? 0}</span>
              </div>
            ))}
          </div>
        ))}
        {q && !groups.length ? <div className="td-fm-empty">No filters match “{query}”</div> : null}
      </div>
    </div>
  );
}
