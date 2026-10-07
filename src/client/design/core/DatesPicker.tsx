// DatesPicker — start + due (+ time on the due date) in one field; the item overlay's Dates row.
// Trigger reads the range ("Sep 10 – Sep 12, 2026 · 14:00"); the panel has Due, "Add start date" →
// Start, a Time field once a due exists, quick picks, one calendar writing into the active field
// (start auto-advances to due, the span shades between), Clear. A start after the due drags the due
// along; clearing the due drops the time. Spec: DESIGN.md › Item editing › Dates.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { Button, type ButtonVariant } from "./Button";
import { DateCalendar, type WeekStart } from "./DateCalendar";
import { dateConventions, formatDate, formatDateRange, formatTime, parseDateValue, parseTime, resolveDate, toISO, type DateInput } from "./dates";
import { DateTrigger, QUICK_PICKS } from "./DatePicker";
import { Icon, type IconName } from "./Icon";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "./Popover";
import "./DatePicker.css";

export interface DatesValue {
  start: string | null;
  due: string | null;
  /** "HH:MM" 24h, on the due date */
  time: string | null;
}

export interface DatesPickerProps {
  start?: string | null;
  due?: string | null;
  time?: string | null;
  /** Fires with the complete next value on every change */
  onChange?: (next: DatesValue) => void;
  today?: DateInput;
  weekStartsOn?: WeekStart;
  /** @default "Dates" */
  placeholder?: string;
  /** @default "clock" */
  icon?: IconName;
  variant?: ButtonVariant;
  /** Tints the trigger: overdue red, complete green */
  state?: "default" | "overdue" | "complete";
  placement?: PopoverPlacement;
  tier?: PopoverTier;
  block?: boolean;
  disabled?: boolean;
  /** @default true */
  withTime?: boolean;
  /** @default true */
  withStart?: boolean;
  /** @default "Dates" */
  "aria-label"?: string;
  title?: string;
  trigger?: (open: boolean, value: { start: Date | null; due: Date | null; time: string | null }) => ReactNode;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  style?: CSSProperties;
  className?: string;
}

type FieldKey = "start" | "due";
type Active = FieldKey | "time";

