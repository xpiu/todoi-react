// Canonical keyboard map — the SINGLE SOURCE OF TRUTH for every shortcut todoi owns.
// Display: ShortcutsDialog and Settings › Keyboard render SHORTCUTS.sections.
// Matching: KeyNav, ItemOverlay and the app shell match events through the helpers below.
// Add or change a shortcut HERE, nowhere else. Spec: DESIGN.md › Interaction & keyboard.
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type KeyEvt = KeyboardEvent | ReactKeyboardEvent;

const noMod = (e: KeyEvt) => !e.ctrlKey && !e.metaKey && !e.altKey;
const mod = (e: KeyEvt) => e.ctrlKey || e.metaKey;
const low = (e: KeyEvt) => (e.key ?? "").toLowerCase();

/** Single-key shortcuts and hints pause in text fields and rich editors. */
export function isTyping(target: Element | null = document.activeElement): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable);
}

/** macOS / iOS show ⌘ where the map says ctrl (matching accepts either). */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

/** Platform-aware key token: "ctrl" → "⌘" on macOS. */
export const keyLabel = (tok: string) => (IS_MAC && tok === "ctrl" ? "⌘" : tok);

export type ShortcutId =
  | "open"
  | "close"
  | "save-close"
  | "new-item"
  | "new-list"
  | "undo"
  | "palette"
  | "search"
  | "chord-g"
  | "filter"
  | "clear-filters"
  | "help"
  | "select"
  | "select-all";

const MATCH: Record<ShortcutId, (e: KeyEvt) => boolean> = {
  open: (e) => noMod(e) && (e.key === "Enter" || e.key === " "),
  close: (e) => e.key === "Escape",
  "save-close": (e) => mod(e) && e.key === "Enter",
  "new-item": (e) => noMod(e) && !e.shiftKey && low(e) === "n",
  "new-list": (e) => noMod(e) && e.key === "N",
  undo: (e) => !e.altKey && !e.shiftKey && low(e) === "z",
  palette: (e) => mod(e) && low(e) === "k",
  search: (e) => noMod(e) && e.key === "/",
  "chord-g": (e) => noMod(e) && !e.shiftKey && low(e) === "g",
  filter: (e) => noMod(e) && low(e) === "f",
  "clear-filters": (e) => noMod(e) && low(e) === "x",
  help: (e) => e.key === "?",
  select: (e) => noMod(e) && !e.shiftKey && low(e) === "s",
  "select-all": (e) => mod(e) && !e.shiftKey && low(e) === "a",
};

export type ViewId = "board" | "list" | "calendar";
export type NavId = "inbox" | "projects" | "groups";
const GO: Record<string, { view?: ViewId; nav?: NavId }> = {
  b: { view: "board" },
  l: { view: "list" },
  c: { view: "calendar" },
  i: { nav: "inbox" },
  p: { nav: "projects" },
  g: { nav: "groups" },
};

/** [key tokens (with "+", "or", "then", "–" separators), description] */
export type ShortcutRow = [keys: string[], description: string];
export interface ShortcutSection {
  title: string;
  rows: ShortcutRow[];
}

export const SHORTCUT_SECTIONS: ReadonlyArray<ShortcutSection> = [
  {
    title: "Focus & open",
    rows: [
      [["←", "↑", "↓", "→"], "Move focus between items and lists"],
      [["J", "K"], "Move focus down / up within a list"],
      [["↵", "or", "space"], "Open the focused item"],
      [["esc"], "Close the overlay, menu, or palette"],
      [["ctrl", "+", "↵"], "Save and close the open item"],
    ],
  },
  {
    title: "Create",
    rows: [
      [["N"], "Add an item to the current list — opens the quick-add field"],
      [["shift", "+", "N"], "Add list"],
    ],
  },
  {
    title: "Quick-add syntax (inside the N field)",
    rows: [
      [["#design"], "Label — an unknown name creates a new label"],
      [["@flo"], "Assignee — first name or nickname"],
      [["!high"], "Priority: !urgent !high !medium !low, or !1 – !4"],
      [["due fri"], "Due date: today, tomorrow, a weekday, 12 sep, in 3 days"],
      [[">Doing"], "Destination list"],
      [["↵"], "Add it and keep the field open for the next one"],
    ],
  },
  {
    title: "Select",
    rows: [
      [["S"], "Select / deselect the focused item"],
      [["shift", "+", "↑", "↓"], "Extend the selection"],
      [["ctrl", "+", "A"], "Select every item in the list"],
      [["ctrl", "+", "click"], "Toggle an item; shift + click selects a range"],
      [["D", "⌫", "1", "–", "4"], "Apply to every selected item"],
      [["esc"], "Clear the selection"],
    ],
  },
  {
    title: "Edit the focused item",
    rows: [
      [["E"], "Rename — opens the item with the title ready to edit"],
      [["shift", "+", "F10"], "Item menu — rename, move, duplicate, archive (on a board card; the menu key works too)"],
      [["D"], "Mark done / not done"],
      [["1", "–", "4"], "Set priority Urgent / High / Medium / Low"],
      [["0"], "Clear priority"],
      [["A"], "Assignees — opens the picker on the Board card"],
      [["L"], "Labels — opens the picker on the Board card"],
      [["shift", "+", "D"], "Dates — opens the picker on the Board card"],
      [["⌫"], "Delete the item"],
    ],
  },
  {
    title: "Move the focused item",
    rows: [
      [["ctrl", "+", "↑", "↓"], "Move within its list"],
      [["ctrl", "+", "←", "→"], "Move to the next list, same position"],
      [["ctrl", "+", "shift", "+", "↑", "↓"], "Move to the previous / next group (grouped List view)"],
      [["Z", "or", "ctrl", "+", "Z"], "Undo the last change (up to 10 back, this session)"],
    ],
  },
  {
    title: "Go to",
    rows: [
      [["ctrl", "+", "K"], "Command palette"],
      [["/"], "Focus search"],
      [["G", "then", "B"], "Board view"],
      [["G", "then", "L"], "List view"],
      [["G", "then", "C"], "Calendar view"],
      [["G", "then", "I"], "Inbox"],
      [["G", "then", "P"], "Projects"],
      [["G", "then", "G"], "Project groups"],
    ],
  },
  {
    title: "Filter",
    rows: [
      [["F"], "Open the filter menu"],
      [["X"], "Clear all filters"],
      [["?"], "Show these shortcuts"],
    ],
  },
  {
    title: "Calendar",
    rows: [
      [["shift", "+", "D"], "Due date of the focused item or “No date” row: pick a day, or Clear to send it to No date"],
      [["←", "↑", "↓", "→"], "Move day focus inside the grid"],
      [["←", "→"], "Previous / next period, when focus is outside the grid"],
      [["PageUp", "PageDown"], "Previous / next period"],
      [["↵"], "Open the focused day, or add an item to an empty one"],
    ],
  },
];

