// One tooltip for the whole page. Any element with `data-tip` explains itself on hover or keyboard
// focus; the layer listens on the document, so controls carry only their text and never a wrapper.
// Tips open after a short rest, then follow the pointer from control to control without waiting.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const REST = 450;
/** After a tip closes, the next one within this window opens at once */
const WARM = 500;
const GAP = 6;
const EDGE = 8;
const ID = "cds-tip";

/** Explanations shared by controls that do the same thing on both pages */
export const TIP = {
  recompare: "Re-read the App and compare it with the newest Design snapshot",
  check: "Ask Claude Design whether the project changed since the newest snapshot. Nothing is pulled yet",
  pull: "Pull every text file of the Design project into a fresh snapshot with Claude Code. Takes a few minutes - Costs tokens",
  pullAgain: "Pull again to fetch the files the last pull couldn't read - Costs tokens",
  bringIn: "Choose how: import an export from Claude Design (no tokens) or pull with Claude Code (costs tokens)",
  project: "Open the project in Claude Design, in a new tab",
  showOnDiagram: "Play this move through the lanes of the diagram",
  closePreview: "Close the preview",
} as const;

export function Tooltips() {
  const [shown, setShown] = useState<{ anchor: HTMLElement; text: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    let closedAt = 0;
    let anchor: HTMLElement | null = null;
    /** The element that carries aria-describedby: the focused control, or the anchor under the pointer */
    let owner: HTMLElement | null = null;
    /** A control the user just clicked or dismissed stays quiet until the pointer or focus leaves it */
    let quiet: HTMLElement | null = null;

    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-tip]") : null);
    const describe = (on: boolean) => {
      if (!owner) return;
      const ids = (owner.getAttribute("aria-describedby") ?? "").split(" ").filter((s) => s && s !== ID);
      if (on) ids.push(ID);
      if (ids.length) owner.setAttribute("aria-describedby", ids.join(" "));
      else owner.removeAttribute("aria-describedby");
    };
    const hide = () => {
      clearTimeout(timer);
      if (!anchor) return;
      describe(false);
      anchor = owner = null;
      closedAt = Date.now();
      setShown(null);
    };
    const show = (el: HTMLElement, by: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text || el === quiet || el === anchor) return;
      clearTimeout(timer);
      const open = () => {
        if (!el.isConnected) return;
        describe(false);
        anchor = el;
        owner = by;
        // a tip that repeats the control's own name adds nothing for a screen reader
        if (text !== (by.getAttribute("aria-label") ?? by.textContent?.trim())) describe(true);
        setShown({ anchor: el, text });
      };
      if (anchor || Date.now() - closedAt < WARM) open();
      else timer = window.setTimeout(open, REST);
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = find(e.target);
      if (el) show(el, el);
    };
    const out = (e: PointerEvent) => {
      const el = find(e.target);
      if (!el || el.contains(e.relatedTarget as Node | null)) return;
      if (el === quiet) quiet = null;
      if (el === anchor && anchor !== document.activeElement?.closest("[data-tip]")) hide();
      else if (!anchor) clearTimeout(timer);
    };
    const focusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const el = find(target);
      if (el && target.matches(":focus-visible")) show(el, target);
    };
    const focusOut = (e: FocusEvent) => {
      const el = find(e.target);
      if (!el || el.contains(e.relatedTarget as Node | null)) return;
      if (el === quiet) quiet = null;
      if (el === anchor) hide();
    };
    const press = (e: PointerEvent) => {
      quiet = find(e.target);
      hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !anchor) return;
      quiet = anchor;
      hide();
    };
    // typing into a field, or anything moving under the tip, closes it
    const typed = (e: Event) => {
      quiet = find(e.target);
      hide();
    };

    // the anchor's text can change while it's shown (Copy brief → Copied), or the anchor can leave the page
    const watch = new MutationObserver(() => {
      if (!anchor) return;
      if (!anchor.isConnected || !anchor.dataset.tip) return hide();
      const text = anchor.dataset.tip;
      setShown((s) => (s && s.text !== text ? { ...s, text } : s));
    });
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-tip"] });

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("keydown", key);
    document.addEventListener("input", typed);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      watch.disconnect();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("keydown", key);
      document.removeEventListener("input", typed);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Above the anchor, centred; below it when there's no room above; never past the viewport's edges
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !shown) return;
    const a = shown.anchor.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    const below = a.top - GAP - t.height < EDGE;
    const x = Math.min(Math.max(a.left + a.width / 2 - t.width / 2, EDGE), window.innerWidth - t.width - EDGE);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(below ? a.bottom + GAP : a.top - GAP - t.height)}px`;
    el.dataset.side = below ? "below" : "above";
  }, [shown]);

  return (
    <div ref={ref} id={ID} role="tooltip" className="cds-tip" data-open={shown ? "" : undefined}>
      {shown?.text}
    </div>
  );
}
