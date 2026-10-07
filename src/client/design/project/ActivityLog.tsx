// ActivityLog — the project-level log: the same sentence the overlay's activity rail uses (bold
// actor, what happened, the key in mono) across the whole project, grouped by day, filterable by
// kind and person. Read-only. Spec: DESIGN.md › Project lifecycle › Log.
import { useMemo, useState } from "react";

import { Avatar } from "../core/Avatar";
import { Button } from "../core/Button";
import { EmptyState } from "../core/EmptyState";
import { Icon, type IconName } from "../core/Icon";
import { Select } from "../core/Select";
import "./ActivityLog.css";

export interface ActivityEntryView {
  id: string;
  type: string;
  actor: string;
  actorColor?: string;
  text: string;
  key?: string | null;
  time: string;
}
export const ACTIVITY_KINDS: ReadonlyArray<{ value: string; label: string; icon: IconName }> = [
  { value: "item", label: "Items", icon: "square-check-big" },
  { value: "comment", label: "Comments", icon: "message-square" },
  { value: "list", label: "Lists", icon: "list" },
  { value: "member", label: "Members", icon: "users" },
  { value: "settings", label: "Settings", icon: "settings" },
];
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const startOfDay = (t: number) => {
  const x = new Date(t);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const d = now - t;
  if (d < 45000) return "just now";
  if (d < HOUR) {
    const m = Math.round(d / MIN);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (d < DAY && startOfDay(now) === startOfDay(t)) {
    const h = Math.round(d / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const dt = new Date(t);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(dt.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
}
export function dayLabel(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const dt = new Date(t);
  if (days < 7) return dt.toLocaleDateString("en-US", { weekday: "long" });
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(dt.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
}
export function groupActivityByDay<T extends { time: string }>(entries: T[], now = Date.now()): Array<{ key: number; label: string; entries: T[] }> {
  const sorted = [...entries].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const out: Array<{ key: number; label: string; entries: T[] }> = [];
  for (const e of sorted) {
    const k = startOfDay(new Date(e.time).getTime());
    const last = out[out.length - 1];
    if (last && last.key === k) last.entries.push(e);
    else out.push({ key: k, label: dayLabel(e.time, now), entries: [e] });
  }
  return out;
}

export function ActivityRow({ entry, now, onOpenKey, showKind = true }: { entry: ActivityEntryView; now: number; onOpenKey?: (key: string) => void; showKind?: boolean }) {
  const kind = ACTIVITY_KINDS.find((k) => k.value === entry.type);
  return (
    <div className="td-al-row" role="listitem">
      <Avatar name={entry.actor} color={entry.actorColor} size={20} decorative />
      <span className="td-al-text">
        <b>{entry.actor}</b> {entry.text}
        {entry.key ? (
          onOpenKey ? (
            <button type="button" className="td-al-key" onClick={() => onOpenKey(entry.key!)} title={`Open ${entry.key}`}>
              {entry.key}
            </button>
          ) : (
            <span className="td-al-key">{entry.key}</span>
          )
        ) : null}
      </span>
      {showKind && kind ? (
        <span className="td-al-kind" title={kind.label}>
          <Icon name={kind.icon} size={13} />
        </span>
      ) : null}
      <time className="td-al-time" dateTime={entry.time} title={new Date(entry.time).toLocaleString()}>
        {relativeTime(entry.time, now)}
      </time>
    </div>
  );
}

export interface ActivityLogProps {
  entries: ActivityEntryView[];
  now?: number;
  onOpenKey?: (key: string) => void;
  pageSize?: number;
  filters?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}

export function ActivityLog({ entries, now, onOpenKey, pageSize = 30, filters = true, emptyTitle = "No activity in this project yet", emptyHint = "Changes to items, lists, members and settings show up here." }: ActivityLogProps) {
  const [kind, setKind] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [shown, setShown] = useState(pageSize);
  const [mounted] = useState(() => Date.now());
  const at = now ?? mounted;
  const actors = useMemo(() => [...new Set(entries.map((e) => e.actor))], [entries]);
  const list = entries.filter((e) => (!kind || e.type === kind) && (!who || e.actor === who));
  const groups = groupActivityByDay(list.slice(0, shown), at);
  const filtered = !!(kind || who);
  return (
    <div className="td-al">
      {filters ? (
        <div className="td-al-head">
          <span className="td-al-count">
            {list.length} {list.length === 1 ? "entry" : "entries"}
            {filtered ? " · filtered" : ""}
          </span>
          <Select aria-label="Kind" value={kind ?? "__all"} options={[{ value: "__all", label: "All activity", icon: "history" as IconName }, ...ACTIVITY_KINDS]} onChange={(v) => setKind(v === "__all" ? null : v)} placement="bottom-end" tier="detached" width={180} />
          {actors.length > 1 ? <Select aria-label="Person" value={who ?? "__all"} options={[{ value: "__all", label: "Everyone", icon: "users" as IconName }, ...actors.map((n) => ({ value: n, label: n, icon: "user" as IconName }))]} onChange={(v) => setWho(v === "__all" ? null : v)} placement="bottom-end" tier="detached" width={220} /> : null}
        </div>
      ) : null}
      {!list.length ? (
        <EmptyState surface="card" compact icon="history" title={filtered ? "Nothing matches these filters" : emptyTitle} hint={filtered ? "Pick another kind or person." : emptyHint} action={filtered ? { label: "Show all activity", icon: "x", onClick: () => {
          setKind(null);
          setWho(null);
        } } : undefined} />
      ) : (
        <div role="list" aria-label="Activity">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="td-al-day">{g.label}</div>
              {g.entries.map((e) => (
                <ActivityRow key={e.id} entry={e} now={at} onOpenKey={onOpenKey} />
              ))}
            </div>
          ))}
        </div>
      )}
      {list.length > shown ? (
        <div className="td-al-more">
          <Button variant="ghost" icon="chevron-down" onClick={() => setShown((s) => s + pageSize)}>
            Show older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
