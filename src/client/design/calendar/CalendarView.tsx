// CalendarView — header + body for the period: month / week grid, day list, or the year's twelve
// mini months. The period is controlled (the URL or the screen owns it) or self-managed.
// ←/→ outside the grid and PageUp/PageDown move the period. Month and Week carry the "No date" tray
// (open items without a due date: drag one onto a day, drag a chip onto the tray to clear it, shift+D or
// "Set due date" for the due-date picker) and the Subscribe button. Spec: DESIGN.md › Views › Calendar.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { addDays, coversDay, daysBetween, isSpan, isUndated, parseDateValue, periodTitle, shiftPeriod, toISO, type CalendarItem, type CalendarPeriod } from "./calendar";
import { Button } from "../core/Button";
import type { WeekStart } from "../core/DateCalendar";
import { currentDay, dateConventions, formatDate } from "../core/dates";
import { DatesPicker } from "../core/DatesPicker";
import { Icon } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { isTyping, SHORTCUTS } from "../core/shortcuts";
import { useTouchDrag } from "../core/touchDrag";
import { useViewport } from "../core/viewport";
import { CalendarDayList } from "./CalendarDayList";
import { CalendarGrid } from "./CalendarGrid";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarMiniMonth } from "./CalendarMiniMonth";
import { CalendarTray, type CalendarTrayState } from "./CalendarTray";
import "../core/text.css";
import "./CalendarView.css";

export interface CalendarViewProps {
  /** Every item the view shows: dated ones land on the grid, open undated ones in the "No date" tray */
  items: CalendarItem[];
  period?: CalendarPeriod;
  defaultPeriod?: CalendarPeriod;
  onPeriodChange?: (p: CalendarPeriod) => void;
  /** Initial cursor date */
  date?: string | Date;
  today?: string | Date;
  weekStartsOn?: number;
  showItemIds?: boolean;
  showLabels?: boolean;
  onOpenItem?: (id: string) => void;
  onAddItem?: (iso: string) => void;
  onReschedule?: (id: string, from: string, to: string) => void;
  onToggleDone?: (id: string, done: boolean) => void;
  onToggleSubitem?: (itemId: string, subitemId: string, done: boolean) => void;
  /** Show the "No date" tray and its header toggle in Month and Week @default true */
  tray?: boolean;
  /** Controlled tray visibility; omit for the built-in state (open on desktop and tablet, closed on a phone) */
  trayOpen?: boolean;
  defaultTrayOpen?: boolean;
  /** Remember it per device */
  onTrayOpenChange?: (open: boolean) => void;
  /** "loading" | {error, onRetry} for the tray body @default "ready" */
  trayState?: CalendarTrayState;
  /** Shown in the toggle and the tray head instead of the number of undated items ("5 of 12" while filtered) */
  trayCount?: number | string;
  /** A tray row dropped on a day, or a day picked for it: give that undated item a due date. Without it nothing schedules. */
  onSchedule?: (id: string, iso: string) => void;
  /** A chip dropped on the tray, or Clear picked for it: remove the due date (the start stays, the due time goes). Without it the tray takes no drop. */
  onClearDate?: (id: string) => void;
  /** Renders the Subscribe button in the header (glyph rss, "Subscribe to calendar") */
  onSubscribe?: () => void;
  /** Viewers: no drag, no Set due date, no shift+D @default false */
  readOnly?: boolean;
  style?: CSSProperties;
  className?: string;
}

/** The due-date picker the tray rows and the grid chips share: who asked, and where focus goes after. */
interface DuePick {
  id: string;
  from: "tray" | "grid";
  /** The item's current due day (a chip), null for a tray row */
  due: string | null;
  start: string | null;
  /** The tray row's position, so focus can land on the next one */
  index: number;
}

/** The day cell under a point, beneath any span bar or drag clone drawn over it */
const isoAt = (x: number, y: number) => document.elementsFromPoint(x, y).map((el) => el.closest("[data-iso]")?.getAttribute("data-iso")).find(Boolean) ?? null;
const inTray = (t: Element | null) => !!t?.closest?.(".td-calendar-tray");
/** Focus once the picker or a drop has settled (the closing popover and the re-render come first) */
const soon = (fn: () => HTMLElement | null | undefined) => requestAnimationFrame(() => requestAnimationFrame(() => fn()?.focus()));

