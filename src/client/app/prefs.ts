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
import { setDateConventions } from "../design/core/dates";
import { notifyFailure } from "./feedback";

export { DEFAULT_PREFS, type Prefs };

const WEEK_START = { mon: 1, sun: 0, sat: 6 } as const;

export const usePrefs = create<Prefs & { set: (patch: Partial<Prefs>) => void }>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      set: (patch) => {
        set(patch);
        api.api.me.prefs.$patch({ json: patch }).then((r) => unwrap(r)).catch((err: unknown) => notifyFailure(err, "Couldn't save that setting to your account: "));
      },
    }),
    { name: "td-prefs", partialize: (s) => prefsOf(s), merge: (stored, current) => ({ ...current, ...prefsOf(stored) }) },
  ),
);

const applyConventions = (p: Prefs) => setDateConventions({ dateFormat: p.dateFormat, timeFormat: p.timeFormat, weekStart: WEEK_START[p.weekStart] });
applyConventions(usePrefs.getState());
usePrefs.subscribe(applyConventions);

/** Adopt the account's preferences once they load (another device may have changed them). */
export function usePrefsSync(enabled: boolean) {
  const account = useQuery({ queryKey: ["me", "prefs"], queryFn: () => api.api.me.$get().then((r) => unwrap<{ prefs: Prefs }>(r)).then((me) => me.prefs), enabled });
  useEffect(() => {
    if (account.data) usePrefs.setState(account.data);
  }, [account.data]);
}

/** A key that changes with the date conventions, so date-bearing screens render again in the new form. */
export const useDateConventionsKey = () => usePrefs((s) => `${s.dateFormat}|${s.timeFormat}|${s.weekStart}`);
