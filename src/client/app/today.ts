// Today's date for views that mark overdue items or highlight today: it turns over at local midnight and is
// re-read when the tab comes back (a laptop waking from sleep skips its timers), so a long-running tab
// never keeps showing yesterday. Dates are the device's calendar days (DESIGN.md › Dates).
import { useSyncExternalStore } from "react";

import { toISO } from "../design/core/dates";

const read = () => toISO(new Date())!;

function subscribe(changed: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    // A second past midnight, so the new day is certainly the one read.
    timer = setTimeout(() => {
      changed();
      arm();
    }, midnight.getTime() - now.getTime() + 1000);
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
