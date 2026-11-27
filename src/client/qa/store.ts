// The one QA note being written in this tab (shared/qa.ts). It outlives the panel: closing the tool keeps
// the draft, so the shortcut is a plain show/hide; sending it clears it.
import { create } from "zustand";

import type { Stroke } from "./ink";

/** draw = the screen is frozen and the cursor is the pencil; use = the app works as usual under the drawing */
export type QaMode = "draw" | "use";

interface QaNoteState {
  open: boolean;
  mode: QaMode;
  text: string;
  strokes: ReadonlyArray<Stroke>;
  /** The panel's top-left corner once it was dragged; null = its default corner */
  position: { x: number; y: number } | null;
  toggle: () => void;
  close: () => void;
  setMode: (mode: QaMode) => void;
  setText: (text: string) => void;
  addStroke: (stroke: Stroke) => void;
  undoStroke: () => void;
  clearStrokes: () => void;
  moveTo: (position: { x: number; y: number }) => void;
  /** After sending: an empty note, drawing again */
  reset: () => void;
}

export const useQaNote = create<QaNoteState>()((set) => ({
  open: false,
  mode: "draw",
  text: "",
  strokes: [],
  position: null,
  // Opening always starts in draw mode: the pencil is what the shortcut summons.
  toggle: () => set((s) => (s.open ? { open: false } : { open: true, mode: "draw" })),
  close: () => set({ open: false }),
  setMode: (mode) => set({ mode }),
  setText: (text) => set({ text }),
  addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),
  undoStroke: () => set((s) => ({ strokes: s.strokes.slice(0, -1) })),
  clearStrokes: () => set({ strokes: [] }),
  moveTo: (position) => set({ position }),
  reset: () => set({ text: "", strokes: [], mode: "draw" }),
}));
