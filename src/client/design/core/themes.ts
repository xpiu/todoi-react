// Theme registry — the one declaration of Todoi's app themes and their per-mode palettes.
// Two axes: theme (Rounded · Minimal: look and feel) × mode (dark · light: colour scheme).
// CSS twin: src/client/design/tokens/themes/<theme>.css, scoped by <html data-theme data-mode>.
// Adding a theme = one entry in THEMES + one tokens/themes/<id>.css + one @import in index.css.
// Spec: DESIGN.md › Visual foundations › Themes × modes, Background swatches.

export const THEME_IDS = ["rounded", "minimal"] as const;
export const MODE_IDS = ["dark", "light"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ModeId = (typeof MODE_IDS)[number];

export const DEFAULT_THEME: ThemeId = "minimal";
export const DEFAULT_MODE: ModeId = "light";

/** Where the Appearance store persists (zustand `persist`); the browser tests seed the same key. */
export const APPEARANCE_STORAGE_KEY = "td-appearance";
export const APPEARANCE_STORAGE_VERSION = 2;

export const MODES: ReadonlyArray<{ id: ModeId; label: string; icon: "moon" | "sun" }> = [
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "light", label: "Light", icon: "sun" },
];

/** A Background pick: the hex applied to --chrome-canvas. */
export interface ThemeBackground {
  value: string;
  label: string;
  /** Tooltip; defaults to label */
  title?: string;
  /** Check-mark colour on the swatch; defaults to the navy chrome ink */
  ink?: string;
  /** The pick is the paper itself: --surface-card/list/panel follow it (Minimal) */
  surfaces?: boolean;
  /** Swatch shape; Minimal uses "square" */
  shape?: "circle" | "square";
}

/** A Foreground preset: the three content surfaces. */
export interface ThemeForeground {
  id: string;
  label: string;
  title?: string;
  list: string;
  card: string;
  panel: string;
  ink?: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  backgrounds: Record<ModeId, ReadonlyArray<ThemeBackground>>;
  /** An empty list for a mode disables the Foreground control there */
  foregrounds: Record<ModeId, ReadonlyArray<ThemeForeground>>;
}

// ── Rounded ──────────────────────────────────────────────────────────────────────
// Light backgrounds all take navy ink at ≥5:1.
export const ROUNDED_LIGHT_BACKGROUNDS: ThemeBackground[] = [
  { value: "#f6d653", label: "Butter" },
  { value: "#7c9fff", label: "Cornflower" },
  { value: "#b191ea", label: "Lavender" },
  { value: "#5ed8a9", label: "Mint" },
  { value: "#fca676", label: "Peach" },
];
export const ROUNDED_DARK_BACKGROUNDS: ThemeBackground[] = [
  { value: "#161617", label: "Graphite", ink: "#f2f2f3" },
  { value: "#111b32", label: "Midnight blue", ink: "#f2f2f3" },
  { value: "#1a1633", label: "Deep indigo", ink: "#f2f2f3" },
  { value: "#0c211e", label: "Dark teal", ink: "#f2f2f3" },
  { value: "#251429", label: "Dark plum", ink: "#f2f2f3" },
];
// The first preset is the default; "graphite" equals what tokens/themes/rounded.css ships.
export const ROUNDED_DARK_FOREGROUNDS: ThemeForeground[] = [
  { id: "carbon", label: "Carbon", title: "Carbon (default)", list: "#141415", card: "#1d1d1e", panel: "#18181a", ink: "#f2f2f3" },
  { id: "graphite", label: "Graphite", list: "#1a1a1b", card: "#242425", panel: "#1f1f20", ink: "#f2f2f3" },
  { id: "pitch", label: "Pitch", list: "#0e0e0f", card: "#171718", panel: "#121213", ink: "#f2f2f3" },
];
export const ROUNDED_LIGHT_FOREGROUNDS: ThemeForeground[] = [];

// ── Minimal ("Ledger") ────────────────────────────────────────────────────────────
// Background = the paper, no Foreground: a pick also moves the surfaces (surfaces: true).
export const MINIMAL_LIGHT_BACKGROUNDS: ThemeBackground[] = [
  { value: "#ffffff", label: "White", ink: "#000000", surfaces: true, shape: "square" },
  { value: "#f7f5f0", label: "Paper", title: "Paper — warm off-white", ink: "#000000", surfaces: true, shape: "square" },
];
export const MINIMAL_DARK_BACKGROUNDS: ThemeBackground[] = [
  { value: "#15171c", label: "Slate", title: "Slate — cool near-black (default)", ink: "#f2f2f3", surfaces: true, shape: "square" },
  { value: "#1b1917", label: "Ink", title: "Ink — warm near-black, the dark Paper", ink: "#f2f2f3", surfaces: true, shape: "square" },
  { value: "#141415", label: "Black", ink: "#f2f2f3", surfaces: true, shape: "square" },
  { value: "#121110", label: "Soot", title: "Soot — deepest black with a trace of warmth", ink: "#f2f2f3", surfaces: true, shape: "square" },
  { value: "#0e0e0e", label: "Carbon", title: "Carbon — pure deep black", ink: "#f2f2f3", surfaces: true, shape: "square" },
];
export const MINIMAL_DARK_FOREGROUNDS: ThemeForeground[] = [];
export const MINIMAL_LIGHT_FOREGROUNDS: ThemeForeground[] = [];

export const THEMES: ReadonlyArray<ThemeDefinition> = [
  {
    id: "rounded",
    label: "Rounded",
    description: "Rounded corners, colored chrome, cream lists and white cards.",
    backgrounds: { dark: ROUNDED_DARK_BACKGROUNDS, light: ROUNDED_LIGHT_BACKGROUNDS },
    foregrounds: { dark: ROUNDED_DARK_FOREGROUNDS, light: ROUNDED_LIGHT_FOREGROUNDS },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Ledger — plain paper, hairlines instead of fills, black and grey type.",
    backgrounds: { dark: MINIMAL_DARK_BACKGROUNDS, light: MINIMAL_LIGHT_BACKGROUNDS },
    foregrounds: { dark: MINIMAL_DARK_FOREGROUNDS, light: MINIMAL_LIGHT_FOREGROUNDS },
  },
];

export const isTheme = (id: unknown): id is ThemeId => THEME_IDS.includes(id as ThemeId);
export const isMode = (id: unknown): id is ModeId => MODE_IDS.includes(id as ModeId);
export const getTheme = (id: string): ThemeDefinition => THEMES.find((t) => t.id === id) ?? THEMES[0]!;
export const backgroundsOf = (theme: ThemeId, mode: ModeId) => getTheme(theme).backgrounds[mode];
export const foregroundsOf = (theme: ThemeId, mode: ModeId) => getTheme(theme).foregrounds[mode];
export const defaultBackground = (theme: ThemeId, mode: ModeId) => backgroundsOf(theme, mode)[0]?.value ?? null;
export const defaultForeground = (theme: ThemeId, mode: ModeId) => foregroundsOf(theme, mode)[0]?.id ?? null;
