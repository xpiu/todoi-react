// Appearance — the ONE per-device display-preference store behind the SubNavbar Style dropdown
// and Settings › Appearance (spec: DESIGN.md › Appearance preferences). First Zustand use.
//
// Two axes from themes.ts: theme × mode. Background and Foreground picks are remembered PER
// theme × mode slot; Colorize Board columns, Suggest shortcuts and Sidebar on left side are
// remembered PER theme (Rounded ships Colorize + Suggest on, Minimal off; sidebar-left off in both).
// Persisted under one localStorage key, `td-appearance`; the design-system kit's td-* keys migrate
// on first read. DOM effects (<html data-theme data-mode data-colorize-columns data-sidebar-side>,
// --chrome-canvas and the surface overrides) are applied from here, before React mounts.
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_IDS,
  THEME_IDS,
  backgroundsOf,
  defaultBackground,
  defaultForeground,
  foregroundsOf,
  isMode,
  isTheme,
  type ModeId,
  type ThemeBackground,
  type ThemeForeground,
  type ThemeId,
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_STORAGE_VERSION,
} from "./themes";

export const STATUS_DISPLAY_OPTIONS = [
  { id: "informative", label: "When informative" },
  { id: "always", label: "Always" },
  { id: "never", label: "Never" },
] as const;
export type StatusDisplay = (typeof STATUS_DISPLAY_OPTIONS)[number]["id"];

interface SlotPicks {
  /** hex for --chrome-canvas; null = the theme's default */
  background: string | null;
  /** Foreground preset id; null = none / default */
  foreground: string | null;
}
interface ThemePrefs {
  colorizeColumns: boolean;
  suggestShortcuts: boolean;
  sidebarLeft: boolean;
}

const THEME_PREF_DEFAULTS: Record<ThemeId, ThemePrefs> = {
  rounded: { colorizeColumns: true, suggestShortcuts: true, sidebarLeft: false },
  minimal: { colorizeColumns: false, suggestShortcuts: false, sidebarLeft: false },
};

/** What is persisted. Slot and per-theme maps are sparse: a missing entry means "default". */
interface PersistedState {
  theme: ThemeId;
  mode: ModeId;
  slots: Partial<Record<`${ThemeId}-${ModeId}`, Partial<SlotPicks>>>;
  themePrefs: Partial<Record<ThemeId, Partial<ThemePrefs>>>;
  showItemIds: boolean;
  showLabels: boolean;
  statusDisplay: StatusDisplay;
}

/** The resolved view every consumer reads. */
export interface AppearanceState extends ThemePrefs {
  theme: ThemeId;
  mode: ModeId;
  background: string | null;
  foreground: string | null;
  showItemIds: boolean;
  showLabels: boolean;
  statusDisplay: StatusDisplay;
}

export const APPEARANCE_DEFAULTS: AppearanceState = {
  theme: DEFAULT_THEME,
  mode: DEFAULT_MODE,
  background: defaultBackground(DEFAULT_THEME, DEFAULT_MODE),
  foreground: defaultForeground(DEFAULT_THEME, DEFAULT_MODE),
  showItemIds: true,
  showLabels: true,
  statusDisplay: "informative",
  ...THEME_PREF_DEFAULTS[DEFAULT_THEME],
};

const PERSISTED_DEFAULTS: PersistedState = {
  theme: DEFAULT_THEME,
  mode: DEFAULT_MODE,
  slots: {},
  themePrefs: {},
  showItemIds: true,
  showLabels: true,
  statusDisplay: "informative",
};

const slotKey = (theme: ThemeId, mode: ModeId) => `${theme}-${mode}` as const;

/** Preserve saved colors and per-theme settings when Standard becomes Rounded. */
function migrateStoredAppearance(persisted: unknown): Partial<PersistedState> {
  const p = (persisted ?? {}) as Omit<Partial<PersistedState>, "theme"> & { theme?: ThemeId | "standard" };
  const slots: Record<string, Partial<SlotPicks>> = { ...p.slots };
  const themePrefs: Record<string, Partial<ThemePrefs>> = { ...p.themePrefs };
  for (const mode of MODE_IDS) {
    const oldKey = `standard-${mode}`;
    const newKey = slotKey("rounded", mode);
    if (slots[oldKey]) slots[newKey] ??= slots[oldKey];
    delete slots[oldKey];
  }
  if (themePrefs.standard) themePrefs.rounded ??= themePrefs.standard;
  delete themePrefs.standard;
  return { ...p, theme: p.theme === "standard" ? "rounded" : p.theme, slots, themePrefs };
}

