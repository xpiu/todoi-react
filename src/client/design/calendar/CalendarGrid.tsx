// CalendarGrid — the month / week grid: weekday header, week rows with day cells (number, hover +),
// span bars laid in lanes, chips per day with "+N more" when the cell is full. Keyboard: arrows move
// the focused day (crossing a period edge navigates), Enter opens the day. Native drag and the touch
// long-press layer both move a chip or a span bar, whole range, by the days dragged. A "No date" tray row
// dropped on a day sets its due date (`onSchedule`); a chip released outside every day goes to
// `onDropOutside` (the tray clears its due date). Spec: DESIGN.md › Calendar.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";

import { isReadOnly } from "../auth/GuestBar";
import { Icon } from "../core/Icon";
import { useTouchDrag } from "../core/touchDrag";
import { addDays, CHIP_DRAG_TYPE, daysBetweenISO, isSpan, parseDateValue, placeSpans, rankChip, sameDay, toISO, TRAY_DRAG_TYPE, weeksFor, type CalendarItem } from "./calendar";
import { currentDay, dateConventions } from "../core/dates";
import { CalendarItemChip } from "./CalendarItemChip";
import "../core/text.css";
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
  /** A "No date" tray row dropped on a day (native drag): set that item's due date */
  onSchedule?: (id: string, iso: string) => void;
  /** A day to tint as the drop target of a drag the grid does not own (a tray row held over it by touch) */
  dropDay?: string | null;
  /** Touch drag only: the element under the finger on every move, null when the drag ends (the view lights the tray) */
  onDragTarget?: (target: Element | null) => void;
  /** Touch drag only: a chip released outside every day cell (the view: on the tray, clear the due date) */
  onDropOutside?: (id: string, target: Element | null) => void;
  style?: CSSProperties;
  className?: string;
}

/** Cell geometry (px) the CSS also uses: lane height and the number row plus padding. The chip pitch comes from the theme (--size-cal-chip-pitch). */
const LANE = 20, CELL_PAD = 26 + 4, DEFAULT_PITCH = 25;

