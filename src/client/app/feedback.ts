// App-level feedback: the one Toast (undoable outcomes only) and the session undo stack behind Z.
// Every undoable mutation pushes {message, restore} here the moment it raises its toast; the Toast is
// the whole undo GUI. Spec: DESIGN.md › Toasts, Undo history.
import { create } from "zustand";

import type { IconName } from "../design/core/Icon";
import type { UndoEntry } from "../design/core/undoStack";

export const UNDO_DEPTH = 10;

export interface ToastState {
  message: string;
  icon?: IconName;
  meta?: string;
  /** Present on undoable outcomes */
  undo?: () => void;
  /** What the undo stack calls this outcome when `message` carries extra detail @default message */
  history?: string;
  /** Label of the action button @default "Undo" */
  actionLabel?: string;
}

interface FeedbackStore {
  toast: (ToastState & { key: number }) | null;
  stack: UndoEntry[];
  /** Raise a toast; with `restore` it is undoable and lands on the stack. */
  notify: (t: ToastState & { restore?: () => void }) => void;
  dismiss: () => void;
  /** Z / Ctrl+Z: pops the top entry whether or not its toast still shows. */
  undo: () => void;
  /** The screen the history belongs to (project id or path); changing it clears the stack. */
  scope: string;
  setScope: (scope: string) => void;
}

let seq = 0;

export const useFeedback = create<FeedbackStore>()((set, get) => ({
  toast: null,
  stack: [],
  notify: ({ restore, ...t }) => {
    const stack = restore ? [{ message: t.history ?? t.message, restore }, ...get().stack].slice(0, UNDO_DEPTH) : get().stack;
    set({ stack, toast: { ...t, key: ++seq, undo: restore ? () => get().undo() : t.undo } });
  },
  dismiss: () => set({ toast: null }),
  undo: () => {
    const [entry, ...rest] = get().stack;
    if (!entry) return;
    entry.restore();
    const message = "Undid: " + entry.message.charAt(0).toLowerCase() + entry.message.slice(1);
    set({ stack: rest, toast: { key: ++seq, message, icon: "undo-2", meta: rest.length ? `${rest.length} more` : undefined, undo: rest.length ? () => get().undo() : undefined, actionLabel: rest.length ? "Undo more" : undefined } });
  },
  scope: "",
  setScope: (scope) => {
    if (scope !== get().scope) set({ scope, stack: [] });
  },
}));

/** 'Pricing page: do we show…' — a title in a toast, quoted and clipped. */
export const quote = (title: string, max = 40) => "“" + (title.length > max ? title.slice(0, max - 1).trimEnd() + "…" : title) + "”";