// ── Resolution ─────────────────────────────────────────────────────────────────
function resolveSlot(s: PersistedState, theme: ThemeId, mode: ModeId): SlotPicks {
  const picks = s.slots[slotKey(theme, mode)] ?? {};
  const bg = picks.background;
  const fg = picks.foreground;
  return {
    // A remembered pick the palette no longer offers falls back to the default.
    background: bg != null && backgroundsOf(theme, mode).some((o) => o.value === bg) ? bg : defaultBackground(theme, mode),
    foreground: fg != null && foregroundsOf(theme, mode).some((o) => o.id === fg) ? fg : defaultForeground(theme, mode),
  };
}
function resolveThemePrefs(s: PersistedState, theme: ThemeId): ThemePrefs {
  return { ...THEME_PREF_DEFAULTS[theme], ...s.themePrefs[theme] };
}
export function resolveAppearance(s: PersistedState): AppearanceState {
  return {
    theme: s.theme,
    mode: s.mode,
    ...resolveSlot(s, s.theme, s.mode),
    ...resolveThemePrefs(s, s.theme),
    showItemIds: s.showItemIds,
    showLabels: s.showLabels,
    statusDisplay: s.statusDisplay,
  };
}

// ── Migration from the design-system kit's td-* keys (one-time, best effort) ───
function migrateLegacyKeys(): Partial<PersistedState> | null {
  if (typeof localStorage === "undefined") return null;
  const get = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const savedTheme = get("td-theme");
  const theme = savedTheme === "standard" ? "rounded" : savedTheme;
  const mode = get("td-mode");
  if (theme == null && mode == null) return null;
  const out: Partial<PersistedState> = { slots: {}, themePrefs: {} };
  if (isTheme(theme)) out.theme = theme;
  if (isMode(mode)) out.mode = mode;
  const bool = (k: string) => (get(k) == null ? undefined : get(k) !== "0");
  out.showItemIds = bool("td-show-ids");
  out.showLabels = bool("td-show-labels");
  const sd = get("td-status-display");
  if (sd && STATUS_DISPLAY_OPTIONS.some((o) => o.id === sd)) out.statusDisplay = sd as StatusDisplay;
  for (const t of THEME_IDS) {
    const legacyTheme = t === "rounded" ? "standard" : t;
    for (const m of MODE_IDS) {
      const background = get(`td-bg-${legacyTheme}-${m}`);
      const foreground = get(`td-fg-${legacyTheme}-${m}`);
      if (background != null || foreground != null) out.slots![slotKey(t, m)] = { background, foreground };
    }
    const prefs: Partial<ThemePrefs> = {};
    const c = bool(`td-colorize-columns-${legacyTheme}`);
    const s = bool(`td-suggest-shortcuts-${legacyTheme}`);
    const l = bool(`td-sidebar-left-${legacyTheme}`);
    if (c !== undefined) prefs.colorizeColumns = c;
    if (s !== undefined) prefs.suggestShortcuts = s;
    if (l !== undefined) prefs.sidebarLeft = l;
    if (Object.keys(prefs).length) out.themePrefs![t] = prefs;
  }
  // Strip undefined so the merge below keeps defaults.
  return JSON.parse(JSON.stringify(out));
}

// ── Store ──────────────────────────────────────────────────────────────────────
export type AppearancePatch = Partial<Omit<AppearanceState, "theme" | "mode">> & { theme?: ThemeId; mode?: ModeId };

interface AppearanceStore extends PersistedState {
  /** Patch one or more preferences. Background / Foreground write the current theme × mode slot;
   *  Colorize / Suggest / Sidebar-left write the current theme; changing theme or mode brings that slot's picks back. */
  set: (patch: AppearancePatch) => void;
  reset: () => void;
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set, get) => ({
      ...PERSISTED_DEFAULTS,
      set: (patch) => {
        const cur = get();
        const theme = patch.theme && isTheme(patch.theme) ? patch.theme : cur.theme;
        const mode = patch.mode && isMode(patch.mode) ? patch.mode : cur.mode;
        const next: Partial<PersistedState> = { theme, mode };
        if (patch.background !== undefined || patch.foreground !== undefined) {
          const key = slotKey(theme, mode);
          const slot = { ...cur.slots[key] };
          if (patch.background !== undefined) slot.background = patch.background;
          if (patch.foreground !== undefined) {
            slot.foreground =
              patch.foreground != null && !foregroundsOf(theme, mode).some((o) => o.id === patch.foreground)
                ? slot.foreground
                : patch.foreground;
          }
          next.slots = { ...cur.slots, [key]: slot };
        }
        const themePrefPatch: Partial<ThemePrefs> = {};
        if (patch.colorizeColumns !== undefined) themePrefPatch.colorizeColumns = patch.colorizeColumns;
        if (patch.suggestShortcuts !== undefined) themePrefPatch.suggestShortcuts = patch.suggestShortcuts;
        if (patch.sidebarLeft !== undefined) themePrefPatch.sidebarLeft = patch.sidebarLeft;
        if (Object.keys(themePrefPatch).length) {
          next.themePrefs = { ...cur.themePrefs, [theme]: { ...cur.themePrefs[theme], ...themePrefPatch } };
        }
        if (patch.showItemIds !== undefined) next.showItemIds = patch.showItemIds;
        if (patch.showLabels !== undefined) next.showLabels = patch.showLabels;
        if (patch.statusDisplay !== undefined && STATUS_DISPLAY_OPTIONS.some((o) => o.id === patch.statusDisplay)) {
          next.statusDisplay = patch.statusDisplay;
        }
        set(next);
      },
      reset: () => set({ ...PERSISTED_DEFAULTS }),
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        theme: s.theme,
        mode: s.mode,
        slots: s.slots,
        themePrefs: s.themePrefs,
        showItemIds: s.showItemIds,
        showLabels: s.showLabels,
        statusDisplay: s.statusDisplay,
      }),
      merge: (persisted, current) => {
        const legacy = persisted == null ? migrateLegacyKeys() : null;
        const p = (persisted as Partial<PersistedState> | undefined) ?? legacy ?? {};
        return {
          ...current,
          ...p,
          theme: isTheme(p.theme) ? p.theme : current.theme,
          mode: isMode(p.mode) ? p.mode : current.mode,
          slots: p.slots ?? {},
          themePrefs: p.themePrefs ?? {},
        };
      },
      version: APPEARANCE_STORAGE_VERSION,
      migrate: migrateStoredAppearance,
    },
  ),
);

