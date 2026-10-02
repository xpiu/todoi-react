// CalendarGrid — the month / week grid: weekday header, week rows with day cells (number, hover +),
// span bars laid in lanes, chips per day with "+N more" when the cell is full. Keyboard: arrows move
// the focused day (crossing a period edge navigates), Enter opens the day. Native drag and the touch
// long-press layer both move a chip or a span bar, whole range, by the days dragged. Spec: DESIGN.md › Calendar.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";

import { isReadOnly } from "../auth/GuestBar";
import { Icon } from "../core/Icon";
import { useTouchDrag } from "../core/touchDrag";
import { addDays, daysBetween, isSpan, parseDateValue, placeSpans, rankChip, sameDay, toISO, weeksFor, type CalendarItem } from "./calendar";
import { dateConventions } from "../core/dates";
import { CalendarItemChip } from "./CalendarItemChip";
import "./CalendarGrid.css";

export interface CalendarGridProps {
  date: Date;
  period?: "week" | "month";
  items: CalendarItem[];
  today?: Date;
  weekStartsOn?: number;
  showItemIds?: boolean;
  showLabels?: boolean;
  onOpenItem?: (id: string) => void;
  onAddItem?: (iso: string) => void;
  onShowMore?: (iso: string) => void;
  /** A drag from the grabbed day to the drop day: move the item's dates by the days between */
  onReschedule?: (id: string, from: string, to: string) => void;
  /** Arrow keys leaving the shown weeks ask the view to move the cursor */
  onNavigateDate?: (iso: string) => void;
  /** The day the view wants focused (after a navigation) */
  focusDate?: string | null;
  style?: CSSProperties;
  className?: string;
}

/** Cell geometry (px) the CSS also uses: number row, lane height, chip pitch. */
const LANE = 20, CHIP_PITCH = 25, CELL_PAD = 26 + 4;

