// Shared undo entry contract. The session stack is owned by app/feedback.ts.

export interface UndoEntry {
  /** The outcome as the toast worded it: 'Moved “Campaign proposal” to Ongoing' */
  message: string;
  /** Puts the state back to the snapshot taken before the outcome */
  restore: () => void | Promise<unknown>;
}

export const UNDO_DEPTH = 10;

/** 'Undid: moved “Campaign proposal” to Ongoing' — the confirmation message for the toast after an undo. */
export function undoneMessage(entry: UndoEntry): string {
  const m = entry.message;
  return "Undid: " + m.charAt(0).toLowerCase() + m.slice(1);
}
