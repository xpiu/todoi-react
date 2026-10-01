// A boolean remembered per device under a spec-named localStorage key (sidebar open, saved-views row open).
import { useCallback, useState } from "react";

export function usePersistedFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored == null ? fallback : stored === "1";
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* private mode: the flag lives for the session */
      }
    },
    [key],
  );
  return [value, set];
}