export type FocusDir = "up" | "down" | "left" | "right";
export type ItemAction = "edit" | "done" | "delete" | `priority-${0 | 1 | 2 | 3 | 4}`;

export const SHORTCUTS = {
  sections: SHORTCUT_SECTIONS,
  isMac: IS_MAC,
  modLabel: IS_MAC ? "⌘" : "Ctrl",
  keyLabel,
  /** Match an event against a shortcut id. */
  is: (id: ShortcutId, e: KeyEvt) => MATCH[id](e),
  /** shift+↑↓ (or shift+J/K): extend the selection. */
  selectMove(e: KeyEvt): "up" | "down" | null {
    if (!noMod(e) || !e.shiftKey) return null;
    const k = e.key, kk = low(e);
    return k === "ArrowUp" || kk === "k" ? "up" : k === "ArrowDown" || kk === "j" ? "down" : null;
  },
  /** Single-key action on the focused item. */
  itemAction(e: KeyEvt): ItemAction | null {
    if (!noMod(e)) return null;
    const k = e.key, kk = low(e);
    if (kk === "e") return "edit";
    if (kk === "d" && !e.shiftKey) return "done";
    if (k === "Backspace" || k === "Delete") return "delete";
    if (/^[0-4]$/.test(k)) return `priority-${Number(k) as 0 | 1 | 2 | 3 | 4}`;
    return null;
  },
  /** Board card quick pickers: A, L, shift+D open that field's picker at its icon; shift+D also on a calendar chip or "No date" row. Plain L never follows G (callers check the chord first). */
  itemQuickEdit(e: KeyEvt): "assignees" | "labels" | "dates" | null {
    if (!noMod(e)) return null;
    const kk = low(e);
    if (e.shiftKey) return kk === "d" ? "dates" : null;
    return kk === "a" ? "assignees" : kk === "l" ? "labels" : null;
  },
  /** Unmodified focus movement (arrows + J/K). */
  focusMove(e: KeyEvt): FocusDir | null {
    if (!noMod(e) || e.shiftKey) return null;
    const k = e.key, kk = low(e);
    return k === "ArrowUp" || kk === "k" ? "up" : k === "ArrowDown" || kk === "j" ? "down" : k === "ArrowLeft" ? "left" : k === "ArrowRight" ? "right" : null;
  },
  /** Grouped List view: Ctrl/Cmd+Shift+↑↓ moves the focused item to the previous / next group. Checked before itemMove, which also matches with shift held. */
  groupMove(e: KeyEvt): "up" | "down" | null {
    if (!mod(e) || !e.shiftKey || e.altKey) return null;
    return e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : null;
  },
  /** Ctrl/Cmd+arrow item move. */
  itemMove(e: KeyEvt): FocusDir | null {
    if (!mod(e)) return null;
    const k = e.key;
    return k === "ArrowUp" ? "up" : k === "ArrowDown" ? "down" : k === "ArrowLeft" ? "left" : k === "ArrowRight" ? "right" : null;
  },
  /** Second key of the G chord. */
  goTarget: (k: string) => GO[k.toLowerCase()] ?? null,
} as const;