export function CalendarView({ items, period: periodProp, defaultPeriod = "month", onPeriodChange, date, today, weekStartsOn = dateConventions().weekStart, showItemIds = true, showLabels = true, onOpenItem, onAddItem, onReschedule, onToggleDone, onToggleSubitem, tray = true, trayOpen: trayOpenProp, defaultTrayOpen, onTrayOpenChange, trayState = "ready", trayCount, onSchedule, onClearDate, onSubscribe, readOnly = false, style, className }: CalendarViewProps) {
  const controlled = periodProp != null;
  const [selfP, setSelfP] = useState<CalendarPeriod>(defaultPeriod);
  const period = controlled ? periodProp : selfP;
  // Today is sampled once per mount (a pure render must not read the clock).
  const [now] = useState(() => currentDay());
  const todayD = parseDateValue(today) ?? now;
  const [cursor, setCursor] = useState<Date>(() => parseDateValue(date) ?? todayD);
  const [focusIso, setFocusIso] = useState<string | null>(null);
  const setPeriod = (p: CalendarPeriod) => {
    onPeriodChange?.(p);
    if (!controlled) setSelfP(p);
  };
  const shift = (n: number) => {
    setFocusIso(null);
    setCursor((c) => shiftPeriod(c, period, n));
  };
  const goToday = () => {
    setFocusIso(toISO(todayD));
    setCursor(todayD);
  };
  const openDay = (iso: string) => {
    setCursor(parseDateValue(iso)!);
    setFocusIso(null);
    setPeriod("day");
  };
  const navigateDate = (iso: string) => {
    setCursor(parseDateValue(iso)!);
    setFocusIso(iso);
  };

  // ── "No date" tray (Month and Week): open items without a due date, beside the grid.
  const vp = useViewport();
  const rootRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLElement>(null);
  const trayId = useId();
  const pickerId = useId();
  const [selfTray, setSelfTray] = useState(defaultTrayOpen);
  const hasTray = tray && (period === "month" || period === "week");
  const dated = useMemo(() => items.filter((it) => !isUndated(it)), [items]);
  const undated = useMemo(() => items.filter((it) => isUndated(it) && !it.done), [items]);
  const trayOpen = hasTray && (trayOpenProp ?? selfTray ?? vp.device !== "phone");
  const setTrayOpen = (o: boolean) => {
    if (trayOpenProp === undefined) setSelfTray(o);
    onTrayOpenChange?.(o);
  };
  const canSchedule = !readOnly && !!onSchedule;
  const canClear = !readOnly && !!onClearDate;
  const [trayDrop, setTrayDrop] = useState(false);
  const [live, setLive] = useState("");
  const cellFor = (iso: string | null) => (iso ? rootRef.current?.querySelector<HTMLElement>(`.td-calendar-cell[data-iso="${iso}"]`) : null);
  const toggleEl = () => rootRef.current?.querySelector<HTMLElement>(".td-calendar-tray-toggle");
  const sayDay = (iso: string) => `Due date set to ${formatDate(iso, { year: "auto" })}`;

  // Keyboard and touch twin of both drags: one due-date picker, hung on the tray row or the chip that asked for it.
  // A picked day sets the date; Clear sends a dated item to the tray.
  const anchorRef = useRef<HTMLElement | null>(null);
  const [pick, setPick] = useState<DuePick | null>(null);
  const openPick = (id: string, el: HTMLElement, from: DuePick["from"]) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    anchorRef.current = el;
    const rows = from === "tray" ? [...(rootRef.current?.querySelectorAll(".td-calendar-tray-row") ?? [])] : [];
    setPick({ id, from, due: toISO(parseDateValue(it.due)), start: toISO(parseDateValue(it.start)), index: rows.indexOf(el) });
  };
  const closePick = () => {
    const el = anchorRef.current;
    setPick(null);
    soon(() => (el?.isConnected ? (el.matches("button") ? el : el.querySelector<HTMLElement>("button")) : null));
  };
  const applyPick = (next: { due: string | null }) => {
    const p = pick;
    if (!p) return;
    setPick(null);
    // The outcome decides where focus goes; the close that follows (Clear closes the picker) leaves it alone.
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (next.due && p.from === "tray") {
      scheduled.current = { id: p.id, index: p.index };
      onSchedule?.(p.id, next.due);
      setLive(sayDay(next.due));
    } else if (next.due && p.due) {
      if (next.due !== p.due) onReschedule?.(p.id, p.due, next.due);
      setLive(sayDay(next.due));
      soon(() => cellFor(next.due));
    } else if (!next.due && p.from === "grid") {
      onClearDate?.(p.id);
      setLive("Due date cleared. Moved to No date.");
      soon(() => cellFor(p.due));
    } else {
      anchorRef.current = anchor;
      closePick();
    }
  };

  // A row scheduled from the picker leaves the tray when the host's data says so: then the next row takes
  // focus, or the header button once the tray is empty (the focused row is gone with it).
  const scheduled = useRef<{ id: string; index: number } | null>(null);
  useEffect(() => {
    const s = scheduled.current;
    if (!s || undated.some((it) => it.id === s.id)) return;
    scheduled.current = null;
    const root = rootRef.current;
    const rows = [...(root?.querySelectorAll<HTMLElement>(".td-calendar-tray-item") ?? [])];
    (rows[Math.min(s.index, rows.length - 1)] ?? root?.querySelector<HTMLElement>(".td-calendar-tray-toggle"))?.focus();
  }, [undated]);

  // Touch: long-press a tray row, the day under the finger takes the grid's drop tint, release sets the date.
  const [touchDay, setTouchDay] = useState<string | null>(null);
  const touchId = useRef<string | null>(null);
  useTouchDrag(trayRef, {
    selector: ".td-calendar-tray-item[data-drag-id]",
    disabled: !canSchedule || !trayOpen,
    onLift: (el) => {
      touchId.current = el.getAttribute("data-drag-id");
    },
    onMove: (p) => setTouchDay(isoAt(p.x, p.y)),
    onDrop: (p) => {
      const iso = isoAt(p.x, p.y), id = touchId.current;
      touchId.current = null;
      setTouchDay(null);
      if (iso && id) onSchedule?.(id, iso);
    },
    onCancel: () => {
      touchId.current = null;
      setTouchDay(null);
    },
  });

  const Y = cursor.getFullYear();
  const yearDates = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const due = parseDateValue(it.due), st = parseDateValue(it.start);
      if (st && due && isSpan(it) && daysBetween(st, due) < 200) {
        for (let d = new Date(st); d <= due; d = addDays(d, 1)) if (d.getFullYear() === Y) s.add(toISO(d)!);
      } else if (due && due.getFullYear() === Y) s.add(toISO(due)!);
    }
    return s;
  }, [items, Y]);
  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // shift+D on a focused tray row or chip: the due-date picker (SHORTCUTS.itemQuickEdit, the Board's Dates key).
    const target = e.target as HTMLElement;
    if (!isTyping(target) && SHORTCUTS.itemQuickEdit(e) === "dates") {
      const row = canSchedule ? target.closest<HTMLElement>(".td-calendar-tray-row") : null;
      const chip = !row && !readOnly && onReschedule ? target.closest<HTMLElement>(".td-calendar-chip[data-drag-id], .td-calendar-span[data-drag-id]") : null;
      const id = (row?.querySelector("[data-drag-id]") ?? chip)?.getAttribute("data-drag-id");
      if (id) {
        e.preventDefault();
        openPick(id, (row ?? chip)!, row ? "tray" : "grid");
        return;
      }
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      shift(-1);
      return;
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      shift(1);
      return;
    }
    if (target.closest('[role="gridcell"],.td-calendar-week,input,textarea,select,[contenteditable="true"]')) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      shift(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      shift(1);
    }
  };
  let body;
  if (period === "year")
    body = (
      <div className="td-calendar-year">
        {Array.from({ length: 12 }, (_, m) => (
          <CalendarMiniMonth
            key={m}
            year={Y}
            month={m}
            dates={yearDates}
            today={todayD}
            weekStartsOn={weekStartsOn}
            onOpen={() => {
              setCursor(new Date(Y, m, 1));
              setFocusIso(null);
              setPeriod("month");
            }}
          />
        ))}
      </div>
    );
  else if (period === "day")
    body = (
      <div className="td-calendar-day">
        <CalendarDayList date={cursor} items={dated.filter((it) => coversDay(it, cursor))} onOpenItem={onOpenItem} onToggleDone={onToggleDone} onToggleSubitem={onToggleSubitem} onAddItem={onAddItem} showItemIds={showItemIds} showLabels={showLabels} />
      </div>
    );
  else
    body = (
      <CalendarGrid
        date={cursor}
        period={period}
        items={dated}
        today={todayD}
        weekStartsOn={weekStartsOn}
        showItemIds={showItemIds}
        showLabels={showLabels}
        onOpenItem={onOpenItem}
        onAddItem={onAddItem}
        onShowMore={openDay}
        onReschedule={readOnly ? undefined : onReschedule}
        onNavigateDate={navigateDate}
        focusDate={focusIso}
        onSchedule={trayOpen && canSchedule ? onSchedule : undefined}
        dropDay={touchDay}
        onDragTarget={trayOpen && canClear ? (t) => setTrayDrop(inTray(t)) : undefined}
        onDropOutside={trayOpen && canClear ? (id, t) => inTray(t) && onClearDate?.(id) : undefined}
        className="td-calendar-view-grid"
      />
    );
  const count = trayCount ?? undated.length;
  // Header extras: the tray toggle ("No date" + count, pressed while open) and Subscribe (the host opens CalendarSubscribeDialog).
  const extra =
    hasTray || onSubscribe ? (
      <>
        {hasTray ? (
          <Button variant="chrome" className="td-calendar-tray-toggle" aria-expanded={trayOpen} aria-controls={trayOpen ? trayId : undefined} onClick={() => setTrayOpen(!trayOpen)}>
            <Icon name="calendar-off" size={16} />
            No date
            <span className="td-calendar-tray-toggle-count">{count}</span>
          </Button>
        ) : null}
        {onSubscribe ? <IconButton name="rss" label="Subscribe to calendar" tooltip="Subscribe to calendar" variant="chrome" aria-haspopup="dialog" className="td-calendar-subscribe-button" onClick={onSubscribe} /> : null}
      </>
    ) : null;
  const trayEl = trayOpen ? (
    <CalendarTray
      ref={trayRef}
      id={trayId}
      items={undated.map((it) => ({ id: it.id, title: it.title, itemId: it.itemId, listName: it.listName }))}
      count={trayCount}
      state={trayState}
      showItemIds={showItemIds}
      readOnly={!canSchedule}
      dropActive={trayDrop}
      pickingId={pick?.from === "tray" ? pick.id : null}
      pickerId={pickerId}
      onOpenItem={onOpenItem}
      onSetDate={canSchedule ? (id, el) => openPick(id, el, "tray") : undefined}
      onDropItem={canClear ? onClearDate : undefined}
      onClose={() => {
        setTrayOpen(false);
        soon(toggleEl);
      }}
    />
  ) : null;
  return (
    <div ref={rootRef} className={["td-calendar-view", className ?? ""].join(" ").trim()} onKeyDown={onRootKey} style={style}>
      <CalendarHeader title={periodTitle(cursor, period, weekStartsOn)} period={period} onPeriodChange={setPeriod} onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={goToday} extra={extra} />
      {/* The grid stays the first child of this wrapper (the Minimal theme sizes it from here); with the tray open the wrapper becomes a row. */}
      <div className="td-calendar-view-body" data-tray={trayEl ? "true" : undefined}>
        {body}
        {trayEl}
      </div>
      {pick ? (
        <DatesPicker
          open
          onOpenChange={(o) => {
            if (!o) closePick();
          }}
          anchorRef={anchorRef}
          id={pickerId}
          due={pick.due}
          start={pick.start}
          time={null}
          withStart={false}
          withTime={false}
          today={todayD}
          weekStartsOn={weekStartsOn as WeekStart}
          sheet="auto"
          tier="detached"
          aria-label="Due date"
          onChange={applyPick}
        />
      ) : null}
      <div className="td-sr-only" role="status" aria-live="polite">
        {live}
      </div>
    </div>
  );
}
