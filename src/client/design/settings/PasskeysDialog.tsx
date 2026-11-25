// PasskeysDialog — the account's passkeys on the shared Dialog (520px), opened from Settings › Account ›
// Sign-in methods › Passkeys. One sentence on what a passkey is; the list (name, "Added … · Last used …",
// Rename in place, Remove confirmed on the row); and the "Add a passkey" row, which hands over to the
// browser's own prompt ("Waiting for your device…"). Rows hold sibling buttons only, never a menu. Esc closes
// an open rename field or confirm first, then the dialog. From Design's settings/PasskeysDialog (2026-11-24).
// Spec: DESIGN.md › Account.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "../core/Button";
import type { DialogCloseReason } from "../core/Dialog";
import { Icon } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { InlineError } from "../core/InlineError";
import { count } from "../core/text";
import { FlowFrame } from "./accountFlow";
import type { SettingsRow } from "./SettingsShell";

export interface Passkey {
  id: string;
  name: string;
  /** "Nov 2, 2026" */
  added: string;
  /** "today", "2 hours ago"; none = "Never used" */
  lastUsed?: string;
  /** Tagged "This device" */
  thisDevice?: boolean;
}

export interface PasskeysDialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  passkeys?: Passkey[];
  /** The list is still loading */
  loading?: boolean;
  /** The list couldn't load: the reason */
  listError?: string | null;
  /** The browser can create passkeys @default true */
  supported?: boolean;
  /** Start the browser's passkey prompt */
  onAdd?: () => void;
  /** "waiting": the browser prompt is up @default "idle" */
  addState?: "idle" | "waiting";
  /** Why the last attempt added nothing; the button then reads "Try again" */
  addError?: string | null;
  onRename?: (id: string, name: string) => void;
  /** Confirmed on the row; the host raises the toast ("Removed the passkey “…”") */
  onRemove?: (id: string) => void;
  /** A rename or removal failed: the reason, under the list */
  error?: string | null;
  /** Why no passkey can be removed right now; disables every Remove */
  removeBlocked?: string;
  offline?: boolean;
  /** Stories: open with this passkey in rename / remove-confirm */
  defaultEditing?: string;
  defaultRemoving?: string;
  /** The host's confirm step (ConfirmAccessDialog), stacked over this dialog */
  stacked?: ReactNode;
}

type Focus = { id: string; action: "rename" | "remove" | "field" } | "add" | null;

