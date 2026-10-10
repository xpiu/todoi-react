// Shared undo entry contract. The session stack is owned by app/feedback.ts.

export interface UndoEntry {
  /** The outcome as the toast worded it: 'Moved “Campaign proposal” to Ongoing' */
  message: string;
  /** Puts the state back to the snapshot taken before the outcome */
  restore: () => void | Promise<unknown>;
}

export const UNDO_DEPTH = 10;

/** 'Undid: moved “Campaign proposal” to Ongoing' — the confirmation message for the toast after an undo. */
export function undoneMessage(entry: UndoEntry, result?: unknown): string {
  const m = entry.message;
  const fields = result && typeof result === "object" && "revertedFields" in result ? result.revertedFields : null;
  const later = Array.isArray(fields) && fields.length ? ` — also reverted later edits to ${fields.join(", ")}` : "";
  return "Undid: " + m.charAt(0).toLowerCase() + m.slice(1) + later;
}
