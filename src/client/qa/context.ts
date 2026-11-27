// What a QA note says about the page besides its picture (shared/qa.ts › qaContextSchema): the address,
// the browser, the viewport, the theme, the build, and the elements under the drawing, named the way the
// code names them (tag, td-* classes, role, accessible name) so a reviewer can search for them.
import { BUILD } from "../../shared/build";
import { MAX_QA_MARKED, type QaContext, type QaMarked } from "../../shared/qa";
import { reportedErrors } from "../errorReporting";
import type { Frame } from "./capture";
import { probePoints, type Stroke } from "./ink";

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** "button.td-btn.td-btn-primary[role=tab]": the names the code gives this element. */
function nameOf(el: Element): string {
  const classes = [...el.classList].filter((c) => c.startsWith("td-")).slice(0, 3).map((c) => `.${c}`).join("");
  const id = el.id && !/\d{3}|^_|:/.test(el.id) ? `#${el.id}` : "";
  const attrs = ["role", "data-testid", "data-item-id", "name"].map((a) => (el.getAttribute(a) ? `[${a}=${clip(el.getAttribute(a)!, 40)}]` : "")).join("");
  return `${el.tagName.toLowerCase()}${id}${classes}${attrs}`;
}

/** The element with up to two ancestors that carry a name of their own, outermost first. */
export function describeElement(el: Element): QaMarked {
  const path = [nameOf(el)];
  for (let up = el.parentElement; up && path.length < 3 && up !== document.body; up = up.parentElement) {
    const name = nameOf(up);
    if (name !== up.tagName.toLowerCase()) path.unshift(name);
  }
  const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.getAttribute("placeholder");
  const text = (el instanceof HTMLElement ? el.innerText : el.textContent)?.replace(/\s+/g, " ").trim();
  const r = el.getBoundingClientRect();
  return { selector: clip(path.join(" > "), 300), ...(label ? { label: clip(label, 120) } : {}), ...(text ? { text: clip(text, 120) } : {}), rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n)) as QaMarked["rect"] };
}

/** The topmost elements of the page under a stroke, ignoring the QA tool (`host`) itself. */
export function markedBy(points: ReadonlyArray<number>, host: Element | null): QaMarked[] {
  const found: Element[] = [];
  for (const [x, y] of probePoints(points)) {
    const el = document.elementsFromPoint(x, y).find((e) => !host?.contains(e) && e !== document.documentElement && e !== document.body);
    if (el && !found.includes(el)) found.push(el);
  }
  return found.map(describeElement);
}

export function collectContext(strokes: ReadonlyArray<Stroke>, frame: Frame): QaContext {
  const marked: QaMarked[] = [];
  for (const m of strokes.flatMap((s) => s.marked)) {
    if (marked.length < MAX_QA_MARKED && !marked.some((seen) => seen.selector === m.selector && seen.rect.join() === m.rect.join())) marked.push(m);
  }
  const appearance = Object.fromEntries(Object.entries(document.documentElement.dataset).filter(([k, v]) => k.length <= 40 && typeof v === "string" && v.length <= 80)) as Record<string, string>;
  return {
    url: clip(location.href, 2000),
    title: clip(document.title, 300),
    userAgent: clip(navigator.userAgent, 600),
    language: clip(navigator.language, 40),
    timeZone: clip(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "", 80),
    sentAt: new Date().toISOString(),
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    screen: { width: window.screen.width, height: window.screen.height },
    appearance,
    build: { sha: clip(BUILD.sha, 80), builtAt: BUILD.builtAt },
    online: navigator.onLine,
    strokes: strokes.length,
    marked,
    errors: reportedErrors().map((e) => clip(e, 600)),
    capture: { ok: !!frame.canvas, ms: frame.ms, method: frame.source, ...(frame.error ? { error: clip(frame.error, 300) } : {}) },
  };
}
