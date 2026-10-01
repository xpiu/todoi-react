// Icon — the one glyph API. Lucide through an explicit map (icons.ts), plus Todoi's own glyphs:
// "circle-todo" (the To-do status: a dial at zero), Ledger variants for the Minimal theme, and
// pixel-snapped panel / list / kanban / calendar glyphs for Standard, where Lucide's 24-unit grid
// would blur axis-aligned lines at 16–20px. Spec: DESIGN.md › Iconography.
import type { CSSProperties } from "react";

import { useAppearanceStore } from "./appearance";
import { LUCIDE_ICONS, type LucideIconName } from "./icons";

type SvgNode = [tag: "path" | "circle" | "rect", attrs: Record<string, string | number>];

/** Glyphs Lucide does not ship. Drawn on the 24-unit grid like Lucide's. */
const CUSTOM: Record<string, SvgNode[]> = {
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
};

/** Minimal theme: the exact glyphs from the Ledger prototype, vector stroke 1.75. */
const LEDGER: Record<string, SvgNode[]> = {
  list: [
    ["path", { d: "M8 6h13" }],
    ["path", { d: "M8 12h13" }],
    ["path", { d: "M8 18h13" }],
    ["path", { d: "M3 6h.01" }],
    ["path", { d: "M3 12h.01" }],
    ["path", { d: "M3 18h.01" }],
  ],
  kanban: [
    ["path", { d: "M6 5v11" }],
    ["path", { d: "M12 5v6" }],
    ["path", { d: "M18 5v14" }],
  ],
  calendar: [
    ["path", { d: "M8 2v4" }],
    ["path", { d: "M16 2v4" }],
    ["rect", { width: 18, height: 18, x: 3, y: 4, rx: 2 }],
    ["path", { d: "M3 10h18" }],
  ],
  "panel-right": [
    ["rect", { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
    ["path", { d: "M15 3v18" }],
  ],
};

/** Standard theme: glyphs made only of axis-aligned lines, drawn in device pixels with an integer stroke. */
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

function RawSvg({ nodes, size, viewBox, stroke, color, style, className }: {
  nodes: SvgNode[]; size: number; viewBox: string; stroke: number; color?: string; style?: CSSProperties; className?: string;
}) {
  return (
    <svg
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
  const ledger = minimal ? LEDGER[name] : undefined;
  if (ledger) return <RawSvg nodes={ledger} size={size} viewBox="0 0 24 24" stroke={1.75} color={color} style={style} className={className} />;
  const snapped = !minimal ? SNAPPED[name] : undefined;
  if (snapped) {
    const sw = (strokeWidth * size) / 24;
    const w = sw >= 1.9 ? Math.round(sw) : sw > 1.4 ? 1.5 : 1;
    return <RawSvg nodes={snapped(size, w)} size={size} viewBox={`0 0 ${size} ${size}`} stroke={w} color={color} style={style} className={className} />;
  }
  const custom = CUSTOM[name];
  if (custom) return <RawSvg nodes={custom} size={size} viewBox="0 0 24 24" stroke={strokeWidth} color={color} style={style} className={className} />;
  const Lucide = LUCIDE_ICONS[name as LucideIconName];
  if (!Lucide) {
    // A theme variant that has no Lucide fallback (or a stale name): draw the neutral circle instead of crashing.
    if (import.meta.env.DEV) console.warn(`Icon: "${name}" is not in the icon map`);
    return <RawSvg nodes={[["circle", { cx: 12, cy: 12, r: 10 }]]} size={size} viewBox="0 0 24 24" stroke={strokeWidth} color={color} style={style} className={className} />;
  }
  return <Lucide size={size} strokeWidth={strokeWidth} color={color} style={{ ...baseStyle, ...style }} className={className} aria-hidden />;
}
