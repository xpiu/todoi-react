// IconPicker — the list-icon chooser: a compact basic set with a "…" tile that expands into the
// searchable grouped catalogue, plus an "Automatic" row that drops the override. Renders inside a
// Popover (ListSection) or as the Icon sub-view of the list-actions menu. Spec: DESIGN.md › Icon picker.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { Icon, type IconName } from "./Icon";
import { LUCIDE_ICONS } from "./icons";
import "./Menu.css";
import "./IconPicker.css";

/** The basic set: the status family the automatic name→icon rules use. */
export const LIST_ICON_BASIC: ReadonlyArray<IconName> = ["circle", "circle-dashed", "circle-todo", "circle-dot", "circle-check", "circle-ellipsis", "circle-pause", "circle-alert", "circle-x", "archive", "inbox"];

const CATALOGUE: ReadonlyArray<[string, string[]]> = [
  ["Status", ["circle", "circle-dashed", "circle-todo", "circle-dot", "circle-check", "circle-ellipsis", "circle-pause", "circle-alert", "circle-x", "circle-slash-2", "circle-off", "check-check", "loader", "hourglass", "timer", "clock"]],
  ["Work", ["inbox", "archive", "flag", "milestone", "rocket", "send", "pencil", "eye", "wrench", "hammer", "bug", "test-tube", "shield-check", "git-branch", "package", "truck", "list-todo", "kanban", "layers", "layout-grid", "calendar", "repeat", "target", "trophy"]],
  ["Objects", ["star", "heart", "bookmark", "lightbulb", "sparkle", "zap", "gift", "coffee", "book-open", "file-text", "folder", "mail", "message-square", "phone", "camera", "image", "music", "palette", "megaphone", "globe", "map-pin", "building-2", "briefcase", "shopping-cart", "credit-card", "tag", "hash", "users", "user", "smile", "leaf", "sun", "moon", "cloud", "umbrella", "flame", "snowflake", "anchor", "compass", "plane", "car", "bike", "pin", "bell", "key", "lock", "link", "scissors"]],
];
const known = (n: string): n is IconName => n in LUCIDE_ICONS || n === "circle-todo" || n === "sparkle";
/** [groupLabel, names[]] for the expanded catalogue — only glyphs the icon map carries. */
export const LIST_ICON_GROUPS: ReadonlyArray<[string, IconName[]]> = CATALOGUE.map(([g, names]) => [g, names.filter(known)]);

const LABELS: Record<string, string> = { circle: "None", "circle-dashed": "New", "circle-todo": "To-do", "circle-dot": "Doing", "circle-check": "Done", "circle-ellipsis": "In review", "circle-pause": "On hold", "circle-alert": "Blocked", "circle-x": "Cancelled", "circle-slash-2": "Skipped", "circle-off": "Off", archive: "Backlog", "check-check": "Double check" };
/** Human label for a tile ("circle-dashed" → "New", "book-open" → "Book open"). */
export const iconLabel = (n: string) => LABELS[n] ?? (n.charAt(0).toUpperCase() + n.slice(1)).replace(/-/g, " ");

const TILE_SEL = "button.td-ipk-opt";

export interface IconPickerProps {
  /** The explicit override, or null when the list uses its automatic icon */
  value?: IconName | null;
  /** The icon the list name produces on its own @default "circle" */
  autoIcon?: IconName;
  autoLabel?: string;
  /** Picked name, or null when Automatic is chosen */
  onChange?: (icon: IconName | null) => void;
  /** Start in the expanded, searchable catalogue @default false */
  expanded?: boolean;
  columns?: number;
  style?: CSSProperties;
  className?: string;
}

