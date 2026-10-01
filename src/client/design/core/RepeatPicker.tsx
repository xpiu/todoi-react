// RepeatPicker — the recurrence field. Trigger: repeat glyph + the rule as a sentence. Panel (a dialog
// Popover): "Doesn't repeat", preset radio rows worded from the anchor due date, Custom… (interval +
// unit, weekday discs, Ends never / until / after N). The value is a plain RepeatRule or null; the
// picker never mutates dates. Spec: DESIGN.md › Item editing › Repeat.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { Button, type ButtonVariant } from "./Button";
import { formatDate, parseDateValue, resolveDate, toISO, type DateInput } from "./dates";
import { Icon, type IconName } from "./Icon";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "./Popover";
import { Segmented } from "./Segmented";
import { describeRepeat, UNITS, type RepeatEnds, type RepeatFreq, type RepeatRule } from "./repeat";
import "./Menu.css";
import "./RepeatPicker.css";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD1 = ["S", "M", "T", "W", "T", "F", "S"];
const UNIT_OPTIONS = (Object.keys(UNITS) as RepeatFreq[]).map((f) => ({ id: f, label: UNITS[f][0][0]!.toUpperCase() + UNITS[f][0].slice(1) }));

interface CustomRule {
  freq: RepeatFreq;
  interval: number;
  byWeekday: number[];
  ends: RepeatEnds;
}

function CustomForm({ rule, anchor, today, onDone, onBack }: { rule?: RepeatRule | null; anchor?: DateInput; today?: DateInput; onDone: (r: RepeatRule) => void; onBack: () => void }) {
  const a = parseDateValue(anchor);
  const [r, setR] = useState<CustomRule>(() => ({
    freq: rule?.freq ?? "weekly",
    interval: rule?.interval ?? 1,
    byWeekday: rule?.byWeekday ?? (a ? [a.getDay()] : [1]),
    ends: rule?.ends ?? { type: "never" },
  }));
  const [untilTyped, setUntil] = useState(r.ends.type === "on" && r.ends.date ? formatDate(r.ends.date, { year: "auto", today }) : "");
  const set = (p: Partial<CustomRule>) => setR((x) => ({ ...x, ...p }));
  const untilGuess = untilTyped.trim() ? resolveDate(untilTyped, today) : null;
  const endsOn = r.ends.type === "on" ? r.ends : null;
  const endsAfter = r.ends.type === "after" ? r.ends : null;
  const commit = () => {
    const out: RepeatRule = { freq: r.freq, interval: r.interval, ends: r.ends };
    if (r.freq === "weekly") out.byWeekday = r.byWeekday;
    onDone(out);
  };
  const radio = (checked: boolean, pick: () => void, children: ReactNode) => (
    <div
      className="td-rp-opt"
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      onClick={pick}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
    >
      <span className="td-rp-radio" />
      {children}
    </div>
  );
  const stopTyping = (e: KeyboardEvent) => {
    if (e.key.length === 1) e.stopPropagation();
  };
  return (
    <div className="td-rp">
      <div className="td-rp-head">
        <Button variant="ghost" icon="arrow-left" aria-label="Back" onClick={onBack} />
        Custom repeat
      </div>
      <div className="td-rp-row">
        Every
        <input className="td-rp-num" type="number" min={1} max={99} value={r.interval} aria-label="Interval" onChange={(e) => set({ interval: Math.max(1, Math.min(99, +e.target.value || 1)) })} onKeyDown={stopTyping} />
        <span className="td-rp-unit">{UNITS[r.freq][r.interval === 1 ? 0 : 1]}</span>
      </div>
      <Segmented size="sm" stretch aria-label="Unit" options={UNIT_OPTIONS} value={r.freq} onChange={(f) => set({ freq: f })} />
      {r.freq === "weekly" ? (
        <div className="td-rp-days" role="group" aria-label="Weekdays">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              type="button"
              className="td-rp-day"
              aria-label={WD[d]}
              aria-pressed={r.byWeekday.includes(d)}
              onClick={() => {
                const next = r.byWeekday.includes(d) ? r.byWeekday.filter((x) => x !== d) : [...r.byWeekday, d];
                if (next.length) set({ byWeekday: next });
              }}
            >
              {WD1[d]}
            </button>
          ))}
        </div>
      ) : null}
      <div role="radiogroup" aria-label="Ends" className="td-rp-ends">
        {radio(r.ends.type === "never", () => set({ ends: { type: "never" } }), "Never ends")}
        {radio(
          !!endsOn,
          () => set({ ends: { type: "on", date: endsOn?.date ?? null } }),
          <>
            Until
            {endsOn ? (
              <input
                className="td-rp-inline"
                autoFocus
                placeholder="31 dec, in 6 weeks…"
                aria-label="Until date"
                value={untilTyped}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setUntil(e.target.value);
                  const g = resolveDate(e.target.value, today);
                  set({ ends: { type: "on", date: g ? toISO(g) : null } });
                }}
                onKeyDown={stopTyping}
              />
            ) : null}
            {endsOn && untilGuess ? <span className="td-rp-preview">{formatDate(untilGuess, { year: "auto", today })}</span> : null}
          </>,
        )}
        {radio(
          !!endsAfter,
          () => set({ ends: { type: "after", count: endsAfter?.count ?? 5 } }),
          <>
            After
            {endsAfter ? (
              <input
                className="td-rp-num td-rp-num-sm"
                type="number"
                min={1}
                max={999}
                value={endsAfter.count}
                aria-label="Number of times"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => set({ ends: { type: "after", count: Math.max(1, +e.target.value || 1) } })}
                onKeyDown={stopTyping}
              />
            ) : null}
            {endsAfter ? "times" : " a number of times"}
          </>,
        )}
      </div>
      <div className="td-rp-foot">
        <span className="td-rp-sum">{describeRepeat(r, anchor)}</span>
        <Button variant="primary" disabled={!!endsOn && !endsOn.date} onClick={commit}>
          Done
        </Button>
      </div>
    </div>
  );
}

