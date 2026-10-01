// Viewport — the one place device classes and the touch flag are declared.
// Components stay free of @media rules: they read html[data-device] / html[data-touch] in CSS,
// or call useViewport() when they need a branch. Spec: DESIGN.md › Responsive.
import { useSyncExternalStore } from "react";

export type Device = "desktop" | "tablet" | "phone";
export interface ViewportState {
  device: Device;
  touch: boolean;
  desktop: boolean;
  phone: boolean;
}

export const DEVICE_QUERIES: Record<Device, string> = {
  desktop: "(min-width: 1024px)",
  tablet: "(min-width: 768px) and (max-width: 1023px)",
  phone: "(max-width: 767px)",
};
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

const mm = (q: string) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q) : null);
const isDevice = (v: string | null): v is Device => v === "desktop" || v === "tablet" || v === "phone";

/** Synchronous read. Tests and specimen pages force a class with <html data-force-device="phone" data-force-touch="true">. */
export function getViewport(): ViewportState {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const forcedDevice = root?.getAttribute("data-force-device") ?? null;
  const forcedTouch = root?.getAttribute("data-force-touch") ?? null;
  let device: Device = "desktop";
  if (isDevice(forcedDevice)) device = forcedDevice;
  else if (mm(DEVICE_QUERIES.desktop)?.matches) device = "desktop";
  else if (mm(DEVICE_QUERIES.tablet)?.matches) device = "tablet";
  else if (mm(DEVICE_QUERIES.phone)) device = "phone";
  const touch = forcedTouch != null ? forcedTouch === "true" : !!mm(TOUCH_QUERY)?.matches;
  return { device, touch, desktop: device === "desktop", phone: device === "phone" };
}

/** Writes data-device / data-touch to <html>. */
export function applyViewportAttrs(v: ViewportState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.getAttribute("data-device") !== v.device) root.setAttribute("data-device", v.device);
  if (root.getAttribute("data-touch") !== String(v.touch)) root.setAttribute("data-touch", String(v.touch));
}

// One snapshot shared by every subscriber; replaced only when a query flips, so React sees a stable object.
let snapshot = getViewport();
const same = (a: ViewportState, b: ViewportState) => a.device === b.device && a.touch === b.touch;
function refresh() {
  const next = getViewport();
  if (!same(next, snapshot)) {
    snapshot = next;
    applyViewportAttrs(snapshot);
  }
  return snapshot;
}
function subscribe(onChange: () => void) {
  const queries = [DEVICE_QUERIES.desktop, DEVICE_QUERIES.tablet, TOUCH_QUERY].map(mm).filter((q): q is MediaQueryList => !!q);
  const handler = () => {
    refresh();
    onChange();
  };
  queries.forEach((q) => q.addEventListener("change", handler));
  return () => queries.forEach((q) => q.removeEventListener("change", handler));
}
const getSnapshot = () => snapshot;
const serverSnapshot: ViewportState = { device: "desktop", touch: false, desktop: true, phone: false };

/** Hook: re-renders when a media query flips; keeps <html> attributes in sync. */
export function useViewport(): ViewportState {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

// Static first paint: mark <html> before React mounts so touch-only CSS applies from the first frame.
applyViewportAttrs(snapshot);
