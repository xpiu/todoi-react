// DatePicker — a single date (due) editor: Button trigger over a Popover with a typed-date field (the
// quick-add grammar), quick picks, the month grid and Clear. ISO in and out. The item overlay uses
// DatesPicker (start + due + time) instead; this one serves single-date rows (Until, settings).
import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Button, type ButtonProps, type ButtonVariant } from "./Button";
import { DateCalendar, type WeekStart } from "./DateCalendar";
import { dateConventions, formatDate, parseDateValue, resolveDate, toISO, type DateInput } from "./dates";
import { Icon, type IconName } from "./Icon";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "./Popover";
import "./DatePicker.css";

export const QUICK_PICKS: ReadonlyArray<[label: string, phrase: string]> = [
  ["Today", "today"],
  ["Tomorrow", "tomorrow"],
  ["Next week", "next week"],
];

/** The default trigger of DatePicker and DatesPicker: a Button reading `text`, or the muted placeholder when
 *  it is empty. Popover renders it through Base UI's trigger, so the trigger props and ref pass to the Button. */
export function DateTrigger({ text, placeholder, block, className, ...rest }: ButtonProps & { text: string; placeholder: string; block?: boolean }) {
  return (
    <Button {...rest} className={["td-dp-trigger", className ?? ""].join(" ").trim()} data-block={block ? "true" : undefined}>
      <span className="td-dp-value" data-placeholder={text ? undefined : "true"}>
        {text || placeholder}
      </span>
    </Button>
  );
}

export interface DatePickerProps {
  value?: DateInput;
  /** (iso | null, date | null); null when cleared */
  onChange?: (iso: string | null, date: Date | null) => void;
  today?: DateInput;
  weekStartsOn?: WeekStart;
  min?: DateInput;
  max?: DateInput;
  /** @default "Dates" */
  placeholder?: string;
  /** @default "clock" */
  icon?: IconName;
  /** @default "outline" */
  variant?: ButtonVariant;
  /** Tints the trigger: "overdue" → --danger, "complete" → --success-icon */
  state?: "default" | "overdue" | "complete";
  placement?: PopoverPlacement;
  tier?: PopoverTier;
  block?: boolean;
  disabled?: boolean;
  /** @default true */
  allowClear?: boolean;
  /** @default true */
  quickPicks?: boolean;
  /** @default "Due date" */
  "aria-label"?: string;
  title?: string;
  /** Render your own trigger (a DueDatePill on a card) */
  trigger?: (open: boolean, selected: Date | null) => ReactNode;
  onOpenChange?: (open: boolean) => void;
  style?: CSSProperties;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  today,
  weekStartsOn = dateConventions().weekStart,
  min,
  max,
  placeholder = "Dates",
  icon = "clock",
  variant = "outline",
  state,
  placement = "bottom-start",
  tier = "menu",
  block,
  disabled,
  allowClear = true,
  quickPicks = true,
  title,
  trigger,
  onOpenChange,
  style,
  className,
  ...rest
}: DatePickerProps) {
  const ariaLabel = rest["aria-label"] ?? "Due date";
  const pop = usePopover(false);
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sel = parseDateValue(value);
  const setOpen = (o: boolean) => {
    pop.setOpen(o);
    if (!o) setTyped("");
    onOpenChange?.(o);
  };
  const commit = (d: Date | null) => {
    setOpen(false);
    const iso = d ? toISO(d) : null;
    if (iso !== toISO(sel)) onChange?.(iso, d);
  };
  const guess = typed.trim() ? resolveDate(typed, today) : null;
  const trig = trigger ? (
    <span>{trigger(pop.open, sel)}</span>
  ) : (
    <DateTrigger variant={variant} icon={icon} disabled={disabled} data-state={sel ? state : undefined} block={block} aria-label={ariaLabel} title={title} style={style} text={sel ? formatDate(sel) : ""} placeholder={placeholder} />
  );
  return (
    <Popover open={pop.open} onOpenChange={(o) => setOpen(o)} trigger={trig} placement={placement} tier={tier} width={248} role="dialog" aria-label={ariaLabel} block={block} initialFocus={inputRef} className={className}>
      <div className="td-dp">
        <div className="td-dp-field" data-active="true">
          <Icon name="calendar" size={14} />
          <input
            ref={inputRef}
            className="td-dp-input"
            placeholder="Type a date: fri, 12 sep, in 3 days"
            aria-label="Type a date"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && guess) {
                e.preventDefault();
                commit(guess);
              } else if (e.key.length === 1) e.stopPropagation();
            }}
          />
          {guess ? <span className="td-dp-preview">{formatDate(guess, { weekday: true, year: "auto", today })}</span> : null}
        </div>
        {quickPicks ? (
          <div className="td-dp-quick">
            {QUICK_PICKS.map(([l, k]) => (
              <Button key={k} onClick={() => commit(resolveDate(k, today))}>
                {l}
              </Button>
            ))}
          </div>
        ) : null}
        <DateCalendar value={sel} today={today} weekStartsOn={weekStartsOn} min={min} max={max} onChange={(_iso, d) => commit(d)} />
        <div className="td-dp-foot">
          <span className="td-dp-cur">{sel ? formatDate(sel, { weekday: true }) : "No date"}</span>
          {allowClear && sel ? (
            <Button variant="ghost" icon="x" onClick={() => commit(null)}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </Popover>
  );
}
