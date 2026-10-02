// Copying text, honestly: every "Copied" in the UI waits for this to say the write happened. The
// Clipboard API needs a secure page and may be denied; the legacy selection copy covers plain-http
// pages (a phone on the LAN dev server). Spec: DESIGN.md › Feedback (copy confirmations).
import { useEffect, useRef, useState } from "react";

function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  const active = document.activeElement as HTMLElement | null;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  active?.focus?.({ preventScroll: true });
  return ok;
}

/** Resolves whether `text` reached the clipboard. Never rejects. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied or not focused: try the selection copy */
  }
  return legacyCopy(text);
}

export type CopyState = "idle" | "copied" | "failed";

/** The tooltip after a failed copy */
export const COPY_FAILED = "Couldn't copy. Your browser blocked the clipboard.";
/** A copy control's glyph: its own at rest, a check once copied, an alert when the copy failed. */
export const copyIcon = (state: CopyState, rest: "copy" | "link") => (state === "copied" ? "check" : state === "failed" ? "circle-alert" : rest);

/** A copy control's state: "copied" or "failed" for a moment after each attempt, then "idle" again. */
export function useCopy(resetMs = 1200) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text: string) => {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    // A failure stays up longer: it asks the person to copy some other way.
    timer.current = setTimeout(() => setState("idle"), ok ? resetMs : resetMs * 2);
    return ok;
  };
  return [state, copy] as const;
}
