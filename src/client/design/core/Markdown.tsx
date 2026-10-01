// Markdown — the small subset the GitHub / Embridge sync writes: # ## ### headings, - / 1. lists,
// - [ ] / - [x] tasks, > quotes, ``` fences, blank-line paragraphs (single newlines become <br>);
// inline **bold**, *italic*, ~~strike~~, `code`, [text](url), bare URLs, @mentions, item keys.
// No raw HTML, images or tables. `renderMarkdown` is pure; `Markdown` wraps it. Spec: DESIGN.md › Description.
import { Fragment, type ReactNode } from "react";

import { Icon } from "./Icon";
import "./Markdown.css";

export interface MarkdownMember {
  name: string;
  nickname?: string | null;
}
export interface MarkdownOptions {
  /** @names matching a nickname, first name or full name render as mentions */
  members?: ReadonlyArray<MarkdownMember>;
  /** Makes item keys (TD-12) clickable */
  onOpenKey?: (key: string) => void;
}

export const ITEM_KEY_RE = /^[A-Z][A-Z0-9]{1,5}-\d+$/;
// Inline grammar, in priority order.
const INLINE = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<]+|(?:^|(?<=\s))[*_][^*_\s][^*_]*[*_]|(?:^|(?<=\s))@[\w.-]+|(?:^|(?<=[\s(]))[A-Z][A-Z0-9]{1,5}-\d+(?=[\s.,;:)]|$))/g;

function isKnownMember(name: string, members?: ReadonlyArray<MarkdownMember>): boolean {
  if (!members) return true;
  const n = name.toLowerCase();
  return members.some((mem) => [mem.nickname, mem.name.split(/\s+/)[0], mem.name].filter(Boolean).some((x) => String(x).toLowerCase() === n));
}

const unescape = (t: string) => t.replace(/\\([\\`*_{}[\]()#+\-.!~>])/g, "$1");

function inline(text: string, o: MarkdownOptions, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(unescape(text.slice(last, m.index)));
    let t = m[0];
    const k = `${keyBase}-${i++}`;
    const lead = /^\s/.test(t) ? t[0] : "";
    if (lead) {
      out.push(lead);
      t = t.slice(1);
    }
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("~~")) out.push(<del key={k}>{t.slice(2, -2)}</del>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      out.push(
        <a key={k} href={mm[2]} target="_blank" rel="noopener noreferrer">
          {mm[1]}
        </a>,
      );
    } else if (/^https?:/.test(t)) {
      out.push(
        <a key={k} href={t} target="_blank" rel="noopener noreferrer">
          {t.replace(/^https?:\/\//, "")}
        </a>,
      );
    } else if (t.startsWith("@")) {
      out.push(
        isKnownMember(t.slice(1), o.members) ? (
          <span key={k} className="td-md-mention">
            {t}
          </span>
        ) : (
          t
        ),
      );
    } else if (ITEM_KEY_RE.test(t)) {
      const open = o.onOpenKey;
      out.push(
        <span
          key={k}
          className="td-md-key"
          role={open ? "link" : undefined}
          tabIndex={open ? 0 : undefined}
          onClick={open ? () => open(t) : undefined}
          onKeyDown={open ? (e) => e.key === "Enter" && open(t) : undefined}
        >
          {t}
        </span>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(unescape(text.slice(last)));
  return out;
}

const BLOCK_START = /^(#{1,3}\s|```|\s*>|\s*([-*+]|\d+[.)])\s)/;
const LIST_LINE = /^\s*([-*+]|\d+[.)])\s+/;

/** The renderer alone — an array of React blocks. */
export function renderMarkdown(src: string | null | undefined, o: MarkdownOptions = {}): ReactNode[] {
  const lines = String(src ?? "").replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (/^\s*$/.test(l)) {
      i++;
      continue;
    }
    if (/^```/.test(l)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) buf.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={b++}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) {
      const Tag = `h${m[1]!.length}` as "h1" | "h2" | "h3";
      blocks.push(<Tag key={b++}>{inline(m[2]!, o, `h${b}`)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) buf.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={b++}>{inline(buf.join(" "), o, `q${b}`)}</blockquote>);
      continue;
    }
    if (LIST_LINE.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l);
      const items: ReactNode[] = [];
      while (i < lines.length && LIST_LINE.test(lines[i]!)) {
        const t = lines[i]!.replace(LIST_LINE, "");
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(t);
        if (task) {
          const on = task[1] !== " ";
          items.push(
            <li key={items.length} className="td-md-task">
              <span className="td-md-box" data-on={on ? "true" : "false"} aria-hidden>
                {on ? <Icon name="check" size={9} strokeWidth={3.5} /> : null}
              </span>
              <span className={on ? "td-md-task-done" : undefined}>{inline(task[2]!, o, `t${b}${items.length}`)}</span>
            </li>,
          );
        } else items.push(<li key={items.length}>{inline(t, o, `l${b}${items.length}`)}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={b++}>{items}</ol> : <ul key={b++}>{items}</ul>);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]!) && !BLOCK_START.test(lines[i]!)) buf.push(lines[i++]!);
    if (!buf.length) buf.push(lines[i++]!);
    const parts: ReactNode[] = [];
    buf.forEach((t, k) => {
      if (k) parts.push(<br key={`br${k}`} />);
      parts.push(<Fragment key={`f${k}`}>{inline(t, o, `p${b}${k}`)}</Fragment>);
    });
    blocks.push(<p key={b++}>{parts}</p>);
  }
  return blocks;
}

export interface MarkdownProps extends MarkdownOptions {
  text?: string | null;
  className?: string;
}

export function Markdown({ text, members, onOpenKey, className }: MarkdownProps) {
  return <div className={["td-md", className ?? ""].join(" ").trim()}>{renderMarkdown(text, { members, onOpenKey })}</div>;
}