export interface RepeatPickerProps {
  value?: RepeatRule | null;
  onChange?: (rule: RepeatRule | null) => void;
  /** The item's due date (ISO) — presets and wording count from it */
  anchor?: DateInput;
  today?: DateInput;
  /** @default "Repeat" */
  placeholder?: string;
  variant?: ButtonVariant;
  placement?: PopoverPlacement;
  tier?: PopoverTier;
  block?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  title?: string;
  trigger?: (open: boolean, value: RepeatRule | null | undefined) => ReactNode;
  defaultOpen?: boolean;
  style?: CSSProperties;
  className?: string;
}

const signature = (r: RepeatRule | null | undefined) => (r ? JSON.stringify([r.freq, r.interval ?? 1, (r.byWeekday ?? []).slice().sort(), r.ends && r.ends.type !== "never" ? r.ends : null]) : "");

export function RepeatPicker({ value, onChange, anchor, today, placeholder = "Repeat", variant = "outline", placement = "bottom-start", tier = "menu", block, disabled, title, trigger, defaultOpen = false, style, className, ...rest }: RepeatPickerProps) {
  const ariaLabel = rest["aria-label"] ?? "Repeat";
  const pop = usePopover(defaultOpen);
  const [custom, setCustom] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const a = parseDateValue(anchor);
  const presets: Array<{ key: string; rule: RepeatRule }> = [
    { key: "daily", rule: { freq: "daily", interval: 1 } },
    { key: "weekly", rule: { freq: "weekly", interval: 1, byWeekday: [a ? a.getDay() : 1] } },
    { key: "weekday", rule: { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] } },
    { key: "monthly", rule: { freq: "monthly", interval: 1 } },
    { key: "yearly", rule: { freq: "yearly", interval: 1 } },
  ];
  const cur = signature(value);
  const isPreset = presets.some((p) => signature(p.rule) === cur);
  const setOpen = (o: boolean) => {
    pop.setOpen(o);
    if (!o) setCustom(false);
  };
  const pick = (r: RepeatRule | null) => {
    setOpen(false);
    onChange?.(r);
  };
  const label = describeRepeat(value, anchor);
  const trig = trigger ? (
    <span>{trigger(pop.open, value)}</span>
  ) : (
    <Button variant={variant} icon="repeat" disabled={disabled} className="td-dp-trigger" data-block={block ? "true" : undefined} aria-label={ariaLabel} title={title} style={style}>
      <span className="td-rp-value" data-placeholder={label ? undefined : "true"}>
        {label || placeholder}
      </span>
    </Button>
  );
  // Rows are radios inside a radiogroup: ↑↓ rove, Enter / Space pick.
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = listRef.current ? [...listRef.current.querySelectorAll<HTMLElement>('[role="radio"]')] : [];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      rows[(i + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length]?.focus();
    }
  };
  const row = (checked: boolean, onPick: () => void, children: ReactNode, icon?: IconName, drill?: boolean) => (
    <div
      className="td-menu-item"
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
    >
      {icon ? (
        <span className="td-menu-item-icon">
          <Icon name={icon} size={15} />
        </span>
      ) : null}
      <span className="td-menu-item-label">{children}</span>
      {drill ? (
        <span className="td-menu-item-trail">
          <Icon name="chevron-right" size={13} />
        </span>
      ) : null}
      {checked ? <Icon name="check" size={14} className="td-menu-item-check" data-after-trail={drill ? "true" : "false"} /> : null}
    </div>
  );
  return (
    <Popover open={pop.open} onOpenChange={(o) => setOpen(o)} trigger={trig} placement={placement} tier={tier} width={248} role="dialog" aria-label={ariaLabel} block={block} className={className}>
      {custom ? (
        <CustomForm rule={value} anchor={anchor} today={today} onBack={() => setCustom(false)} onDone={pick} />
      ) : (
        <div ref={listRef} className="td-rp-list" role="radiogroup" aria-label={ariaLabel} onKeyDown={onListKey}>
          {row(!value, () => pick(null), "Doesn't repeat", "circle-off")}
          <div className="td-menu-divider" role="separator" />
          {presets.map((p) => (
            <span key={p.key}>{row(signature(p.rule) === cur, () => pick(p.rule), describeRepeat(p.rule, anchor))}</span>
          ))}
          <div className="td-menu-divider" role="separator" />
          {row(!!value && !isPreset, () => setCustom(true), "Custom…", "settings-2", true)}
          {!anchor ? <div className="td-menu-note">Set a due date first; the repeat counts from it.</div> : null}
        </div>
      )}
    </Popover>
  );
}
