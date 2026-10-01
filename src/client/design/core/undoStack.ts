// Session undo stack — the minimal history behind Z / Ctrl+Z (DESIGN.md › Undo history). Each undoable
// outcome pushes {message, restore}; undo() pops the most recent and runs its restore. Depth 10, LIFO,
// in memory only, no redo. The Toast stays the pointer path; this makes the key work after it is gone.
import { useCallback, useRef, useState } from "react";

export interface UndoEntry {
  /** The outcome as the toast worded it: 'Moved “Campaign proposal” to Ongoing' */
  message: string;
  /** Puts the state back to the snapshot taken before the outcome */
  restore: () => void;
}

export interface UndoStack {
  /** Push after every undoable outcome (the same moment you raise its toast). */
  push: (entry: UndoEntry) => void;
  /** Pops the most recent entry, runs its restore, returns it with how many remain — null when empty */
  undo: () => { entry: UndoEntry; remaining: number } | null;
  /** Drop everything — call when the project or screen changes */
  clear: () => void;
  size: number;
  canUndo: boolean;
  peek: () => UndoEntry | null;
}

export const UNDO_DEPTH = 10;

export function useUndoStack({ depth = UNDO_DEPTH }: { depth?: number } = {}): UndoStack {
  const ref = useRef<UndoEntry[]>([]);
  const [size, setSize] = useState(0);
  const push = useCallback(
    (entry: UndoEntry) => {
      if (!entry || typeof entry.restore !== "function") return;
      ref.current = [entry, ...ref.current].slice(0, depth);
      setSize(ref.current.length);
    },
    [depth],
  );
  const undo = useCallback(() => {
    const [e, ...rest] = ref.current;
    if (!e) return null;
    ref.current = rest;
    setSize(rest.length);
    e.restore();
    return { entry: e, remaining: rest.length };
  }, []);
  const clear = useCallback(() => {
    ref.current = [];
    setSize(0);
  }, []);
  const peek = useCallback(() => ref.current[0] ?? null, []);
  return { push, undo, clear, size, canUndo: size > 0, peek };
}

/** 'Undid: moved “Campaign proposal” to Ongoing' — the confirmation message for the toast after an undo. */
export function undoneMessage(entry: UndoEntry): string {
  const m = entry.message;
  return "Undid: " + m.charAt(0).toLowerCase() + m.slice(1);
}