export function CalendarGrid({ date, period = "month", items, today, weekStartsOn = dateConventions().weekStart, showItemIds = true, showLabels = true, onOpenItem, onAddItem, onShowMore, onReschedule, onNavigateDate, focusDate, style, className }: CalendarGridProps) {
  const [now] = useState(() => parseDateValue(new Date())!);
  const todayD = today ?? now;
  const dateKey = toISO(date)!;
  const weeks = useMemo(() => weeksFor(parseDateValue(dateKey)!, period, weekStartsOn), [dateKey, period, weekStartsOn]);
  const allIso = useMemo(() => new Set(weeks.flat().map((d) => toISO(d)!)), [weeks]);

  // Spans vs chips, chips ranked overdue → open → done.
  const spans: Array<{ it: CalendarItem; st: Date; due: Date }> = [];
  const chips = new Map<string, CalendarItem[]>();
  for (const it of items) {
    if (isSpan(it)) spans.push({ it, st: parseDateValue(it.start)!, due: parseDateValue(it.due)! });
    else {
      const due = parseDateValue(it.due);
      if (due) chips.set(toISO(due)!, [...(chips.get(toISO(due)!) ?? []), it]);
    }
  }
  for (const list of chips.values()) list.sort((x, y) => rankChip(x, todayD) - rankChip(y, todayD));
  spans.sort((a, b) => a.st.getTime() - b.st.getTime() || b.due.getTime() - b.st.getTime() - (a.due.getTime() - a.st.getTime()));
  const weekSpans = weeks.map((days) => placeSpans(spans, days));

  // Cell height drives how many chips fit before "+N more".
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wh, setWh] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => setWh(es[0]?.contentRect.height ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Roving focus among day cells.
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const defaultFocus = () => {
    const t = toISO(todayD)!;
    if (allIso.has(t)) return t;
    const f = period === "month" ? weeks.flat().find((d) => d.getMonth() === date.getMonth()) : weeks[0]![0];
    return toISO(f ?? weeks[0]![0]!)!;
  };
  const [focusIso, setFocusIso] = useState(defaultFocus);
  const wantFocus = useRef(false);
  const shown = focusDate && allIso.has(focusDate) ? focusDate : allIso.has(focusIso) ? focusIso : defaultFocus();
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    cellRefs.current[shown]?.focus();
  }, [shown]);
  const move = (from: string, n: number) => {
    const target = toISO(addDays(parseDateValue(from)!, n))!;
    wantFocus.current = true;
    if (allIso.has(target)) setFocusIso(target);
    else onNavigateDate?.(target);
  };

  // Reschedule by drag: native and touch (long-press), chips and span bars alike. A drag moves the whole
  // item by the days between the grabbed day and the drop day, so a range keeps its length.
  const drag = useRef<{ id: string; from: string } | null>(null);
  const [dropIso, setDropIso] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; from: string } | null>(null);
  const isoUnder = (t: Element | null) => t?.closest?.("[data-iso]")?.getAttribute("data-iso") ?? null;
  /** The day cell under a point, beneath any span bar drawn over it. */
  const isoAt = (x: number, y: number) => document.elementsFromPoint(x, y).map(isoUnder).find(Boolean) ?? null;
  const begin = (id: string, from: string | null) => {
    if (!from) return false;
    drag.current = { id, from };
    setDragging(drag.current);
  };
  const end = (to: string | null) => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    setDropIso(null);
    if (d && to && to !== d.from) onReschedule?.(d.id, d.from, to);
  };
  useTouchDrag(wrapRef, {
    selector: "[data-drag-id]",
    disabled: !onReschedule,
    onLift: (el, p) => {
      if (isReadOnly(el)) return false;
      return begin(el.getAttribute("data-drag-id")!, el.getAttribute("data-drag-from") ?? isoAt(p.x, p.y));
    },
    onMove: (p) => setDropIso(isoUnder(p.target)),
    onDrop: (p) => end(isoUnder(p.target)),
    onCancel: () => end(null),
  });
  const dragStart = (id: string, from: string | null) => (e: DragEvent<HTMLElement>) => {
    if (isReadOnly(e.currentTarget) || begin(id, from ?? isoAt(e.clientX, e.clientY)) === false) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };
  const dropHandlers = (dIso: string) =>
    onReschedule
      ? {
          onDragOver: (e: DragEvent) => {
            if (!drag.current) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropIso(dIso);
          },
          onDragLeave: () => setDropIso((x) => (x === dIso ? null : x)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            end(dIso);
          },
        }
      : {};
  // The days the dragged item would cover if dropped here.
  const dropDays = new Set<string>();
  const moving = dragging && dropIso ? items.find((it) => it.id === dragging.id) : null;
  if (moving && dragging && dropIso) {
    const n = daysBetween(parseDateValue(dragging.from)!, parseDateValue(dropIso)!);
    const due = parseDateValue(moving.due), st = parseDateValue(moving.start) ?? due;
    if (st && due) for (let d = addDays(st, n); d <= addDays(due, n); d = addDays(d, 1)) dropDays.add(toISO(d)!);
  }

  const monthOf = date.getMonth();
  const lanes = weekSpans.map((ws) => (ws.length ? Math.max(...ws.map((s) => s.lane)) + 1 : 0));
  const cellH = wh > 0 ? wh / weeks.length : 110;
  const wdNames = weeks[0]!.map((d) => d.toLocaleDateString("en-US", { weekday: "short" }));
  return (
    <div className={["td-calgrid", className ?? ""].join(" ").trim()} role="grid" aria-label="Calendar" style={style}>
      <div className="td-calgrid-wd" role="row">
        {wdNames.map((n, i) => {
          const d = weeks[0]![i]!;
          const isT = period === "week" && sameDay(d, todayD);
          const wk = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div key={i} role="columnheader" className={(isT ? "is-today" : "") + (wk && !isT ? " is-wknd" : "")}>
              {n}
              {period === "week" ? <span className="td-calgrid-wdnum">{d.getDate()}</span> : null}
            </div>
          );
        })}
      </div>
      <div className="td-calweeks" ref={wrapRef}>
        {weeks.map((days, wi) => {
          const L = lanes[wi]!;
          const slots = Math.max(0, Math.floor((cellH - CELL_PAD - L * LANE) / CHIP_PITCH));
          return (
            <div key={wi} className="td-calweek" role="row" style={{ "--td-lanes": L, gridTemplateRows: `var(--td-cal-numrow) ${"var(--td-cal-lane) ".repeat(L)}minmax(0, 1fr)` } as CSSProperties}>
              {days.map((d, di) => {
                const dIso = toISO(d)!;
                const dayChips = chips.get(dIso) ?? [];
                const spanCount = weekSpans[wi]!.filter((s) => di >= s.c1 && di <= s.c2).length;
                const total = dayChips.length + spanCount;
                const visible = dayChips.length <= slots ? dayChips.length : Math.max(0, slots - 1);
                const hidden = dayChips.length - visible;
                const out = period === "month" && d.getMonth() !== monthOf;
                const isT = sameDay(d, todayD);
                const wk = d.getDay() === 0 || d.getDay() === 6;
                const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + (total ? `, ${total} item${total > 1 ? "s" : ""}` : ", no items");
                return (
                  <CellPair
                    key={dIso}
                    dIso={dIso}
                    column={di + 1}
                    className={"td-calcell" + (wk ? " is-wknd" : "") + (dropDays.has(dIso) || dropIso === dIso ? " is-drop" : "")}
                    cellRef={(el) => {
                      cellRefs.current[dIso] = el;
                    }}
                    tabIndex={dIso === shown ? 0 : -1}
                    label={label}
                    isToday={isT}
                    onClick={(e) => {
                      // A chip, "+N more" or "+" inside the cell does its own thing.
                      if ((e.target as HTMLElement).closest(".td-calcell-add, .td-calchip, .td-calmore")) return;
                      onAddItem?.(dIso);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
                      if (mv != null) {
                        e.preventDefault();
                        move(dIso, mv);
                      } else if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onShowMore?.(dIso);
                      }
                    }}
                    drop={dropHandlers(dIso)}
                    number={period === "month" ? <span className={"td-calnum" + (isT ? " is-today" : out ? " is-out" : "")}>{d.getDate() === 1 ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d.getDate()}</span> : null}
                    add={
                      onAddItem ? (
                        <button
                          type="button"
                          className="td-calcell-add td-tip"
                          tabIndex={-1}
                          data-tip="Add an item"
                          data-tip-side="bottom-end"
                          aria-label={`Add an item on ${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddItem(dIso);
                          }}
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      ) : null
                    }
                  >
                    {dayChips.slice(0, visible).map((it) => {
                      const due = parseDateValue(it.due)!;
                      return (
                        <CalendarItemChip
                          key={it.id}
                          title={it.title}
                          itemId={it.itemId}
                          showId={showItemIds}
                          labels={showLabels ? it.labels : []}
                          done={it.done}
                          overdue={!it.done && due < todayD}
                          dragId={onReschedule ? it.id : undefined}
                          dragFrom={dIso}
                          onDragStart={dragStart(it.id, dIso)}
                          onClick={() => onOpenItem?.(it.id)}
                        />
                      );
                    })}
                    {hidden > 0 ? (
                      <button type="button" className="td-calmore" tabIndex={-1} onClick={(e) => {
                        e.stopPropagation();
                        onShowMore?.(dIso);
                      }}>
                        +{hidden} more
                      </button>
                    ) : null}
                  </CellPair>
                );
              })}
              {weekSpans[wi]!.map((s, si) => {
                const first = s.it.labels?.[0];
                // A cell spanning its days (the week row holds only cells), with the bar's button inside.
                return (
                  <div key={`${s.it.id}-${si}`} role="gridcell" aria-colspan={s.c2 - s.c1 + 1} className="td-calspan-cell" style={{ gridColumn: `${s.c1 + 1} / ${s.c2 + 2}`, gridRow: 2 + s.lane }}>
                    <button
                      type="button"
                      className={"td-calspan" + (s.contL ? " is-l" : "") + (s.contR ? " is-r" : "") + (s.it.done ? " is-done" : "")}
                      style={first && !s.it.done ? ({ "--td-span": `var(--label-${first.color})` } as CSSProperties) : undefined}
                      title={s.it.title}
                      draggable={onReschedule ? true : undefined}
                      data-drag-id={onReschedule ? s.it.id : undefined}
                      onDragStart={dragStart(s.it.id, null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenItem?.(s.it.id);
                      }}
                    >
                      {s.it.done ? <Icon name="circle-check" size={12} className="td-calchip-ico" /> : null}
                      <span className="td-calspan-title">{s.it.title}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A day: the full-height cell (number, hover +, drop target) holding its chip stack below the span lanes. */
function CellPair({ dIso, column, className, cellRef, tabIndex, label, isToday, onClick, onKeyDown, drop, number, add, children }: { dIso: string; column: number; className: string; cellRef: (el: HTMLDivElement | null) => void; tabIndex: number; label: string; isToday: boolean; onClick: (e: React.MouseEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void; drop: Record<string, unknown>; number: React.ReactNode; add: React.ReactNode; children: React.ReactNode }) {
  // One cell per day, its chips inside it (on the week's last row, through subgrid), so the week row holds only cells.
  return (
    <div className={className} role="gridcell" data-iso={dIso} ref={cellRef} tabIndex={tabIndex} aria-label={label} aria-current={isToday ? "date" : undefined} style={{ gridColumn: column }} onClick={onClick} onKeyDown={onKeyDown} {...drop}>
      {number}
      {add}
      <div className="td-calchips" data-iso={dIso}>
        {children}
      </div>
    </div>
  );
}
