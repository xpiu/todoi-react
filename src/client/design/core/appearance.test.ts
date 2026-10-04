/* oxlint-disable design/no-raw-hex -- Fixtures exercise persisted palette values, not component styling. */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY, APPEARANCE_STORAGE_VERSION } from "./themes";

let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

function save(state: unknown, version = APPEARANCE_STORAGE_VERSION) {
  storage.set(APPEARANCE_STORAGE_KEY, JSON.stringify({ state, version }));
}

describe("appearance defaults and migration", () => {
  it("starts new devices in Minimal light and resets to the same preferences", async () => {
    const { APPEARANCE_DEFAULTS, getAppearance, useAppearanceStore } = await import("./appearance");
    expect(getAppearance()).toEqual(APPEARANCE_DEFAULTS);
    expect(getAppearance()).toMatchObject({ theme: "minimal", mode: "light", background: "#ffffff", foreground: null, colorizeColumns: false, suggestShortcuts: false });
    useAppearanceStore.getState().set({ theme: "rounded", mode: "dark", background: "#111b32", sidebarLeft: true });
    useAppearanceStore.getState().reset();
    expect(getAppearance()).toEqual(APPEARANCE_DEFAULTS);
  });

  it("migrates Standard and both saved mode palettes without losing preferences", async () => {
    save({
      theme: "standard", mode: "dark", showLabels: false,
      slots: { "standard-dark": { background: "#111b32", foreground: "pitch" }, "standard-light": { background: "#5ed8a9" }, "minimal-light": { background: "#f7f5f0" } },
      themePrefs: { standard: { colorizeColumns: false, suggestShortcuts: false, sidebarLeft: true } },
    }, 1);
    const { getAppearance, useAppearanceStore } = await import("./appearance");
    expect(getAppearance()).toMatchObject({ theme: "rounded", mode: "dark", background: "#111b32", foreground: "pitch", showLabels: false, sidebarLeft: true, colorizeColumns: false, suggestShortcuts: false });
    const stored = JSON.parse(storage.get(APPEARANCE_STORAGE_KEY)!);
    expect(stored.version).toBe(APPEARANCE_STORAGE_VERSION);
    expect(stored.state.slots).not.toHaveProperty("standard-dark");
    expect(stored.state.themePrefs).not.toHaveProperty("standard");
    useAppearanceStore.getState().set({ mode: "light" });
    expect(getAppearance().background).toBe("#5ed8a9");
    useAppearanceStore.getState().set({ theme: "minimal" });
    expect(getAppearance().background).toBe("#f7f5f0");
  });

  it("preserves existing Minimal dark preferences and inactive Standard picks", async () => {
    save({ theme: "minimal", mode: "dark", slots: { "minimal-dark": { background: "#1b1917" }, "standard-light": { background: "#b191ea" } } }, 1);
    const { getAppearance, useAppearanceStore } = await import("./appearance");
    expect(getAppearance()).toMatchObject({ theme: "minimal", mode: "dark", background: "#1b1917" });
    useAppearanceStore.getState().set({ theme: "rounded", mode: "light" });
    expect(getAppearance().background).toBe("#b191ea");
  });

  it("still imports the design kit's old Standard keys", async () => {
    storage.set("td-theme", "standard");
    storage.set("td-mode", "light");
    storage.set("td-bg-standard-light", "#7c9fff");
    storage.set("td-sidebar-left-standard", "1");
    const { getAppearance } = await import("./appearance");
    expect(getAppearance()).toMatchObject({ theme: "rounded", mode: "light", background: "#7c9fff", sidebarLeft: true });
  });

  it("rehydrates current Rounded preferences", async () => {
    save({ theme: "rounded", mode: "dark", slots: { "rounded-dark": { foreground: "graphite" } } });
    const { getAppearance } = await import("./appearance");
    expect(getAppearance()).toMatchObject({ theme: "rounded", mode: "dark", foreground: "graphite" });
  });
});

describe("pre-paint appearance", () => {
  const html = readFileSync(new URL("../../../../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
  function paint() {
    const attrs = Object.fromEntries([...html.matchAll(/(data-theme|data-mode)="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    runInNewContext(script, { localStorage, document: { documentElement: { setAttribute: (key: string, value: string) => { attrs[key] = value; } } } });
    return attrs;
  }
  it("paints Minimal light before the app loads on a new device", () => {
    expect(paint()).toEqual({ "data-theme": "minimal", "data-mode": "light" });
  });
  it.each(["standard", "rounded"])("paints saved %s as Rounded before the app loads", (theme) => {
    save({ theme, mode: "dark" }, 1);
    expect(paint()).toEqual({ "data-theme": "rounded", "data-mode": "dark" });
  });
  it("keeps the defaults if storage is corrupt", () => {
    storage.set(APPEARANCE_STORAGE_KEY, "invalid JSON");
    expect(paint()).toEqual({ "data-theme": "minimal", "data-mode": "light" });
  });
});