export function CalendarGrid({ date, period = "month", items, today, weekStartsOn = dateConventions().weekStart, showItemIds = true, showLabels = true, onOpenItem, onAddItem, onShowMore, onReschedule, onNavigateDate, focusDate, onSchedule, dropDay, onDragTarget, onDropOutside, style, className }: CalendarGridProps) {
  const [now] = useState(() => currentDay());
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

  // Cell height drives how many chips fit before "+N more". It is measured on mount as well as by the observer, so the first paint already has whole-pixel weeks.
  // sbw: the weeks' scrollbar width (the weekday row is padded by it so the columns stay aligned). pitch: one chip row in px, from the theme token.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wh, setWh] = useState(0);
  const [sbw, setSbw] = useState(0);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const p = parseFloat(getComputedStyle(el).getPropertyValue("--size-cal-chip-pitch"));
      setPitch(p > 0 ? p : DEFAULT_PITCH);
      setSbw(el.offsetWidth - el.clientWidth);
      setWh(el.getBoundingClientRect().height);
    };
    read();
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(read);
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);
  // The week period grows with its chips, so the scrollbar can appear without the wrapper resizing: watch the week rows too (re-attached when the shown weeks change).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const w = el.offsetWidth - el.clientWidth;
      setSbw((s) => (s === w ? s : w));
    };
    const ro = new ResizeObserver(sync);
    weeks.forEach((_, i) => {
      const week = el.children[i];
      if (week) ro.observe(week);
    });
    sync();
    return () => ro.disconnect();
  }, [weeks]);

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
  const [dropIso, setDropIso] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; from: string } | null>(null);
  const isoUnder = (t: Element | null) => t?.closest?.("[data-iso]")?.getAttribute("data-iso") ?? null;
  /** The day cell under a point, beneath any span bar drawn over it. */
  const isoAt = (x: number, y: number) => document.elementsFromPoint(x, y).map(isoUnder).find(Boolean) ?? null;
  const begin = (id: string, from: string | null) => {
    if (!from) return false;
    setDragging({ id, from });
  };
  const end = (to: string | null) => {
    setDragging(null);
    setDropIso(null);
    if (dragging && to && to !== dragging.from) onReschedule?.(dragging.id, dragging.from, to);
  };
  useTouchDrag(wrapRef, {
    selector: "[data-drag-id]",
    disabled: !onReschedule,
    onLift: (el, p) => {
      if (isReadOnly(el)) return false;
      return begin(el.getAttribute("data-drag-id")!, el.getAttribute("data-drag-from") ?? isoAt(p.x, p.y));
    },
    onMove: (p) => {
      setDropIso(isoUnder(p.target));
      onDragTarget?.(p.target);
    },
    onDrop: (p) => {
      const to = isoUnder(p.target);
      if (!to && dragging) onDropOutside?.(dragging.id, p.target);
      onDragTarget?.(null);
      end(to);
    },
    onCancel: () => {
      onDragTarget?.(null);
      end(null);
    },
  });
  const dragStart = (id: string, from: string | null) => (e: DragEvent<HTMLElement>) => {
    if (isReadOnly(e.currentTarget) || begin(id, from ?? isoAt(e.clientX, e.clientY)) === false) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData(CHIP_DRAG_TYPE, id);
    e.dataTransfer.effectAllowed = "move";
  };
  // A tray row's drag starts outside the grid: the days take it when the view handles `onSchedule`.
  const fromTray = (e: DragEvent) => !!onSchedule && e.dataTransfer.types.includes(TRAY_DRAG_TYPE);
  const dropHandlers = (dIso: string) =>
    onReschedule || onSchedule
      ? {
          onDragOver: (e: DragEvent) => {
            if (!dragging && !fromTray(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropIso(dIso);
          },
          onDragLeave: () => setDropIso((x) => (x === dIso ? null : x)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (dragging) return end(dIso);
            setDropIso(null);
            const id = fromTray(e) ? e.dataTransfer.getData("text/plain") : "";
            if (id) onSchedule?.(id, dIso);
          },
        }
      : {};
  // The days the dragged item would cover if dropped here.
  const dropDays = new Set<string>();
  const moving = dragging && dropIso ? items.find((it) => it.id === dragging.id) : null;
  if (moving) {
    const n = daysBetweenISO(dragging!.from, dropIso!);
    const due = parseDateValue(moving.due), st = parseDateValue(moving.start) ?? due;
    if (st && due) for (let d = addDays(st, n); d <= addDays(due, n); d = addDays(d, 1)) dropDays.add(toISO(d)!);
  }

  const monthOf = date.getMonth();
  const lanes = weekSpans.map((ws) => (ws.length ? Math.max(...ws.map((s) => s.lane)) + 1 : 0));
  // Week period: one row a whole day-column tall: no number row (the date is in the weekday header), every chip shown with its title wrapped, and the row grows (the weeks scroll) rather than cutting to "+n more".
  const isWeek = period === "week";
  // Whole-pixel week heights: the measured height split evenly, the remainder handed out 1px at a time from the top; a week never gets less than its lanes plus one chip row.
  const whI = Math.floor(wh);
  const baseH = whI > 0 ? Math.floor(whI / weeks.length) : 110;
  const remH = whI > 0 ? whI - baseH * weeks.length : 0;
  const weekStyle = (L: number, h: number): CSSProperties => ({
    ...({ "--td-lanes": L } as CSSProperties),
    gridTemplateRows: `${isWeek ? "6px" : "var(--td-cal-numrow)"} ${"var(--td-cal-lane) ".repeat(L)}minmax(0, 1fr)`,
    ...(whI > 0 ? (isWeek ? { flex: "none", minHeight: h } : { flex: "none", height: h }) : null),
  });
  const weekH = lanes.map((L, i) => Math.max(baseH + (i < remH ? 1 : 0), 30 + L * LANE + pitch));
  const wdNames = weeks[0]!.map((d) => d.toLocaleDateString("en-US", { weekday: "short" }));
  return (
    <div className={["td-calendar-grid", className ?? ""].join(" ").trim()} role="grid" aria-label="Calendar" data-period={period} style={style}>
      <div className="td-calendar-grid-weekday" role="row" style={sbw > 0 ? { paddingRight: sbw } : undefined}>
        {wdNames.map((n, i) => {
          const d = weeks[0]![i]!;
          const isT = period === "week" && sameDay(d, todayD);
          const wk = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div key={i} role="columnheader" className={(isT ? "is-today" : "") + (wk && !isT ? " is-wknd" : "")}>
              {n}
              {period === "week" ? <span className="td-calendar-grid-weekday-number">{d.getDate()}</span> : null}
            </div>
          );
        })}
      </div>
      {/* A drag that ends anywhere else (on the tray, outside the window) still clears the drag state */}
      <div className="td-calendar-weeks" ref={wrapRef} onDragEnd={() => (dragging || dropIso ? end(null) : undefined)}>
        {weeks.map((days, wi) => {
          const L = lanes[wi]!;
          const slots = Math.max(0, Math.floor((weekH[wi]! - CELL_PAD - L * LANE) / pitch));
          return (
            <div key={wi} className="td-calendar-week" role="row" style={weekStyle(L, weekH[wi]!)}>
              {days.map((d, di) => {
                const dIso = toISO(d)!;
                const dayChips = chips.get(dIso) ?? [];
                const spanCount = weekSpans[wi]!.filter((s) => di >= s.c1 && di <= s.c2).length;
                const total = dayChips.length + spanCount;
                const visible = isWeek || dayChips.length <= slots ? dayChips.length : Math.max(0, slots - 1);
                const hidden = dayChips.length - visible;
                const out = period === "month" && d.getMonth() !== monthOf;
                const isT = sameDay(d, todayD);
                const wk = d.getDay() === 0 || d.getDay() === 6;
                const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + (total ? `, ${total} item${total > 1 ? "s" : ""}` : ", no items");
                return (
                  // One cell per day, its chips inside it (on the week's last row, through subgrid), so the week row holds only cells.
                  <div
                    key={dIso}
                    role="gridcell"
                    data-iso={dIso}
                    style={{ gridColumn: di + 1 }}
                    className={"td-calendar-cell" + (wk ? " is-wknd" : "") + (dropDays.has(dIso) || dropIso === dIso || dropDay === dIso ? " is-drop" : "")}
                    ref={(el) => {
                      cellRefs.current[dIso] = el;
                    }}
                    tabIndex={dIso === shown ? 0 : -1}
                    aria-current={isT ? "date" : undefined}
                    onClick={(e) => {
                      // A button inside the cell (a chip, "+N more", "+") does its own thing.
                      if ((e.target as HTMLElement).closest("button")) return;
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
                    {...dropHandlers(dIso)}
                  >
                    {/* Named from its content: the full date and count first, then the day's chips and "+n more" —
                        so everything the cell shows is part of its name. The number and the pointer-only + repeat it. */}
                    <span className="td-sr-only">{label}</span>
                    {period === "month" ? <span className={"td-calendar-day-number" + (isT ? " is-today" : out ? " is-out" : "")} aria-hidden="true">{d.getDate() === 1 ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d.getDate()}</span> : null}
                    {onAddItem ? (
                      <button
                        type="button"
                        className="td-calendar-cell-add td-tooltip"
                        tabIndex={-1}
                        aria-hidden="true"
                        data-tip="Add an item"
                        data-tip-side={isWeek ? "left" : "bottom-end"}
                        aria-label={`Add an item on ${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
                        onClick={() => onAddItem(dIso)}
                      >
                        <Icon name="plus" size={14} />
                      </button>
                    ) : null}
                    <div className="td-calendar-chips">
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
                        <button type="button" className="td-calendar-more" tabIndex={-1} onClick={() => onShowMore?.(dIso)}>
                          +{hidden} more
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {weekSpans[wi]!.map((s, si) => {
                const first = s.it.labels?.[0];
                // A cell spanning its days (the week row holds only cells), with the bar's button inside.
                return (
                  <div key={`${s.it.id}-${si}`} role="gridcell" aria-colspan={s.c2 - s.c1 + 1} className="td-calendar-span-cell" style={{ gridColumn: `${s.c1 + 1} / ${s.c2 + 2}`, gridRow: 2 + s.lane }}>
                    <button
                      type="button"
                      className={"td-calendar-span" + (s.contL ? " is-l" : "") + (s.contR ? " is-r" : "") + (s.it.done ? " is-done" : "")}
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
                      {s.it.done ? <Icon name="circle-check" size={12} className="td-calendar-chip-icon" /> : null}
                      <span className="td-calendar-span-title">{s.it.title}</span>
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
