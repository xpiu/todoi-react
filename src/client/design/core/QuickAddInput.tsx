// QuickAddInput — the N field: one input that parses `#label @assignee !priority due… >list` while
// you type and previews the recognised properties as the same quiet meta row a card shows. Enter
// submits and keeps the field open; Escape cancels; ↑/↓ at the text edges hand focus back to the rows.
import { useMemo, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";

import { DueDatePill } from "../board/DueDatePill";
import { LabelChip } from "../board/LabelChip";
import { Avatar } from "./Avatar";
import { formatDate } from "./dates";
import { Icon, type IconName } from "./Icon";
import { parseQuickAdd, type QuickAddOptions, type QuickAddPriority, type QuickAddResult, type QuickAddToken } from "./quickAdd";
import "./QuickAddInput.css";

const PRIO_COLORS: Record<QuickAddPriority, string> = { Urgent: "var(--label-red)", High: "var(--label-orange)", Medium: "var(--label-yellow)", Low: "var(--label-blue)" };

export interface QuickAddInputProps extends QuickAddOptions {
  defaultValue?: string;
  /** @default "Item title" */
  placeholder?: string;
  /** Enter with a non-empty title. The field clears itself and stays open for the next item. */
  onSubmit?: (parsed: QuickAddResult, rawText: string) => void;
  /** Escape on an empty field (Escape on tokens-only text clears it first) */
  onCancel?: () => void;
  /** Blur — consumers usually commit when the title is non-empty and close otherwise */
  onBlur?: (parsed: QuickAddResult, rawText: string) => void;
  /** @default true */
  autoFocus?: boolean;
  "aria-label"?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  style?: CSSProperties;
  className?: string;
}

/** ↑/↓ with the caret at the edge of the text leaves the composer and focuses the neighbouring item row. */
function arrowOut(e: KeyboardEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  const down = e.key === "ArrowDown";
  if (el.selectionStart !== el.selectionEnd) return;
  if (down ? el.selectionStart !== el.value.length : el.selectionStart !== 0) return;
  const root = el.closest("[data-td-keynav]");
  if (!root) return;
  const sel = root.getAttribute("data-td-items") ?? ".td-card";
  const items = [...root.querySelectorAll<HTMLElement>(sel)].filter((n) => n.offsetWidth || n.offsetHeight || n.getClientRects().length);
  let target: HTMLElement | null = null;
  for (const n of items) {
    const pos = el.compareDocumentPosition(n);
    if (down) {
      if (!target && pos & Node.DOCUMENT_POSITION_FOLLOWING) target = n;
    } else if (pos & Node.DOCUMENT_POSITION_PRECEDING) target = n;
  }
  if (target) {
    e.preventDefault();
    target.focus();
  }
}

function TokenPreview({ t }: { t: QuickAddToken }) {
  if (t.kind === "label")
    return (
      <>
        <LabelChip color={t.color} text={t.value} size="sm" />
        {t.isNew ? <span className="td-qa-new">new label</span> : null}
      </>
    );
  if (t.kind === "assignee")
    return (
      <>
        {t.isNew ? <Icon name="user-x" size={14} /> : <Avatar name={t.value} size={16} />}
        {t.isNew ? `No member ${t.value}` : t.value}
      </>
    );
  if (t.kind === "priority")
    return (
      <>
        <Icon name="flag" size={14} color={PRIO_COLORS[t.value as QuickAddPriority]} />
        {t.value}
      </>
    );
  if (t.kind === "due") return <DueDatePill date={formatDate(t.value, { year: "auto" })} />;
  return (
    <>
      <Icon name={(t.icon ?? "arrow-right") as IconName} size={14} />
      {t.value}
    </>
  );
}

export function QuickAddInput({ defaultValue = "", placeholder = "Item title", labels, members, lists, today, defaultLabelColor, onSubmit, onCancel, onBlur, autoFocus = true, inputRef, style, className, ...rest }: QuickAddInputProps) {
  const [text, setText] = useState(defaultValue);
  const parsed = useMemo(() => parseQuickAdd(text, { labels, members, lists, today, defaultLabelColor }), [text, labels, members, lists, today, defaultLabelColor]);
  const submit = () => {
    if (!parsed.title) return;
    onSubmit?.(parsed, text);
    setText("");
  };
  return (
    <div className={["td-qa", className ?? ""].join(" ").trim()} style={style}>
      <input
        ref={inputRef}
        className="td-qa-input"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? placeholder}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onBlur?.(parsed, text)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (text && parsed.tokens.length && !parsed.title) setText("");
            else onCancel?.();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") arrowOut(e);
        }}
      />
      {parsed.tokens.length ? (
        <div className="td-qa-chips" aria-live="polite">
          {parsed.tokens.map((t, i) => (
            <span key={i} className={"td-qa-chip" + (t.isNew ? " is-new" : "")} title={t.raw}>
              <TokenPreview t={t} />
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
