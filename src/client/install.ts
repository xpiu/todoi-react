// Home-screen install (Settings › Storage & sync › Install app). Chromium browsers offer their install
// prompt through `beforeinstallprompt`, which fires once, early: main.tsx imports this module before the
// first render so the event is kept for the Install button. Safari has no prompt; the row explains its way.
import { useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const standalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** "installed" in the app window, "prompt" when the browser offers its install dialog, else "manual" */
export function useInstallState(): { state: "installed" | "prompt" | "manual"; install: () => Promise<void> } {
  const event = useSyncExternalStore(subscribe, () => deferred, () => null);
  return {
    state: standalone() ? "installed" : event ? "prompt" : "manual",
    install: async () => {
      if (!deferred) return;
      const shown = deferred;
      await shown.prompt();
      await shown.userChoice.catch(() => undefined);
      deferred = null;
      notify();
    },
  };
}

/** How to add todoi to the home screen where the browser has no prompt to show */
export const INSTALL_HINT = /iPhone|iPad|iPod/.test(typeof navigator === "undefined" ? "" : navigator.userAgent)
  ? "In Safari, tap Share, then Add to Home Screen"
  : "Use your browser's menu: Install todoi, or Add to Home screen";