export function DatesPicker({
  start,
  due,
  time,
  onChange,
  today,
  weekStartsOn = dateConventions().weekStart,
  placeholder = "Dates",
  icon = "clock",
  variant = "outline",
  state,
  placement = "bottom-start",
  tier = "menu",
  block,
  disabled,
  withTime = true,
  withStart = true,
  title,
  trigger,
  onOpenChange,
  defaultOpen = false,
  style,
  className,
  ...rest
}: DatesPickerProps) {
  const ariaLabel = rest["aria-label"] ?? "Dates";
  const pop = usePopover(defaultOpen);
  const S = parseDateValue(start);
  const D = parseDateValue(due);
  const [active, setActive] = useState<Active>("due");
  const [showStart, setShowStart] = useState(!!S);
  const [typed, setTyped] = useState({ start: "", due: "", time: "" });
  const dueRef = useRef<HTMLInputElement>(null);

  const setOpen = (o: boolean) => {
    pop.setOpen(o);
    if (o) {
      setActive("due");
      setShowStart(!!S);
      setTyped({ start: "", due: "", time: time ? formatTime(time) : "" });
    }
    onOpenChange?.(o);
  };
  const emit = (n: Partial<DatesValue>) => {
    const next: DatesValue = { start: n.start !== undefined ? n.start : (start ?? null), due: n.due !== undefined ? n.due : (due ?? null), time: n.time !== undefined ? n.time : (time ?? null) };
    if (next.start && next.due && next.start > next.due) {
      if (n.start !== undefined) next.due = next.start;
      else next.start = next.due;
    }
    if (!next.due) next.time = null;
    onChange?.(next);
  };
  const guess = (k: FieldKey) => (typed[k].trim() ? resolveDate(typed[k], today) : null);
  const pickDay = (d: Date | null) => {
    if (!d) return;
    const iso = toISO(d);
    if (active === "start") {
      emit({ start: iso });
      setActive("due");
    } else emit({ due: iso });
    setTyped((t) => ({ ...t, [active === "start" ? "start" : "due"]: "" }));
  };
  const focusInput = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName !== "INPUT") {
      e.preventDefault();
      e.currentTarget.querySelector("input")?.focus();
    }
  };
  const field = (k: FieldKey, label: string, val: Date | null, ph: string) => {
    const g = guess(k);
    const clear = () => {
      emit({ [k]: null });
      if (k === "start") setShowStart(false);
    };
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (g) {
          emit({ [k]: toISO(g) });
          setTyped((t) => ({ ...t, [k]: "" }));
          if (k === "start") setActive("due");
        } else if (!typed[k].trim() && k === "due" && D) setOpen(false);
      } else if (e.key === "Backspace" && !typed[k] && val) clear();
      else if (e.key.length === 1) e.stopPropagation();
    };
    return (
      <div
        className="td-dp-field"
        data-active={active === k ? "true" : undefined}
        onMouseDown={(e) => {
          focusInput(e);
          setActive(k);
        }}
      >
        <span className="td-dp-label">{label}</span>
        <input
          ref={k === "due" ? dueRef : undefined}
          className="td-dp-input"
          placeholder={val ? formatDate(val, { year: "auto", today }) : ph}
          aria-label={`${label} date`}
          value={typed[k]}
          aria-invalid={typed[k].trim() && !g ? true : undefined}
          onFocus={() => setActive(k)}
          onChange={(e) => setTyped((t) => ({ ...t, [k]: e.target.value }))}
          onKeyDown={onKeyDown}
        />
        {g ? (
          <span className="td-dp-preview">{formatDate(g, { weekday: true, year: "auto", today })}</span>
        ) : typed[k].trim() ? (
          <span className="td-dp-preview" data-invalid="true">
            Not a date
          </span>
        ) : val ? (
          <button type="button" className="td-dp-x" aria-label={`Clear ${label.toLowerCase()} date`} onClick={clear}>
            <Icon name="x" size={12} />
          </button>
        ) : null}
      </div>
    );
  };
  const timeGuess = parseTime(typed.time);
  const trig = trigger ? (
    <span>{trigger(pop.open, { start: S, due: D, time: time ?? null })}</span>
  ) : (
    <DateTrigger variant={variant} icon={icon} disabled={disabled} data-state={D ? state : undefined} block={block} aria-label={ariaLabel} title={title} style={style} text={formatDateRange(S, D, time, { today })} placeholder={placeholder} />
  );

  return (
    <Popover open={pop.open} onOpenChange={(o) => setOpen(o)} trigger={trig} placement={placement} tier={tier} width={248} role="dialog" aria-label={ariaLabel} block={block} initialFocus={dueRef} className={className}>
      <div className="td-dp">
        <div className="td-dp-fields">
          {withStart && showStart ? field("start", "Start", S, "Add a start date") : null}
          {field("due", "Due", D, "Type a date: fri, 12 sep, in 3 days")}
          {withTime && D ? (
            <div className="td-dp-field" data-active={active === "time" ? "true" : undefined} onMouseDown={focusInput}>
              <span className="td-dp-label">Time</span>
              <input
                className="td-dp-input"
                placeholder="Add a time: 14:30, 2pm"
                aria-label="Due time"
                value={typed.time}
                aria-invalid={typed.time.trim() && !timeGuess ? true : undefined}
                onFocus={() => setActive("time")}
                onChange={(e) => setTyped((t) => ({ ...t, time: e.target.value }))}
                onBlur={() => {
                  if (typed.time.trim()) {
                    if (timeGuess && timeGuess !== time) emit({ time: timeGuess });
                    setTyped((t) => ({ ...t, time: timeGuess ? formatTime(timeGuess) : time ? formatTime(time) : "" }));
                  } else if (time) emit({ time: null });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (timeGuess) emit({ time: timeGuess });
                    else if (!typed.time.trim()) emit({ time: null });
                    setOpen(false);
                  } else if (e.key.length === 1) e.stopPropagation();
                }}
              />
              {typed.time && !timeGuess ? (
                <span className="td-dp-preview" data-invalid="true">
                  Not a time
                </span>
              ) : time && !typed.time ? (
                <button type="button" className="td-dp-x" aria-label="Clear time" onClick={() => emit({ time: null })}>
                  <Icon name="x" size={12} />
                </button>
              ) : null}
            </div>
          ) : null}
          {withStart && !showStart ? (
            <button
              type="button"
              className="td-dp-addstart"
              onClick={() => {
                setShowStart(true);
                setActive("start");
              }}
            >
              <Icon name="plus" size={12} />
              Add start date
            </button>
          ) : null}
        </div>
        <div className="td-dp-quick">
          {QUICK_PICKS.map(([l, k]) => (
            <Button key={k} onClick={() => pickDay(resolveDate(k, today))}>
              {l}
            </Button>
          ))}
        </div>
        <DateCalendar value={active === "start" ? S : D} range={S && D ? { start: S, end: D } : null} today={today} weekStartsOn={weekStartsOn} min={active === "due" && S ? S : undefined} onChange={(_iso, d) => pickDay(d)} />
        <div className="td-dp-foot">
          <span className="td-dp-cur">{D ? formatDate(D, { weekday: true }) + (time ? ` · ${formatTime(time)}` : "") : S ? "Start only" : "No date"}</span>
          {S || D ? (
            <Button
              variant="ghost"
              icon="x"
              onClick={() => {
                onChange?.({ start: null, due: null, time: null });
                setOpen(false);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </Popover>
  );
}
