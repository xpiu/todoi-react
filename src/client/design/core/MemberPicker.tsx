// MemberPicker — multi-select people picker: trigger shows an AvatarStack + first names (or the
// placeholder) over a searchable check-row list; assigned people sort first. Value = member ids.
import { useState } from "react";

import { Avatar, AvatarStack } from "./Avatar";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "./Popover";
import "./ItemPicker.css";
import "./MemberPicker.css";

export interface PickableMember {
  id: string;
  name: string;
  nickname?: string | null;
  email?: string | null;
  src?: string;
  color?: string;
}
const first = (n: string) => n.split(/\s+/)[0] ?? n;

export interface MemberPickerProps {
  members: ReadonlyArray<PickableMember>;
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  icon?: IconName;
  tier?: PopoverTier;
  placement?: PopoverPlacement;
  width?: number;
  block?: boolean;
  disabled?: boolean;
  max?: number;
  "aria-label"?: string;
  clearLabel?: string;
}

export function MemberPicker({ members, value, onChange, placeholder = "Assignees", icon = "user-plus", tier = "menu", placement = "bottom-start", width = 248, block, disabled, max, clearLabel = "Clear assignees", ...rest }: MemberPickerProps) {
  const pop = usePopover();
  const [q, setQ] = useState("");
  const label = rest["aria-label"] ?? "Assignees";
  const sel = new Set(value);
  const picked = members.filter((m) => sel.has(m.id));
  const ql = q.trim().toLowerCase();
  const match = (m: PickableMember) => !ql || [m.name, m.nickname, m.email].filter(Boolean).some((s) => String(s).toLowerCase().includes(ql));
  const ordered = [...members.filter((m) => sel.has(m.id)), ...members.filter((m) => !sel.has(m.id))].filter(match);
  const toggle = (m: PickableMember) => onChange(sel.has(m.id) ? value.filter((v) => v !== m.id) : max && value.length >= max ? value : [...value, m.id]);
  return (
    <Popover
      open={pop.open}
      onOpenChange={(o) => {
        pop.setOpen(o);
        if (!o) setQ("");
      }}
      placement={placement}
      tier={tier}
      width={width}
      role="dialog"
      aria-label={label}
      block={block}
      trigger={
        <Button variant="outline" disabled={disabled} aria-label={label} data-block={block ? "true" : undefined} className="td-aside-btn">
          {picked.length ? <AvatarStack people={picked} size={20} max={3} /> : <Icon name={icon} size={16} />}
          <span className="td-mp-value" data-placeholder={picked.length ? undefined : "true"}>
            {picked.length ? picked.map((m) => m.nickname || first(m.name)).join(", ") : placeholder}
          </span>
        </Button>
      }
    >
      <div className="td-picker-search">
        <Icon name="search" size={14} />
        <input
          className="td-picker-input"
          autoFocus
          placeholder="Search people…"
          aria-label="Search people"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ordered[0]) {
              e.preventDefault();
              toggle(ordered[0]);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              (e.currentTarget.closest(".td-pop")?.querySelector('[role="checkbox"]') as HTMLElement | null)?.focus();
            } else if (e.key.length === 1) e.stopPropagation();
          }}
        />
      </div>
      <div className="td-picker-list">
        {ordered.map((m) => (
          <div
            key={m.id}
            className="td-picker-row"
            role="checkbox"
            tabIndex={0}
            aria-checked={sel.has(m.id)}
            aria-label={m.name}
            onClick={() => toggle(m)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                toggle(m);
              }
            }}
          >
            <Avatar name={m.name} src={m.src} color={m.color} size={22} />
            <span className="td-mp-name">{m.name}</span>
            {m.nickname || m.email ? <span className="td-mp-sub">{m.nickname ? `@${m.nickname}` : m.email}</span> : null}
            {sel.has(m.id) ? <Icon name="check" size={14} className="td-mp-check" /> : null}
          </div>
        ))}
        {!ordered.length ? <div className="td-menu-note">{ql ? "No one matches" : "No members in this project"}</div> : null}
        {picked.length ? (
          <>
            <div className="td-menu-divider" />
            <button type="button" className="td-picker-row td-mp-action" onClick={() => onChange([])}>
              <Icon name="user-x" size={14} />
              {clearLabel}
            </button>
          </>
        ) : null}
      </div>
    </Popover>
  );
}