// ── DOM side effects ───────────────────────────────────────────────────────────
export function applyAppearance(a: AppearanceState) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-theme", a.theme);
  el.setAttribute("data-mode", a.mode);
  if (a.background) el.style.setProperty("--chrome-canvas", a.background);
  else el.style.removeProperty("--chrome-canvas");
  const fg = foregroundsOf(a.theme, a.mode).find((o) => o.id === a.foreground);
  const bg = backgroundsOf(a.theme, a.mode).find((o) => o.value === a.background);
  const surfaces: Array<[string, string]> | null = fg
    ? [["--surface-list", fg.list], ["--surface-card", fg.card], ["--surface-panel", fg.panel]]
    : bg?.surfaces
      ? [["--surface-list", bg.value], ["--surface-card", bg.value], ["--surface-panel", bg.value]]
      : null;
  for (const name of ["--surface-list", "--surface-card", "--surface-panel"]) {
    const v = surfaces?.find(([n]) => n === name)?.[1];
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
  }
  el.setAttribute("data-colorize-columns", a.colorizeColumns ? "true" : "false");
  el.setAttribute("data-sidebar-side", a.sidebarLeft ? "left" : "right");
}

if (typeof window !== "undefined") {
  applyAppearance(resolveAppearance(useAppearanceStore.getState()));
  useAppearanceStore.subscribe((s) => applyAppearance(resolveAppearance(s)));
  // Another tab changed the preference: re-read and re-apply.
  window.addEventListener("storage", (e) => {
    if (e.key === APPEARANCE_STORAGE_KEY) void useAppearanceStore.persist.rehydrate();
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export interface Appearance extends AppearanceState {
  set: (patch: AppearancePatch) => void;
  reset: () => void;
  backgrounds: ReadonlyArray<ThemeBackground>;
  foregrounds: ReadonlyArray<ThemeForeground>;
}

/** The resolved appearance plus `set` / `reset` and the pickable palettes for the current theme × mode. */
export function useAppearance(): Appearance {
  const theme = useAppearanceStore((s) => s.theme);
  const mode = useAppearanceStore((s) => s.mode);
  const slots = useAppearanceStore((s) => s.slots);
  const themePrefs = useAppearanceStore((s) => s.themePrefs);
  const showItemIds = useAppearanceStore((s) => s.showItemIds);
  const showLabels = useAppearanceStore((s) => s.showLabels);
  const statusDisplay = useAppearanceStore((s) => s.statusDisplay);
  const set = useAppearanceStore((s) => s.set);
  const reset = useAppearanceStore((s) => s.reset);
  return useMemo(
    () => ({
      ...resolveAppearance({ theme, mode, slots, themePrefs, showItemIds, showLabels, statusDisplay }),
      set,
      reset,
      backgrounds: backgroundsOf(theme, mode),
      foregrounds: foregroundsOf(theme, mode),
    }),
    [theme, mode, slots, themePrefs, showItemIds, showLabels, statusDisplay, set, reset],
  );
}

/** Non-React read (tests, imperative code). */
export const getAppearance = () => resolveAppearance(useAppearanceStore.getState());

// Dev only: lets browser tests and the console drive the store (`window.__todoi.appearance`).
if (import.meta.env.DEV && typeof window !== "undefined") {
  const w = window as unknown as { __todoi?: Record<string, unknown> };
  w.__todoi = { ...w.__todoi, appearance: { store: useAppearanceStore, get: getAppearance } };
}
