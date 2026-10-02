// CommentComposer — MentionField (auto-growing textarea with @mention completion) + Send. ↵ sends,
// ⇧↵ breaks a line; `replyTo` prefills "@handle " and shows a dismissible "Replying to" line.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";

import { Avatar } from "../core/Avatar";
import { Button } from "../core/Button";
import { IconButton } from "../core/IconButton";
import { InlineError } from "../core/InlineError";
import "./CommentComposer.css";

export interface MentionMember {
  id: string;
  name: string;
  nickname?: string | null;
  src?: string;
  color?: string;
}
export const mentionHandle = (m: MentionMember) => m.nickname || m.name.split(/\s+/)[0] || m.name;

export interface MentionFieldProps {
  value: string;
  onChange: (v: string) => void;
  members?: ReadonlyArray<MentionMember>;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit?: () => void;
  /** @default true — ↵ submits, ⇧↵ breaks a line */
  submitOnEnter?: boolean;
  listBelow?: boolean;
  "aria-label"?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  style?: CSSProperties;
  className?: string;
}

export function MentionField({ value, onChange, members = [], placeholder, rows = 1, autoFocus, onKeyDown, onSubmit, submitOnEnter = true, listBelow, inputRef, style, className, ...rest }: MentionFieldProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  const [q, setQ] = useState<{ start: number; text: string } | null>(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, ref]);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const n = ref.current.value.length;
      ref.current.setSelectionRange(n, n);
    }
  }, [autoFocus, ref]);
  const scan = (text: string, caret: number) => {
    const m = /(^|\s)@([\w.-]*)$/.exec(text.slice(0, caret));
    return m ? { start: caret - m[2]!.length - 1, text: m[2]! } : null;
  };
  const matches = q
    ? members
        .filter((m) => {
          const t = q.text.toLowerCase();
          return !t || [mentionHandle(m), m.name, m.nickname].filter(Boolean).some((s) => String(s).toLowerCase().startsWith(t) || m.name.toLowerCase().includes(t));
        })
        .slice(0, 6)
    : [];
  const insert = (m: MentionMember) => {
    if (!q) return;
    const el = ref.current;
    const caret = el ? el.selectionStart : value.length;
    const h = `@${mentionHandle(m)} `;
    const next = value.slice(0, q.start) + h + value.slice(caret);
    onChange(next);
    setQ(null);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(q.start + h.length, q.start + h.length);
      }
    });
  };
  return (
    <div className={["td-mf", className ?? ""].join(" ").trim()} style={style}>
      {q && matches.length ? (
        <div className="td-mf-list" role="listbox" aria-label="People" data-below={listBelow ? "true" : undefined}>
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              className="td-mf-opt"
              aria-selected={i === idx}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(m);
              }}
              onMouseEnter={() => setIdx(i)}
            >
              <Avatar name={m.name} src={m.src} color={m.color} size={20} />
              {m.name}
              <span className="td-mf-sub">@{mentionHandle(m)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        ref={ref}
        className="td-mf-ta"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? "Comment"}
        onChange={(e) => {
          onChange(e.target.value);
          setQ(scan(e.target.value, e.target.selectionStart));
          setIdx(0);
        }}
        onKeyDown={(e) => {
          if (q && matches.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => (i + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => (i - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insert(matches[idx]!);
              return;
            }
          }
          if (e.key === "Escape" && q) {
            e.stopPropagation();
            setQ(null);
            return;
          }
          if (submitOnEnter && e.key === "Enter" && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit?.();
            return;
          }
          if (e.key.length === 1) e.stopPropagation();
          onKeyDown?.(e);
        }}
        onBlur={() => setTimeout(() => setQ(null), 0)}
        onClick={(e) => setQ(scan(e.currentTarget.value, e.currentTarget.selectionStart))}
      />
    </div>
  );
}

export interface CommentComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  members?: ReadonlyArray<MentionMember>;
  placeholder?: string;
  autoFocus?: boolean;
  replyTo?: string | null;
  onCancelReply?: () => void;
  sendLabel?: string;
  /** A send is in flight: the text stays, Send waits */
  pending?: boolean;
  /** Why the last send failed; the text stays and Send retries */
  error?: string | null;
  style?: CSSProperties;
}

export function CommentComposer({ value, onChange, onSubmit, members = [], placeholder = "Write a comment…", autoFocus, replyTo, onCancelReply, sendLabel = "Send", pending, error, style }: CommentComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (replyTo && ref.current) {
      ref.current.focus();
      const n = ref.current.value.length;
      ref.current.setSelectionRange(n, n);
    }
  }, [replyTo]);
  const can = !!value.trim() && !pending;
  return (
    <div className="td-composer" style={style}>
      {replyTo ? (
        <span className="td-composer-reply">
          Replying to <b>{replyTo}</b>
          {onCancelReply ? <IconButton name="x" label="Stop replying" size={20} iconSize={12} onClick={onCancelReply} /> : null}
        </span>
      ) : null}
      <MentionField inputRef={ref} value={value} onChange={onChange} members={members} placeholder={placeholder} autoFocus={autoFocus} onSubmit={() => can && onSubmit(value.trim())} />
      {value.trim() ? (
        <div className="td-composer-foot">
          <Button variant="primary" disabled={!can} onClick={() => onSubmit(value.trim())}>
            {pending ? "Sending…" : error ? "Retry" : sendLabel}
          </Button>
          <span className="td-composer-hint">↵ send · ⇧↵ new line · @ mention</span>
        </div>
      ) : null}
      <InlineError message={error} />
    </div>
  );
}
