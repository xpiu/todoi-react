// ChipBar — the frame of every chip row under the SubNavbar (Views, Filter by, Sort by): a leading
// icon + label, the chips, and trailing actions (Reset · Hide). At ≥1024px the chips stay on ONE row
// in a ChipRail; below, they wrap. Spec: DESIGN.md › Subnavbar rows.
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";

import { Button } from "../core/Button";
import { Icon, type IconName } from "../core/Icon";
import { useViewport } from "../core/viewport";
import "./ChipBar.css";

export interface ChipBarProps {
  label: string;
  icon: IconName;
  /** Accessible name of the row */
  "aria-label": string;
  /** "nav" for the saved-views row (a navigation of buttons); otherwise a toolbar @default "toolbar" */
  as?: "toolbar" | "nav";
  id?: string;
  /** "More filters" / "Previous filters" on the rail's page buttons */
  moreLabel?: string;
  backLabel?: string;
  /** The chips (scroll in the rail on desktop) */
  children: ReactNode;
  /** Right after the chips, outside the rail (Save view) */
  after?: ReactNode;
  /** Trailing end: Reset · Hide */
  actions?: ReactNode;
}

export function ChipBar({ label, icon, as = "toolbar", id, moreLabel = "More options", backLabel = "Previous options", children, after, actions, ...rest }: ChipBarProps) {
  const { desktop } = useViewport();
  const body = (
    <>
      <span className="td-cbar-label">
        <Icon name={icon} size={16} />
        {label}
      </span>
      <ChipRail desktop={desktop} moreLabel={moreLabel} backLabel={backLabel}>
        {children}
      </ChipRail>
      {after}
      {actions ? <div className="td-cbar-actions">{actions}</div> : null}
    </>
  );
  const props = { id, className: "td-cbar", "data-desktop": desktop ? "true" : undefined, "aria-label": rest["aria-label"] };
  return as === "nav" ? (
    <nav {...props}>{body}</nav>
  ) : (
    <div role="toolbar" {...props}>
      {body}
    </div>
  );
}

/** A trailing word button on a ChipBar: "Reset filters" (filled while something is active), "Hide". */
export function ChipBarAction({ icon, active = false, onClick, children }: { icon: IconName; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant={active ? "chrome" : "chrome-ghost"} icon={icon} className="td-bar-act" onClick={onClick}>
      {children}
    </Button>
  );
}

/** The one-row chip scroller: trackpad / touch / mouse-drag scroll, the overflowing edge fades under an "…" chevron that pages by 60%. A drag never clicks the chip it ends on. */
function ChipRail({ desktop, moreLabel, backLabel, children }: { desktop: boolean; moreLabel: string; backLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const [ov, setOv] = useState({ l: false, r: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 1;
    const r = Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 1;
    setOv((o) => (o.l === l && o.r === r ? o : { l, r }));
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!desktop || !el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  });
  if (!desktop) return <>{children}</>;

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: reduce ? "auto" : "smooth" });
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      el.setPointerCapture(d.id);
      el.dataset.dragging = "true";
    }
    el.scrollLeft = d.left - dx;
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    if (d.moved && ref.current) {
      ref.current.dataset.dragging = "false";
      // Let the click that ends the drag be swallowed first.
      setTimeout(() => (drag.current = null), 0);
    } else drag.current = null;
  };
  const onClickCapture = (e: MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const pager = (dir: 1 | -1, label: string) => (
    <Button variant="chrome" className="td-chiprail-page" aria-label={label} title={label} icon={dir < 0 ? "chevron-left" : undefined} iconAfter={dir > 0 ? "chevron-right" : undefined} onClick={() => page(dir)}>
      …
    </Button>
  );
  return (
    <>
      {ov.l ? pager(-1, backLabel) : null}
      <div ref={ref} className="td-chiprail" data-overflow-left={ov.l ? "true" : "false"} data-overflow-right={ov.r ? "true" : "false"} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} onClickCapture={onClickCapture}>
        {children}
      </div>
      {ov.r ? pager(1, moreLabel) : null}
    </>
  );
}