export function PasskeysDialog({ open, onClose, passkeys = [], loading = false, listError, supported = true, onAdd, addState = "idle", addError, onRename, onRemove, error, removeBlocked, offline = false, defaultEditing, defaultRemoving, stacked }: PasskeysDialogProps) {
  const [editing, setEditing] = useState<string | null>(defaultEditing ?? null);
  const [name, setName] = useState(() => passkeys.find((p) => p.id === defaultEditing)?.name ?? "");
  const [removing, setRemoving] = useState<string | null>(defaultRemoving ?? null);
  // Each opening starts on the plain list (reset while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setEditing(null);
      setRemoving(null);
    }
  }
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // Where focus goes after a row changes state: the field, back to the row's button, or on after a removal.
  const [focus, setFocus] = useState<Focus>(null);
  useEffect(() => {
    if (!focus) return;
    const el = focus === "add" ? addRef.current : listRef.current?.querySelector<HTMLElement>(`[data-passkey="${CSS.escape(focus.id)}"] [data-action="${focus.action}"]`);
    if (el) {
      el.focus();
      setFocus(null);
    }
  }, [focus]);
  const waiting = addState === "waiting";

  const startEdit = (p: Passkey) => {
    setRemoving(null);
    setEditing(p.id);
    setName(p.name);
    setFocus({ id: p.id, action: "field" });
  };
  const endEdit = (p: Passkey, save: boolean) => {
    const n = name.trim();
    if (save && n && n !== p.name) onRename?.(p.id, n);
    setEditing(null);
    setFocus({ id: p.id, action: "rename" });
  };
  const startRemove = (p: Passkey) => {
    if (removeBlocked) return;
    setEditing(null);
    setRemoving(p.id);
    setFocus({ id: p.id, action: "remove" });
  };
  const cancelRemove = (p: Passkey) => {
    setRemoving(null);
    setFocus({ id: p.id, action: "remove" });
  };
  const confirmRemove = (p: Passkey) => {
    const i = passkeys.findIndex((x) => x.id === p.id);
    const next = passkeys[i + 1] ?? passkeys[i - 1];
    setRemoving(null);
    onRemove?.(p.id);
    // The row goes: focus moves to the neighbour's Rename, or to Add when it was the last one.
    setFocus(next ? { id: next.id, action: "rename" } : "add");
  };
  // Esc closes the row's confirm first; the dialog stays open.
  const escapeRow = (e: KeyboardEvent, close: () => void) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  return (
    <FlowFrame
      open={open}
      onClose={onClose}
      title="Passkeys"
      width={520}
      initialFocus={passkeys.length || !supported || offline ? doneRef : addRef}
      stacked={stacked}
      footer={
        <Button ref={doneRef} variant="primary" onClick={() => onClose("close")}>
          Done
        </Button>
      }
    >
      <p className="td-account-text">A passkey logs you in with your fingerprint, face or screen lock. No password and no code.</p>
      {passkeys.length ? (
        <ul ref={listRef} className="td-account-passkeys" aria-label="Your passkeys">
          {passkeys.map((p) => (
            <li key={p.id} className="td-account-passkey" data-passkey={p.id} onKeyDown={removing === p.id ? (e) => escapeRow(e, () => cancelRemove(p)) : undefined}>
              <Icon name="key-round" size={16} />
              {editing === p.id ? (
                <form
                  className="td-account-passkey-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    endEdit(p, true);
                  }}
                >
                  <input className="td-field" data-action="field" value={name} maxLength={60} aria-label="Passkey name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => escapeRow(e, () => endEdit(p, false))} />
                  <Button type="submit" variant="primary" disabled={!name.trim()}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => endEdit(p, false)}>
                    Cancel
                  </Button>
                </form>
              ) : removing === p.id ? (
                <>
                  <div className="td-account-passkey-text" role="alert">
                    <b>Remove “{p.name}”?</b>
                    <span>You can't log in with it any more.</span>
                  </div>
                  <Button variant="outline" data-action="remove" disabled={offline} onClick={() => confirmRemove(p)}>
                    Remove
                  </Button>
                  <Button variant="ghost" onClick={() => cancelRemove(p)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <div className="td-account-passkey-text">
                    <b title={p.name}>
                      <span className="td-account-passkey-name">{p.name}</span>
                      {p.thisDevice ? <span className="td-account-tag">This device</span> : null}
                    </b>
                    <span>{[`Added ${p.added}`, p.lastUsed ? `Last used ${p.lastUsed}` : "Never used"].join(" · ")}</span>
                  </div>
                  <IconButton name="pencil" label={`Rename ${p.name}`} tooltip="Rename" size={28} iconSize={16} data-action="rename" onClick={() => startEdit(p)} />
                  <IconButton name="trash-2" label={`Remove ${p.name}`} tooltip={removeBlocked ? undefined : "Remove"} size={28} iconSize={16} data-action="remove" aria-disabled={removeBlocked ? true : undefined} className={removeBlocked ? "is-disabled" : undefined} onClick={() => startRemove(p)} />
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="td-account-empty">
          <b>{loading ? "Checking…" : "No passkeys yet"}</b>
          {!loading && supported ? <span>Add one on this device to log in without a password.</span> : null}
        </div>
      )}
      <InlineError message={listError ? `Couldn't load your passkeys: ${listError}` : error ?? null} />
      {removeBlocked ? <p className="td-account-note">{removeBlocked}</p> : null}
      <div className="td-account-row">
        <div className="td-account-row-text">
          <b>Add a passkey</b>
          <span>{!supported ? "This browser can't create passkeys. Try a newer browser, or your phone." : offline ? "You're offline. Add a passkey when you reconnect." : waiting ? "Follow the steps your device shows." : "Your device asks for your fingerprint, face or screen lock."}</span>
        </div>
        <Button ref={addRef} variant="outline" icon="plus" disabled={!supported || offline || waiting} onClick={onAdd}>
          {waiting ? "Waiting for your device…" : addError ? "Try again" : "Add a passkey"}
        </Button>
        <InlineError message={addError ?? null} className="td-account-wide" />
      </div>
    </FlowFrame>
  );
}

/** Settings › Account › Sign-in methods › Passkeys: how many, and Manage. */
export function passkeysRow({ count: n, onOpen }: { count: number | null; onOpen: () => void }): SettingsRow {
  const what = "Log in with your fingerprint, face or screen lock";
  return {
    id: "m-passkeys",
    label: "Passkeys",
    hint: n === null ? what : `${n ? count(n, "passkey") : "None yet"} · ${what}`,
    keywords: ["passkey", "webauthn", "fingerprint", "face", "touch id"],
    control: (
      <Button icon="fingerprint" onClick={onOpen}>
        Manage
      </Button>
    ),
  };
}
