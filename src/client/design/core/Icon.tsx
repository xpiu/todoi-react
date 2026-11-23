// Icon — the one glyph API. Lucide through an explicit map (icons.ts), plus Todoi's own glyphs:
// "circle-todo" (the To-do status: a dial at zero), Ledger variants for the Minimal theme, and
// pixel-snapped panel / list / kanban / calendar glyphs (Rounded's own shapes, and the Ledger view
// glyphs for Minimal), where Lucide's 24-unit grid would blur axis-aligned lines at 16–20px.
// Spec: DESIGN.md › Iconography.
import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";

import { useAppearanceStore } from "./appearance";
import { LUCIDE_ICONS, type LucideIconName } from "./icons";

type SvgNode = [tag: "path" | "circle" | "rect", attrs: Record<string, string | number>];

/** Glyphs Lucide does not ship. Drawn on the 24-unit grid like Lucide's. */
const CUSTOM = {
  "circle-todo": [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "M12 12V6.4" }],
  ],
  // Lucide's "list" bullets are zero-length round-capped dashes that render as fat dots; small squares match the rules.
  "list-thin": [
    ["path", { d: "M8 6h13" }],
    ["path", { d: "M8 12h13" }],
    ["path", { d: "M8 18h13" }],
    ["rect", { x: 2.2, y: 5.2, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" }],
    ["rect", { x: 2.2, y: 11.2, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" }],
    ["rect", { x: 2.2, y: 17.2, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" }],
  ],
  sparkle: [
    [
      "path",
      {
        d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
      },
    ],
  ],
  // Brand marks (Lucide dropped brand icons in 1.x). Filled paths, no stroke.
  "x-logo": [
    [
      "path",
      {
        d: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  github: [
    [
      "path",
      {
        d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  // Lucide 0.454's outline marks (the set Design draws with), for the Share menu
  instagram: [
    ["rect", { x: 2, y: 2, width: 20, height: 20, rx: 5, ry: 5 }],
    ["path", { d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" }],
    ["path", { d: "M17.5 6.5h.01" }],
  ],
  facebook: [["path", { d: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" }]],
  slack: [
    ["rect", { x: 13, y: 2, width: 3, height: 8, rx: 1.5 }],
    ["path", { d: "M19 8.5V10h1.5A1.5 1.5 0 1 0 19 8.5" }],
    ["rect", { x: 8, y: 14, width: 3, height: 8, rx: 1.5 }],
    ["path", { d: "M5 15.5V14H3.5A1.5 1.5 0 1 0 5 15.5" }],
    ["rect", { x: 14, y: 13, width: 8, height: 3, rx: 1.5 }],
    ["path", { d: "M15.5 19H14v1.5a1.5 1.5 0 1 0 1.5-1.5" }],
    ["rect", { x: 2, y: 8, width: 8, height: 3, rx: 1.5 }],
    ["path", { d: "M8.5 5H10V3.5A1.5 1.5 0 1 0 8.5 5" }],
  ],
  discord: [
    [
      "path",
      {
        d: "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
} satisfies Record<string, SvgNode[]>;

/**
 * Design draws with Lucide 0.454 (its CDN build); lucide-react 1.x redrew these glyphs (megaphone, git-branch, the file
 * family…). These pin Design's 0.454 drawings so both match. Only names whose 1.x drawing renders differently are listed;
 * the snapped glyphs (list, kanban, calendar…) keep their own shapes and take precedence.
 */
const DESIGN_LUCIDE: Partial<Record<LucideIconName, SvgNode[]>> = {
  "shopping-cart": [["circle", { cx: 8, cy: 21, r: 1 }], ["circle", { cx: 19, cy: 21, r: 1 }], ["path", { d: "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" }]],
  "book-open": [["path", { d: "M12 7v14" }], ["path", { d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" }]],
  camera: [["path", { d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" }], ["circle", { cx: 12, cy: 13, r: 3 }]],
  "file-spreadsheet": [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M8 13h2" }], ["path", { d: "M14 13h2" }], ["path", { d: "M8 17h2" }], ["path", { d: "M14 17h2" }]],
  "file-archive": [["path", { d: "M10 12v-1" }], ["path", { d: "M10 18v-2" }], ["path", { d: "M10 7V6" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M15.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 .274 1.01" }], ["circle", { cx: 10, cy: 20, r: 2 }]],
  "file-video": [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "m10 11 5 3-5 3v-6Z" }]],
  "file-audio": [["path", { d: "M17.5 22h.5a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M2 19a2 2 0 1 1 4 0v1a2 2 0 1 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 1 1-4 0v-1a2 2 0 1 1 4 0" }]],
  "file-code-2": [["path", { d: "M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "m5 12-3 3 3 3" }], ["path", { d: "m9 18 3-3-3-3" }]],
  file: [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }]],
  "list-checks": [["path", { d: "m3 17 2 2 4-4" }], ["path", { d: "m3 7 2 2 4-4" }], ["path", { d: "M13 6h8" }], ["path", { d: "M13 12h8" }], ["path", { d: "M13 18h8" }]],
  "list-ordered": [["path", { d: "M10 12h11" }], ["path", { d: "M10 18h11" }], ["path", { d: "M10 6h11" }], ["path", { d: "M4 10h2" }], ["path", { d: "M4 6h1v4" }], ["path", { d: "M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" }]],
  "square-check": [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["path", { d: "m9 12 2 2 4-4" }]],
  "text-quote": [["path", { d: "M17 6H3" }], ["path", { d: "M21 12H8" }], ["path", { d: "M21 18H8" }], ["path", { d: "M3 12v6" }]],
  "align-left": [["path", { d: "M15 12H3" }], ["path", { d: "M17 18H3" }], ["path", { d: "M21 6H3" }]],
  apple: [["path", { d: "M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" }], ["path", { d: "M10 2c1 .5 2 2 2 5" }]],
  ban: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "m4.9 4.9 14.2 14.2" }]],
  bell: [["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" }], ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0" }]],
  bookmark: [["path", { d: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" }]],
  "bookmark-plus": [["path", { d: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" }], ["path", { d: "M12 7L12 13" }], ["path", { d: "M15 10L9 10" }]],
  "calendar-off": [["path", { d: "M4.2 4.2A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18" }], ["path", { d: "M21 15.5V6a2 2 0 0 0-2-2H9.5" }], ["path", { d: "M16 2v4" }], ["path", { d: "M3 10h7" }], ["path", { d: "M21 10h-5.5" }], ["path", { d: "m2 2 20 20" }]],
  "calendar-plus": [["path", { d: "M8 2v4" }], ["path", { d: "M16 2v4" }], ["path", { d: "M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" }], ["path", { d: "M3 10h18" }], ["path", { d: "M16 19h6" }], ["path", { d: "M19 16v6" }]],
  "circle-check": [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "m9 12 2 2 4-4" }]],
  "circle-help": [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }], ["path", { d: "M12 17h.01" }]],
  "clipboard-paste": [["path", { d: "M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" }], ["path", { d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10" }], ["path", { d: "m17 10 4 4-4 4" }]],
  "cloud-off": [["path", { d: "m2 2 20 20" }], ["path", { d: "M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" }], ["path", { d: "M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" }]],
  "file-code": [["path", { d: "M10 12.5 8 15l2 2.5" }], ["path", { d: "m14 12.5 2 2.5-2 2.5" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" }]],
  "file-input": [["path", { d: "M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M2 15h10" }], ["path", { d: "m9 18 3-3-3-3" }]],
  "file-output": [["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M4 7V4a2 2 0 0 1 2-2 2 2 0 0 0-2 2" }], ["path", { d: "M4.063 20.999a2 2 0 0 0 2 1L18 22a2 2 0 0 0 2-2V7l-5-5H6" }], ["path", { d: "m5 11-3 3" }], ["path", { d: "m5 17-3-3h10" }]],
  "file-plus": [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M9 15h6" }], ["path", { d: "M12 18v-6" }]],
  "file-plus-2": [["path", { d: "M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M3 15h6" }], ["path", { d: "M6 12v6" }]],
  "file-search": [["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3" }], ["path", { d: "m9 18-1.5-1.5" }], ["circle", { cx: 5, cy: 14, r: 3 }]],
  "file-search-2": [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["circle", { cx: 11.5, cy: 14.5, r: 2.5 }], ["path", { d: "M13.3 16.3 15 18" }]],
  "file-text": [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M10 9H8" }], ["path", { d: "M16 13H8" }], ["path", { d: "M16 17H8" }]],
  "file-up": [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M12 12v6" }], ["path", { d: "m15 15-3-3-3 3" }]],
  filter: [["path", { d: "M22 3L2 3L10 12.46L10 19L14 21L14 12.46L22 3z" }]],
  flag: [["path", { d: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" }], ["path", { d: "M4 22L4 15" }]],
  "flag-off": [["path", { d: "M8 2c3 0 5 2 8 2s4-1 4-1v11" }], ["path", { d: "M4 22V4" }], ["path", { d: "M4 15s1-1 4-1 5 2 8 2" }], ["path", { d: "M2 2L22 22" }]],
  "flask-conical": [["path", { d: "M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" }], ["path", { d: "M8.5 2h7" }], ["path", { d: "M7 16h10" }]],
  folders: [["path", { d: "M20 17a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.9a2 2 0 0 1-1.69-.9l-.81-1.2a2 2 0 0 0-1.67-.9H8a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z" }], ["path", { d: "M2 8v11a2 2 0 0 0 2 2h14" }]],
  "git-branch": [["path", { d: "M6 3L6 15" }], ["circle", { cx: 18, cy: 6, r: 3 }], ["circle", { cx: 6, cy: 18, r: 3 }], ["path", { d: "M18 9a9 9 0 0 1-9 9" }]],
  leaf: [["path", { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" }], ["path", { d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" }]],
  mail: [["rect", { x: 2, y: 4, width: 20, height: 16, rx: 2 }], ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }]],
  megaphone: [["path", { d: "m3 11 18-5v12L3 14v-3z" }], ["path", { d: "M11.6 16.8a3 3 0 1 1-5.8-1.6" }]],
  "message-square": [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
  milestone: [["path", { d: "M12 13v8" }], ["path", { d: "M12 3v3" }], ["path", { d: "M4 6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h13a2 2 0 0 0 1.152-.365l3.424-2.317a1 1 0 0 0 0-1.635l-3.424-2.318A2 2 0 0 0 17 6z" }]],
  moon: [["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }]],
  package: [["path", { d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" }], ["path", { d: "M12 22V12" }], ["path", { d: "m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" }], ["path", { d: "m7.5 4.27 9 5.15" }]],
  palette: [["circle", { cx: 13.5, cy: 6.5, r: 0.5, fill: "currentColor" }], ["circle", { cx: 17.5, cy: 10.5, r: 0.5, fill: "currentColor" }], ["circle", { cx: 8.5, cy: 7.5, r: 0.5, fill: "currentColor" }], ["circle", { cx: 6.5, cy: 12.5, r: 0.5, fill: "currentColor" }], ["path", { d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" }]],
  paperclip: [["path", { d: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" }]],
  play: [["path", { d: "M6 3L20 12L6 21L6 3z" }]],
  plug: [["path", { d: "M12 22v-5" }], ["path", { d: "M9 8V2" }], ["path", { d: "M15 8V2" }], ["path", { d: "M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" }]],
  rocket: [["path", { d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" }], ["path", { d: "m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" }], ["path", { d: "M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" }], ["path", { d: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" }]],
  search: [["circle", { cx: 11, cy: 11, r: 8 }], ["path", { d: "m21 21-4.3-4.3" }]],
  settings: [["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
  "settings-2": [["path", { d: "M20 7h-9" }], ["path", { d: "M14 17H5" }], ["circle", { cx: 17, cy: 17, r: 3 }], ["circle", { cx: 7, cy: 7, r: 3 }]],
  "smile-plus": [["path", { d: "M22 11v1a10 10 0 1 1-9-10" }], ["path", { d: "M8 14s1.5 2 4 2 4-2 4-2" }], ["path", { d: "M9 9L9.01 9" }], ["path", { d: "M15 9L15.01 9" }], ["path", { d: "M16 5h6" }], ["path", { d: "M19 2v6" }]],
  "square-check-big": [["path", { d: "M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5" }], ["path", { d: "m9 11 3 3L22 4" }]],
  "trash-2": [["path", { d: "M3 6h18" }], ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }], ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }], ["path", { d: "M10 11L10 17" }], ["path", { d: "M14 11L14 17" }]],
  "user-cog": [["circle", { cx: 18, cy: 15, r: 3 }], ["circle", { cx: 9, cy: 7, r: 4 }], ["path", { d: "M10 15H6a4 4 0 0 0-4 4v2" }], ["path", { d: "m21.7 16.4-.9-.3" }], ["path", { d: "m15.2 13.9-.9-.3" }], ["path", { d: "m16.6 18.7.3-.9" }], ["path", { d: "m19.1 12.2.3-.9" }], ["path", { d: "m19.6 18.7-.4-1" }], ["path", { d: "m16.8 12.3-.4-1" }], ["path", { d: "m14.3 16.6 1-.4" }], ["path", { d: "m20.7 13.8 1-.4" }]],
  users: [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: 9, cy: 7, r: 4 }], ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }], ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }]],
  warehouse: [["path", { d: "M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" }], ["path", { d: "M6 18h12" }], ["path", { d: "M6 14h12" }], ["rect", { x: 6, y: 10, width: 12, height: 12 }]],
  wrench: [["path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" }]],
  // Not in 0.454: the drawing Design's own Icon pins for it.
  "cloud-check": [["path", { d: "m17 15-5.5 5.5L9 18" }], ["path", { d: "M5 17.743A7 7 0 1 1 15.71 10h1.79a4.5 4.5 0 0 1 1.5 8.742" }]],
};

/** Rounded theme: glyphs made only of axis-aligned lines, drawn in device pixels with an integer stroke. */
const SNAPPED: Record<string, (size: number, stroke: number) => SvgNode[]> = {
  list: (s, w) => {
    const snap = (v: number) => Math.round(v - w / 2) + w / 2;
    const u = s / 24;
    const out: SvgNode[] = [];
    for (const v of [6, 12, 18]) {
      const y = snap(v * u);
      out.push(["rect", { x: Math.round(3 * u - w / 2), y: Math.round(y - w / 2), width: w, height: w, fill: "currentColor", stroke: "none" }]);
      out.push(["path", { d: `M${Math.round(8 * u)} ${y}H${Math.round(21 * u)}` }]);
    }
    return out;
  },
  kanban: (s, w) => {
    const snap = (v: number) => Math.round(v - w / 2) + w / 2;
    const u = s / 24;
    const y = snap(3 * u);
    return (
      [
        [5, 14],
        [12, 8],
        [19, 18],
      ] as const
    ).map(([x, h]) => ["path", { d: `M${snap(x * u)} ${y}v${Math.round(h * u)}` }]);
  },
  calendar: (s, w) => {
    const snap = (v: number) => Math.round(v - w / 2) + w / 2;
    const u = s / 24;
    const l = snap(3 * u), t = snap(4 * u), r = snap(21 * u), b = snap(22 * u), ty = snap(2 * u), th = Math.round(4 * u);
    return [
      ["rect", { x: l, y: t, width: r - l, height: b - t, rx: Math.max(1, Math.round(2 * u)) }],
      ["path", { d: `M${snap(8 * u)} ${ty}v${th}M${snap(16 * u)} ${ty}v${th}M${l} ${snap(10 * u)}H${r}` }],
    ];
  },
  "panel-right": (s, w) => {
    const snap = (v: number) => Math.round(v - w / 2) + w / 2;
    const o = Math.round((s * 2) / 24), c = o + w / 2, d = s - 2 * c, x = snap(c + (d * 2) / 3);
    return [
      ["rect", { x: c, y: c, width: d, height: d, rx: Math.max(1, Math.round((s * 2) / 24)) }],
      ["path", { d: `M${x} ${c}v${d}` }],
    ];
  },
  "panel-left": (s, w) => {
    const snap = (v: number) => Math.round(v - w / 2) + w / 2;
    const o = Math.round((s * 2) / 24), c = o + w / 2, d = s - 2 * c, x = snap(c + d / 3);
    return [
      ["rect", { x: c, y: c, width: d, height: d, rx: Math.max(1, Math.round((s * 2) / 24)) }],
      ["path", { d: `M${x} ${c}v${d}` }],
    ];
  },
};

/**
 * Minimal theme, view glyphs (list · kanban · calendar): the Ledger shapes, drawn in device pixels with every rule centred
 * on a pixel. As 24-unit vectors at 16px their 1.17px axis-aligned rules straddled two pixels and antialiased to grey, so
 * List and Board read dimmer than Calendar and the Lucide glyphs beside them. The stroke keeps the themed weight.
 */
const LEDGER_SNAPPED: Record<string, (size: number) => SvgNode[]> = {
  list: (s) => {
    const u = s / 24;
    const snap = (v: number) => Math.round(v * u - 0.5) + 0.5;
    const out: SvgNode[] = [];
    for (const v of [6, 12, 18]) {
      const y = snap(v);
      out.push(["path", { d: `M${Math.round(8 * u)} ${y}H${Math.round(21 * u)}` }]);
      out.push(["path", { d: `M${snap(3)} ${y}h.01` }]);
    }
    return out;
  },
  kanban: (s) => {
    const u = s / 24;
    const snap = (v: number) => Math.round(v * u - 0.5) + 0.5;
    const y = Math.round(5 * u);
    return (
      [
        [6, 11],
        [12, 6],
        [18, 14],
      ] as const
    ).map(([x, h]) => ["path", { d: `M${snap(x)} ${y}v${Math.round(h * u)}` }]);
  },
  calendar: (s) => SNAPPED.calendar!(s, 1),
  // Sidebar toggles: as 24-unit vectors at 16px the frame's edges and the divider fell between pixels (2px, 14px, 10px
  // lines with a 1.17px stroke) and antialiased to grey. Drawn on pixel centres, the frame is one full pixel of ink.
  "panel-right": (s) => SNAPPED["panel-right"]!(s, 1),
  "panel-left": (s) => SNAPPED["panel-left"]!(s, 1),
  // Plus (create, add an item, add list): Design's fitted cross — both arms on the same pixel centre, each ending on a
  // half pixel, so the 1.5px stroke reads as one crisp line instead of Lucide's 1.17px rules split over two pixels.
  // At 20px: centre 10.5, arms 4.5–16.5 (Design's "M5.4 12.6L19.8 12.6" in 24 units).
  plus: (s) => {
    const c = Math.round(s / 2 - 0.5) + 0.5;
    const h = Math.round((7 * s) / 24);
    return [["path", { d: `M${c - h} ${c}H${c + h}M${c} ${c - h}V${c + h}` }]];
  },
  // Search: the ring's diameter a whole number of pixels with its four edges on pixel centres, so it renders in full
  // ink (Lucide's ring at 14px split its bottom and right edges over two pixels and read grey). At 14px: centre 6,
  // r 4.5, handle to 12.5.
  search: (s) => {
    const u = s / 24;
    const D = Math.round(16 * u),
      r = D / 2;
    const c = Math.round(11 * u - r - 0.5) + 0.5 + r;
    const e = Math.round(21 * u - 0.5) + 0.5;
    const k = +(c + r * Math.SQRT1_2).toFixed(2);
    return [
      ["circle", { cx: c, cy: c, r }],
      ["path", { d: `M${k} ${k}L${e} ${e}` }],
    ];
  },
};
const LEDGER_STROKE = 1.75;

export type IconName = LucideIconName | keyof typeof CUSTOM;

export interface IconProps {
  name: IconName;
  /** 16 for badges and meta, 20 for section headers. @default 16 */
  size?: number;
  /** @default 2 (the Minimal theme draws its own glyphs at 1.75) */
  strokeWidth?: number;
  /** Defaults to currentColor */
  color?: string;
  style?: CSSProperties;
  className?: string;
}

const baseStyle: CSSProperties = { flexShrink: 0, display: "block" };

function RawSvg({ nodes, size, viewBox, stroke, color, style, className, ref }: {
  nodes: SvgNode[]; size: number; viewBox: string; stroke: number; color?: string; style?: CSSProperties; className?: string; ref?: Ref<SVGSVGElement>;
}) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...baseStyle, ...style }}
      className={className}
      aria-hidden
    >
      {nodes.map(([Tag, attrs], i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}

export function Icon({ name, size = 16, strokeWidth = 2, color, style, className }: IconProps) {
  const minimal = useAppearanceStore((s) => s.theme) === "minimal";
  const ledgerSnapped = minimal ? LEDGER_SNAPPED[name] : undefined;
  // Minimal CSS often draws a glyph at another size than its prop (an "Add an item" plus: 16 → 13px). A shape fitted to
  // the prop then lands between pixels, so the drawn width is read once after layout and the shape is fitted to it
  // (as Design's Icon does). Whole-pixel sizes only; no observers.
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!ledgerSnapped || !svgRef.current) return;
    const w = parseFloat(getComputedStyle(svgRef.current).width);
    const px = Math.round(w);
    setDrawn(Math.abs(w - px) < 0.01 && px >= 8 && px !== size ? px : null);
  }, [ledgerSnapped, size]);
  if (ledgerSnapped) {
    const fit = drawn ?? size;
    // The width also goes inline: the theme's `svg { stroke-width: 1.75 }` rules assume a 24-unit viewBox and would outrank the attribute.
    const sw = (LEDGER_STROKE * fit) / 24;
    return <RawSvg ref={svgRef} nodes={ledgerSnapped(fit)} size={size} viewBox={`0 0 ${fit} ${fit}`} stroke={sw} color={color} style={{ strokeWidth: sw, ...style }} className={className} />;
  }
  const snapped = !minimal ? SNAPPED[name] : undefined;
  if (snapped) {
    const sw = (strokeWidth * size) / 24;
    const w = sw >= 1.9 ? Math.round(sw) : sw > 1.4 ? 1.5 : 1;
    return <RawSvg nodes={snapped(size, w)} size={size} viewBox={`0 0 ${size} ${size}`} stroke={w} color={color} style={style} className={className} />;
  }
  const custom: SvgNode[] | undefined = (CUSTOM as Partial<Record<IconName, SvgNode[]>>)[name] ?? DESIGN_LUCIDE[name as LucideIconName];
  if (custom) return <RawSvg nodes={custom} size={size} viewBox="0 0 24 24" stroke={strokeWidth} color={color} style={style} className={className} />;
  const Lucide = LUCIDE_ICONS[name as LucideIconName];
  if (!Lucide) {
    // A theme variant that has no Lucide fallback (or a stale name): draw the neutral circle instead of crashing.
    if (import.meta.env.DEV) console.warn(`Icon: "${name}" is not in the icon map`);
    return <RawSvg nodes={[["circle", { cx: 12, cy: 12, r: 10 }]]} size={size} viewBox="0 0 24 24" stroke={strokeWidth} color={color} style={style} className={className} />;
  }
  return <Lucide size={size} strokeWidth={strokeWidth} color={color} style={{ ...baseStyle, ...style }} className={className} aria-hidden />;
}
