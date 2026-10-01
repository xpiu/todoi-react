// Per-device preferences behind Settings › General and › Notifications (persisted locally; the
// Appearance store keeps its own). Spec: DESIGN.md › Settings.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Prefs {
  language: string;
  timeZone: string;
  timeFormat: "24h" | "12h";
  weekStart: "mon" | "sun" | "sat";
  dateFormat: string;
  showCompleted: boolean;
  smartDates: boolean;
  defaultPriority: string;
  showTips: boolean;
  notifyMentions: boolean;
  notifyAssignments: boolean;
  notifyWatched: boolean;
  notifyNews: boolean;
  notifyEmail: boolean;
  inboxBadge: boolean;
}
export const DEFAULT_PREFS: Prefs = { language: "en", timeZone: "auto", timeFormat: "24h", weekStart: "mon", dateFormat: "mdy-text", showCompleted: true, smartDates: true, defaultPriority: "none", showTips: true, notifyMentions: true, notifyAssignments: true, notifyWatched: true, notifyNews: true, notifyEmail: false, inboxBadge: true };

export const usePrefs = create<Prefs & { set: (patch: Partial<Prefs>) => void; reset: () => void }>()(
  persist((set) => ({ ...DEFAULT_PREFS, set: (patch) => set(patch), reset: () => set(DEFAULT_PREFS) }), { name: "td-prefs", partialize: (s) => Object.fromEntries(Object.keys(DEFAULT_PREFS).map((k) => [k, s[k as keyof Prefs]])) as Partial<Prefs> }),
);
