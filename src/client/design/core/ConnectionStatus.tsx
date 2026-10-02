// ConnectionStatus — offline and queued edits in the app frame (DESIGN.md › States). `useOnline` is the
// one navigator.onLine subscription; `connectionCopy` the one copy source (also feeds SyncNotice).
// Connectivity is never a Toast.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { Icon, type IconName } from "./Icon";
import { MenuDivider, MenuItem, MenuNote, MenuPopover } from "./Menu";
import "./ConnectionStatus.css";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const readOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/** navigator.onLine + the online/offline events, as state. `force` (true/false) overrides it for previews and tests. */
export function useOnline(force?: boolean): boolean {
  const live = useSyncExternalStore(subscribeOnline, readOnline, () => true);
  return force == null ? live : !!force;
}

export function relativeSync(iso?: string | null, now: number = Date.now()): string {
  if (!iso) return "Nothing saved yet in this tab";
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Last saved just now";
  if (m < 60) return `Last saved ${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Last saved ${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `Last saved ${d} day${d === 1 ? "" : "s"} ago`;
}

const edits = (n: number) => `${n} edit${n === 1 ? "" : "s"}`;

export interface ConnectionCopy {
  tone: "warn" | "info";
  icon: IconName;
  /** Pill text: "Offline" · "2 not saved" · "Syncing 3…" · "3 edits queued" · "Synced" */
  label: string;
  /** Queued count shown after the label while offline (0 hides it) */
  count: number;
  /** Bold condition line */
  message: string;
  /** Quiet continuation: what is safe + "Last synced …" */
  detail: string;
}

export interface ConnectionState {
  online?: boolean;
  pending?: number;
  syncing?: boolean;
  lastSynced?: string | null;
  /** Edits the server refused (each rolled back on screen, with its reason in a message) */
  failed?: number;
}

/** The one copy source for the pill, its menu and the SyncNotice offline variant. */
export function connectionCopy({ online = true, pending = 0, syncing = false, lastSynced, failed = 0 }: ConnectionState = {}): ConnectionCopy {
  const last = relativeSync(lastSynced);
  // Waiting edits live in this tab's memory until the connection returns — say so, never "saved".
  if (!online) {
    return {
      tone: "warn",
      icon: "cloud-off",
      label: "Offline",
      count: pending,
      message: pending ? `You're offline — ${edits(pending)} waiting to save` : "You're offline",
      detail: (pending ? "They save when the connection returns. Keep this tab open: reloading or closing it discards them. " : "Edits you make now wait in this tab and save when you're back online; reloading the tab discards them. ") + last + ".",
    };
  }
  if (failed) return { tone: "warn", icon: "circle-alert", label: `${failed} not saved`, count: 0, message: `${edits(failed)} didn't save`, detail: "Each was undone on screen, and a message said why — for example, a lost sign-in. Make the change again once that's sorted. " + last + "." };
  if (syncing) return { tone: "info", icon: "refresh-cw", label: pending ? `Syncing ${pending}…` : "Syncing…", count: 0, message: `Back online — syncing ${pending ? edits(pending) : "your changes"}`, detail: last + "." };
  if (pending) return { tone: "info", icon: "cloud-upload", label: `${edits(pending)} queued`, count: 0, message: `${edits(pending)} waiting to save`, detail: "They wait in this tab; Sync now sends them. " + last + "." };
  return { tone: "info", icon: "cloud-check", label: "Synced", count: 0, message: "Everything is up to date", detail: last + "." };
}

export interface ConnectionStatusProps extends ConnectionState {
  /** Renders "Dismiss" for the not-saved state */
  onClearFailed?: () => void;
  /** Renders "Sync now" in the menu (disabled while offline or syncing) */
  onSyncNow?: () => void;
  /** Renders "Storage & sync settings" in the menu */
  onOpenSettings?: () => void;
  /** "chrome" for the top bar; "card" on white surfaces @default "chrome" */
  variant?: "chrome" | "card";
  /** Keep the pill visible as "Synced" while idle @default false */
  showWhenIdle?: boolean;
  /** How long "Synced" stays after the queue empties, ms @default 2000 */
  settledFor?: number;
  style?: CSSProperties;
  className?: string;
}

export const SYNCED_SETTLE_MS = 2000;

export function ConnectionStatus({ online, pending = 0, syncing = false, lastSynced, failed = 0, onClearFailed, onSyncNow, onOpenSettings, variant = "chrome", showWhenIdle = false, settledFor = SYNCED_SETTLE_MS, style, className }: ConnectionStatusProps) {
  const live = useOnline(online);
  const idle = live && !syncing && !pending && !failed;
  const wasBusy = useRef(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!idle) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    const show = setTimeout(() => setSettled(true), 0);
    const hide = setTimeout(() => setSettled(false), settledFor);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [idle, settledFor]);
  if (idle && !settled && !showWhenIdle) return null;
  const c = connectionCopy({ online: live, pending, syncing, lastSynced, failed });
  const cls = ["td-conn", variant === "card" ? "td-conn-card" : "", className ?? ""].filter(Boolean).join(" ");
  const pill = (
    <button type="button" className={cls} title={c.message} aria-label={c.message} aria-live="polite" style={style}>
      <span className={"td-conn-ico" + (syncing && live ? " is-spinning" : "")} aria-hidden>
        <Icon name={c.icon} size={15} />
      </span>
      <span>{c.label}</span>
      {c.count ? <span className="td-conn-n">· {c.count}</span> : null}
    </button>
  );
  if (!onSyncNow && !onOpenSettings) return pill;
  return (
    <MenuPopover label="Connection" tier="nav" placement="bottom-end" width={264} trigger={pill}>
      <div className="td-conn-menu-head">
        <Icon name={c.icon} size={15} className={c.tone === "warn" ? "td-conn-menu-head-warn" : "td-conn-menu-head-info"} />
        {c.message}
      </div>
      <MenuNote>{c.detail}</MenuNote>
      <MenuDivider />
      {failed && live && onClearFailed ? (
        <MenuItem icon="check" onSelect={onClearFailed}>
          Dismiss
        </MenuItem>
      ) : null}
      {onSyncNow ? (
        <MenuItem icon="refresh-cw" disabled={!live || syncing} onSelect={onSyncNow}>
          {syncing ? "Syncing…" : "Sync now"}
        </MenuItem>
      ) : null}
      {onOpenSettings ? (
        <MenuItem icon="settings" onSelect={onOpenSettings}>
          Storage & sync settings
        </MenuItem>
      ) : null}
    </MenuPopover>
  );
}
