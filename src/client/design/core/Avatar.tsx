// Avatar + AvatarStack. Initials fall back to the label palette (tokens, never hexes) so avatars
// sit inside every theme; the Account page's "Avatar colour" swatches use the same eight tokens.
import type { CSSProperties } from "react";

import "./Avatar.css";

const LABEL_COLOR_NAMES = ["blue", "pink", "green", "orange", "red", "teal", "lime", "yellow"] as const;
/** The eight label tokens the initials fallback cycles through, in order. */
export const AVATAR_COLORS: ReadonlyArray<string> = LABEL_COLOR_NAMES.map((c) => `var(--label-${c})`);
// Same ink rule as LabelChip: light ink on the three saturated darks, navy ink on the rest.
const LIGHT_INK = /label-(red|pink|blue)\)/;

/** Rough luminance check for literal colours passed by consumers; token colours use the rule above. */
function isDark(c: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}

export function avatarColorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export interface AvatarProps {
  /** Full name (drives initials and the default colour) */
  name?: string;
  /** Image URL — wins over initials */
  src?: string;
  /** Diameter in px. 32 in comments, 28 in the top bar, 20 on list rows @default 32 */
  size?: number;
  /** Background behind the initials, e.g. "var(--label-teal)"; overrides the name-derived pick */
  color?: string;
  /** The name is already visible text beside the avatar: hide it from assistive tech so it isn't read twice
   * @default false — the avatar is an image named by `name` */
  decorative?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function Avatar({ name = "?", src, size = 32, color, decorative, style, className }: AvatarProps) {
  const cls = ["td-avatar", className ?? ""].join(" ").trim();
  if (src) return <img className={cls} src={src} alt={decorative ? "" : name} style={{ width: size, height: size, ...style }} />;
  const bg = color ?? avatarColorFor(name);
  const ink = LIGHT_INK.test(bg) || isDark(bg) ? "light" : "dark";
  return (
    <span className={cls} data-initials={initialsOf(name)} data-ink={ink} title={name} {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })} style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.38), ...style }}>
      {initialsOf(name)}
    </span>
  );
}

export interface AvatarStackPerson {
  id?: string | number;
  name: string;
  src?: string;
  color?: string;
}

export interface AvatarStackProps {
  people?: ReadonlyArray<string | AvatarStackPerson>;
  /** Avatar diameter in px @default 24 */
  size?: number;
  /** Faces shown before the "+n" disc @default 3 */
  max?: number;
  /** Overlap in px @default size / 4 */
  overlap?: number;
  style?: CSSProperties;
  className?: string;
}

/** Overlapping avatar row for assignees, watchers, members: up to `max` faces, then "+n". */
export function AvatarStack({ people = [], size = 24, max = 3, overlap, style, className }: AvatarStackProps) {
  const list = people.map((p) => (typeof p === "string" ? { name: p } : p));
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  // One image named by everyone in it; the faces and "+n" inside are presentational.
  const names = list.map((p) => p.name).join(", ");
  return (
    <span
      className={["td-avstack", className ?? ""].join(" ").trim()}
      style={{ "--td-av-overlap": `${overlap ?? Math.round(size / 4)}px`, ...style } as CSSProperties}
      title={names}
      {...(names ? { role: "img", "aria-label": names } : null)}
    >
      {shown.map((p, i) => (
        <Avatar key={p.id ?? p.name ?? i} name={p.name} src={p.src} color={p.color} size={size} decorative />
      ))}
      {rest > 0 ? (
        <span className="td-avstack-more" aria-hidden style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
