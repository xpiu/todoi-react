// The centre rail's direction keys. Arrows point at the side that receives the work:
// ← Design → App · ⇄ Full sync · → App → Design · ⊘ Skip. Unavailable keys are run through.
import { ArrowLeft, ArrowLeftRight, ArrowRight, Ban } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { DIRECTION_HINT, DIRECTION_LABEL, type Direction } from "./api";

const KEYS: Array<{ d: Direction; Icon: typeof ArrowLeft }> = [
  { d: "design-to-app", Icon: ArrowLeft },
  { d: "both", Icon: ArrowLeftRight },
  { d: "app-to-design", Icon: ArrowRight },
  { d: "skip", Icon: Ban },
];

export function RailKeys({ value, allowed, onChange, label, size = "md", why }: { value: Direction; allowed: Direction[]; onChange: (d: Direction) => void; label: string; size?: "md" | "lg"; why?: Partial<Record<Direction, string>> }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent) => {
    const order = KEYS.map((k) => k.d).filter((d) => allowed.includes(d));
    const i = order.indexOf(value);
    let next: Direction | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = order[(i + 1) % order.length];
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = order[(i - 1 + order.length) % order.length];
    if (!next) return;
    e.preventDefault();
    onChange(next);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(`[data-d="${next}"]`)?.focus());
  };
  return (
    <div ref={ref} className={`cds-keys cds-keys-${size}`} role="radiogroup" aria-label={label} onKeyDown={move}>
      {KEYS.map(({ d, Icon }) => {
        const ok = allowed.includes(d);
        const on = value === d;
        const tip = ok ? `${DIRECTION_LABEL[d]} — ${DIRECTION_HINT[d]}` : (why?.[d] ?? `${DIRECTION_LABEL[d]}: nothing to move this way`);
        return (
          <button
            key={d}
            type="button"
            role="radio"
            data-d={d}
            aria-checked={on}
            aria-disabled={!ok || undefined}
            aria-label={DIRECTION_LABEL[d]}
            title={tip}
            tabIndex={on ? 0 : -1}
            className="cds-key"
            onClick={() => ok && onChange(d)}
          >
            <Icon size={size === "lg" ? 16 : 14} strokeWidth={1.75} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
