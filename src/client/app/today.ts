// Today's date for views that mark overdue items or highlight today: it turns over at local midnight and is
// re-read when the tab comes back (a laptop waking from sleep skips its timers), so a long-running tab
// never keeps showing yesterday. Days follow Settings › General › Time zone (the device's zone by default).
import { useSyncExternalStore } from "react";

import { currentDay, msToNextDay, toISO } from "../design/core/dates";

const read = () => toISO(currentDay())!;

function subscribe(changed: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    // A second past midnight in the person's zone, so the new day is certainly the one read.
    timer = setTimeout(() => {
      changed();
      arm();
    }, msToNextDay() + 1000);
  };
  const wake = () => {
    if (document.visibilityState !== "visible") return;
    clearTimeout(timer);
    arm();
    changed();
  };
  arm();
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}

/** Today as "YYYY-MM-DD"; re-renders the caller when the day changes. */
export const useToday = (): string => useSyncExternalStore(subscribe, read);