export function IconPicker({ value, autoIcon = "circle", autoLabel, onChange, expanded: initialExpanded = false, columns, style, className }: IconPickerProps) {
  const [expanded, setExpanded] = useState(!!initialExpanded);
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = value ?? autoIcon;
  const cols = columns ?? (expanded ? 8 : 6);
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);
  const tiles = () => (bodyRef.current ? [...bodyRef.current.querySelectorAll<HTMLElement>(TILE_SEL)] : []);
  const reveal = (el: HTMLElement) => {
    const b = bodyRef.current;
    if (!b || !expanded) return;
    const top = el.offsetTop - b.offsetTop;
    const bot = top + el.offsetHeight;
    if (top < b.scrollTop) b.scrollTop = top - 4;
    else if (bot > b.scrollTop + b.clientHeight) b.scrollTop = bot - b.clientHeight + 4;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") {
      if (e.key === "ArrowDown") {
        const t = tiles()[0];
        if (t) {
          e.preventDefault();
          t.focus();
        }
      }
      return;
    }
    const it = tiles();
    const i = it.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let n: number | null = null;
    if (e.key === "ArrowRight") n = Math.min(i + 1, it.length - 1);
    else if (e.key === "ArrowLeft") n = Math.max(i - 1, 0);
    else if (e.key === "ArrowDown") n = i + cols < it.length ? i + cols : it.length - 1;
    else if (e.key === "ArrowUp") {
      if (i - cols >= 0) n = i - cols;
      else if (expanded && inputRef.current) {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current.focus();
        return;
      } else n = 0;
    } else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = it.length - 1;
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      setQuery((q) => q + e.key);
      if (!expanded) setExpanded(true);
      else inputRef.current?.focus();
      return;
    }
    if (n != null) {
      e.preventDefault();
      e.stopPropagation();
      it[n]!.focus();
      reveal(it[n]!);
    }
  };
  const tile = (n: IconName) => (
    <button key={n} type="button" className="td-ipk-opt" title={iconLabel(n)} aria-label={iconLabel(n)} aria-pressed={n === current} onClick={() => onChange?.(n)}>
      <Icon name={n} size={16} />
    </button>
  );
  const q = query.trim().toLowerCase();
  const match = (n: string) => !q || n.includes(q) || iconLabel(n).toLowerCase().includes(q);
  let body;
  if (!expanded) {
    body = (
      <div className="td-ipk-grid" role="group" aria-label="Basic icons">
        {LIST_ICON_BASIC.map(tile)}
        <button type="button" className="td-ipk-opt td-ipk-more" title="More icons" aria-label="More icons" onClick={() => setExpanded(true)}>
          <Icon name="ellipsis" size={16} />
        </button>
      </div>
    );
  } else {
    const groups = LIST_ICON_GROUPS.map(([g, names]) => [g, names.filter(match)] as const).filter(([, names]) => names.length);
    body = groups.length ? (
      groups.map(([g, names]) => (
        <div key={g}>
          {q ? null : (
            <div className="td-menu-heading" role="presentation">
              {g}
            </div>
          )}
          <div className="td-ipk-grid" role="group" aria-label={g}>
            {names.map(tile)}
          </div>
        </div>
      ))
    ) : (
      <div className="td-ipk-empty">No icons match “{query.trim()}”</div>
    );
  }
  return (
    <div className={["td-ipk", className ?? ""].join(" ").trim()} data-expanded={expanded ? "true" : "false"} role="group" aria-label="List icon" style={style} onKeyDown={onKeyDown}>
      {expanded ? (
        <label className="td-ipk-search">
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search icons"
            aria-label="Search icons"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
        </label>
      ) : null}
      <div ref={bodyRef} className={expanded ? "td-ipk-body" : undefined}>
        {body}
      </div>
      <div className="td-menu-divider" role="separator" />
      <button type="button" className="td-ipk-auto" role="menuitemradio" aria-checked={!value} onClick={() => onChange?.(null)}>
        <span>
          <Icon name={autoIcon} size={15} />
        </span>
        <span className="td-ipk-auto-label">Automatic</span>
        {value ? <span className="td-ipk-auto-trail">{autoLabel ?? iconLabel(autoIcon)}</span> : <Icon name="check" size={14} className="td-ipk-auto-check" />}
      </button>
    </div>
  );
}
