// App-level feedback: the one Toast (undoable outcomes only) and the session undo stack behind Z.
// Every undoable mutation pushes {message, restore} here the moment it raises its toast; the Toast is
// the whole undo GUI. Spec: DESIGN.md › Toasts, Undo history.
import { create } from "zustand";

import type { IconName } from "../design/core/Icon";
import { UNDO_DEPTH, undoneMessage, type UndoEntry } from "../design/core/undoStack";

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
  notify: (t: ToastState & { restore?: UndoEntry["restore"] }) => void;
  dismiss: () => void;
  /** Z / Ctrl+Z: remove the entry only after restoration succeeds. */
  undo: () => Promise<void>;
  undoing: UndoEntry | null;
  /** The screen the history belongs to (project id or path); changing it clears the stack. */
  scope: string;
  setScope: (scope: string) => void;
}

let seq = 0;

export const useFeedback = create<FeedbackStore>()((set, get) => ({
  toast: null,
  stack: [],
  undoing: null,
  notify: ({ restore, ...t }) => {
    const stack = restore ? [{ message: t.history ?? t.message, restore }, ...get().stack].slice(0, UNDO_DEPTH) : get().stack;
    set({ stack, toast: { ...t, key: ++seq, undo: restore ? () => get().undo() : t.undo } });
  },
  dismiss: () => set({ toast: null }),
  undo: async () => {
    const [entry] = get().stack;
    if (!entry || get().undoing) return;
    const toastKey = ++seq;
    set({ undoing: entry, toast: { key: toastKey, message: "Undoing…", icon: "undo-2" } });
    try {
      await entry.restore();
      // A newer outcome or navigation may have arrived while the request was pending.
      if (!get().stack.includes(entry)) return;
      const rest = get().stack.filter((e) => e !== entry);
      set({ stack: rest });
      if (get().toast?.key === toastKey) set({ toast: { key: ++seq, message: undoneMessage(entry), icon: "undo-2", meta: rest.length ? `${rest.length} more` : undefined, undo: rest.length ? () => get().undo() : undefined, actionLabel: rest.length ? "Undo more" : undefined } });
    } catch (error) {
      if (get().stack.includes(entry) && get().toast?.key === toastKey) set({ toast: { key: ++seq, message: "Couldn't undo. " + (error instanceof Error ? error.message : "Please try again."), icon: "circle-alert", undo: () => get().undo(), actionLabel: "Retry Undo" } });
    } finally {
      if (get().undoing === entry) set({ undoing: null });
    }
  },
  scope: "",
  setScope: (scope) => {
    if (scope === get().scope) return;
    const toast = get().undoing ? null : get().toast;
    set({ scope, stack: [], undoing: null, toast: toast ? { ...toast, undo: undefined } : null });
  },
}));

/** 'Pricing page: do we show…' — a title in a toast, quoted and clipped. */
export const quote = (title: string, max = 40) => "“" + (title.length > max ? title.slice(0, max - 1).trimEnd() + "…" : title) + "”";
