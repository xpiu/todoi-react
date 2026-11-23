// Return focus — an inline editor that closes removes the control that had focus (its field, Save,
// Cancel). Dropped to the body, focus is picked up a frame later by the surrounding Base UI Dialog,
// which refocuses its popup over whatever was focused in between (a keystroke in the comment composer
// lands on the dialog). The editor's trigger takes focus back in the same commit instead, as ListRow /
// ItemCard return focus after editing. Focus that already moved on (a blur that closed the editor, a
// click on another control, typing elsewhere while a save was pending) is left alone.
import { useLayoutEffect, useRef, type RefObject } from "react";

/** Focus nobody holds: the body, or a dialog popup that picked it up. */
const isLost = (el: Element | null) => !el || el === document.body || el.matches('[role="dialog"], [role="alertdialog"]');

/** Call the returned `leaving()` just before `editing` turns false, and before a pending save disables the
 *  focused control (a disabled button drops focus); a later call while focus is lost keeps what it noted.
 *  Once the editor unmounts, `trigger` gets focus back if the noted control went with it and focus has
 *  not moved on since. */
export function useReturnFocus(editing: boolean, trigger: RefObject<HTMLElement | null>): () => void {
  const focusedAtClose = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const focused = focusedAtClose.current;
    focusedAtClose.current = null;
    if (!editing && focused && !focused.isConnected && isLost(document.activeElement)) trigger.current?.focus();
  }, [editing, trigger]);
  return () => {
    const active = document.activeElement;
    if (!isLost(active)) focusedAtClose.current = active;
  };
}
