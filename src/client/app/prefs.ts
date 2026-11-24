// Account preferences behind Settings › General and › Notifications (shared/prefs.ts). The store is
// the device's copy, so the app renders at once and offline; the account's copy wins when it loads
// (`usePrefsSync`) and every change is written through. Date conventions reach the date utilities
// from here. Appearance keeps its own, device-only store. Spec: DESIGN.md › Settings.
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_PREFS, prefsOf, type Prefs } from "../../shared/prefs";
import { api, unwrap } from "../data/api";
import { isTimeZone, setDateConventions } from "../design/core/dates";
import { notifyFailure } from "./feedback";

export { DEFAULT_PREFS, type Prefs };

const WEEK_START = { mon: 1, sun: 0, sat: 6 } as const;

const saveToAccount = (patch: Partial<Prefs>) => api.api.me.prefs.$patch({ json: patch }).then((r) => unwrap(r));

export const usePrefs = create<Prefs & { set: (patch: Partial<Prefs>) => void; save: (patch: Partial<Prefs>) => Promise<void> }>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      set: (patch) => {
        set(patch);
        saveToAccount(patch).catch((err: unknown) => notifyFailure(err, "Couldn't save that setting to your account: "));
      },
      /** For a control that shows its own failure: applied at once, put back when the account refuses it. */
      save: async (patch) => {
        const before = Object.fromEntries(Object.keys(patch).map((k) => [k, get()[k as keyof Prefs]])) as Partial<Prefs>;
        set(patch);
        try {
          await saveToAccount(patch);
        } catch (err) {
          set(before);
          throw err;
        }
      },
    }),
    { name: "td-prefs", partialize: (s) => prefsOf(s), merge: (stored, current) => ({ ...current, ...prefsOf(stored) }) },
  ),
);

const applyConventions = (p: Prefs) => setDateConventions({ dateFormat: p.dateFormat, timeFormat: p.timeFormat, weekStart: WEEK_START[p.weekStart], timeZone: p.timeZone && isTimeZone(p.timeZone) ? p.timeZone : null });
applyConventions(usePrefs.getState());
usePrefs.subscribe(applyConventions);

/** Adopt the account's preferences once they load (another device may have changed them). */
export function usePrefsSync(enabled: boolean) {
  const account = useQuery({ queryKey: ["me", "prefs"], queryFn: ({ signal }) => api.api.me.$get(undefined, { init: { signal } }).then((r) => unwrap<{ prefs: Prefs }>(r)).then((me) => me.prefs), enabled });
  useEffect(() => {
    if (account.data) usePrefs.setState(account.data);
  }, [account.data]);
}

/** A key that changes with the date conventions, so date-bearing screens render again in the new form. */
export const useDateConventionsKey = () => usePrefs((s) => `${s.dateFormat}|${s.timeFormat}|${s.weekStart}|${s.timeZone ?? ""}`);
