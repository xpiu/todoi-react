// SettingsShell — the secondary-page shell shared by /settings and /account: a page nav on the chrome
// (left) and one white card per group of 48px rows (right). Vocabulary: Page › Section › Group › Row;
// a row is a label + optional hint and exactly one control. Search filters every row on every page
// and renders matches as the same cards with a Page › Section breadcrumb. Spec: DESIGN.md › Secondary pages.
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon, type IconName } from "../core/Icon";
import { TextField } from "../core/TextField";
import "./SettingsShell.css";

export interface SettingsRow {
  id: string;
  label: ReactNode;
  /** Plain text of the label for search */
  text?: string;
  hint?: string | null;
  /** One control at the trailing edge */
  control?: ReactNode;
  /** Expanded body under the row (help topics) */
  body?: ReactNode;
  bodyText?: string;
  /** Colour bar before the label (labels) */
  swatch?: string;
  /** Mono label (secrets) */
  mono?: boolean;
  /** Extra search terms (shortcut keys) */
  keywords?: string[];
}
export interface SettingsGroup {
  id: string;
  title: string;
  /** Quiet text at the trailing edge of the head */
  sub?: string;
  rows: SettingsRow[];
  /** Shown when there are no rows */
  empty?: string;
  tone?: "info" | "warn" | "danger";
  /** Compact field rows */
  fields?: boolean;
  /** Rendered above the rows (an identity card) */
  lead?: ReactNode;
}
export interface SettingsSection {
  id: string;
  label: string;
  title?: string;
  icon: IconName;
  hint?: string;
  groups: SettingsGroup[];
}
export interface SettingsPage {
  id: string;
  title: string;
  sections: SettingsSection[];
}

export interface SettingsShellProps {
  pages: SettingsPage[];
  page: string;
  section?: string;
  onNavigate: (page: string, section: string) => void;
}

const Mark = ({ text, q }: { text: string; q: string }) => {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="td-set-mark">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
};

function Row({ row, q, hit }: { row: SettingsRow; q: string; hit?: boolean }) {
  const label = typeof row.label === "string" ? <Mark text={row.label} q={q} /> : row.label;
  return (
    <>
      <div className="td-set-row" data-setting={row.id} data-hit={hit || undefined}>
        <div className="td-set-rowtext">
          <span className="td-set-rowlabel" data-mono={row.mono ? "true" : undefined}>
            {row.swatch ? <span className="td-set-bar" style={{ background: row.swatch }} aria-hidden /> : null}
            <span>{label}</span>
          </span>
          {row.hint ? (
            <span className="td-set-rowhint">
              <Mark text={row.hint} q={q} />
            </span>
          ) : null}
        </div>
        <div className="td-set-rowctl">{row.control}</div>
      </div>
      {row.body ? <div className="td-set-body">{row.body}</div> : null}
    </>
  );
}

function Group({ group, path, onOpen, q, hit }: { group: SettingsGroup; path?: string; onOpen?: () => void; q: string; hit?: string | null }) {
  return (
    <section className="td-set-group" data-fields={group.fields || undefined} data-tone={group.tone} aria-labelledby={`set-g-${group.id}`}>
      {group.lead ?? (
        <div className="td-set-grouphead">
          <h2 className="td-set-grouptitle" id={`set-g-${group.id}`}>
            <Mark text={group.title} q={q} />
          </h2>
          {path ? (
            onOpen ? (
              <button type="button" className="td-set-grouppath-btn" onClick={onOpen} aria-label={`Open ${path}`}>
                {path}
                <Icon name="arrow-right" size={12} />
              </button>
            ) : (
              <span className="td-set-grouppath">{path}</span>
            )
          ) : group.sub ? (
            <span className="td-set-grouppath">{group.sub}</span>
          ) : null}
        </div>
      )}
      {!group.rows.length && group.empty ? <p className="td-set-note">{group.empty}</p> : null}
      {group.rows.map((r) => (
        <Row key={r.id} row={r} q={q} hit={hit === r.id} />
      ))}
    </section>
  );
}

const rowText = (r: SettingsRow) => [r.text ?? (typeof r.label === "string" ? r.label : ""), r.hint ?? "", r.bodyText ?? "", ...(r.keywords ?? [])].join(" ").toLowerCase();

export function SettingsShell({ pages, page, section, onNavigate }: SettingsShellProps) {
  const [q, setQ] = useState("");
  const [hit, setHit] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const query = q.trim().toLowerCase();
  const cur = pages.find((p) => p.id === page) ?? pages[0]!;
  const sec = cur.sections.find((s) => s.id === section) ?? cur.sections[0]!;
  const results = query
    ? pages.flatMap((p) =>
        p.sections.flatMap((s) =>
          s.groups
            .map((g) => ({ page: p, section: s, group: { ...g, rows: g.rows.filter((r) => (rowText(r) + " " + g.title.toLowerCase() + " " + s.label.toLowerCase()).includes(query)) } }))
            .filter((x) => x.group.rows.length),
        ),
      )
    : null;
  const go = (p: string, s: string) => {
    setQ("");
    onNavigate(p, s);
  };
  const openResult = (x: { page: SettingsPage; section: SettingsSection; group: SettingsGroup }) => {
    go(x.page.id, x.section.id);
    setHit(x.group.rows[0]?.id ?? null);
  };
  useEffect(() => {
    if (!hit || query) return;
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(hit)}"]`);
    if (el && root) {
      const r = el.getBoundingClientRect(), c = root.getBoundingClientRect();
      if (r.top < c.top + 56 || r.bottom > c.bottom) root.scrollTo({ top: root.scrollTop + r.top - c.top - 96, behavior: "smooth" });
    }
    const t = setTimeout(() => setHit(null), 1600);
    return () => clearTimeout(t);
  }, [hit, query, page, section]);
  const total = results?.reduce((n, x) => n + x.group.rows.length, 0) ?? 0;
  return (
    <div className="td-set" ref={rootRef}>
      <div className="td-set-inner">
        <nav className="td-set-nav" aria-label="Settings pages">
          <div className="td-set-search" role="search">
            <TextField
              dark
              icon="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQ("");
                } else if (e.key === "Enter" && results?.[0]) {
                  e.preventDefault();
                  openResult(results[0]);
                } else if (e.key.length === 1) e.stopPropagation();
              }}
              placeholder="Search settings"
              aria-label="Search settings"
            />
            {q ? (
              <button type="button" className="td-set-clear" aria-label="Clear search" onClick={() => setQ("")}>
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
          <div className="td-set-navlist">
            {[cur, ...pages.filter((p) => p.id !== cur.id)].map((p) => (
              <div key={p.id} className="td-set-navpage">
                <div className="td-set-navhead">{p.title}</div>
                {p.sections.map((s) => (
                  <button key={s.id} type="button" className="td-set-navrow" aria-current={!query && p.id === cur.id && s.id === sec.id ? "true" : undefined} onClick={() => go(p.id, s.id)}>
                    <span className="td-set-navicon">
                      <Icon name={s.icon} size={16} />
                    </span>
                    <span className="td-set-navlabel">{s.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
        <div className="td-set-main">
          {results ? (
            <>
              <div>
                <h1 className="td-set-title">Search</h1>
                <p className="td-set-crumb" aria-live="polite">
                  {total} setting{total === 1 ? "" : "s"} match “{q.trim()}”{results.length ? " · Enter opens the first result" : ""}
                </p>
              </div>
              {results.length ? (
                results.map((x) => <Group key={`${x.page.id}/${x.section.id}/${x.group.id}`} group={x.group} path={`${x.page.title} › ${x.section.label}`} onOpen={() => openResult(x)} q={query} />)
              ) : (
                <div className="td-set-group">
                  <div className="td-set-empty">No settings match “{q.trim()}”</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <h1 className="td-set-title">{cur.title}</h1>
                {cur.sections.length > 1 ? (
                  <p className="td-set-crumb">
                    {sec.title ?? sec.label}
                    {sec.hint ? ` · ${sec.hint}` : ""}
                  </p>
                ) : null}
              </div>
              {sec.groups.map((g) => (
                <Group key={g.id} group={g} q="" hit={hit} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A mono kbd chip row control for the Keyboard section. */
export function Keys({ keys, keyLabel }: { keys: string[]; keyLabel: (t: string) => string }) {
  const SEPS = new Set(["+", "or", "then", "–"]);
  return (
    <span className="td-set-keys">
      {keys.map((t, i) =>
        SEPS.has(t) ? (
          <span key={i} className="td-set-keysep">
            {t}
          </span>
        ) : (
          <kbd key={i} className="td-set-kbd">
            {keyLabel(t)}
          </kbd>
        ),
      )}
    </span>
  );
}

export function StatusDot({ on, label }: { on?: boolean; label: string }) {
  return (
    <span className="td-set-status" role="status">
      <span className="td-set-dot" data-on={on ? "true" : undefined} aria-hidden />
      {label}
    </span>
  );
}

export function SettingsLink({ href, label = "Open" }: { href: string; label?: string }) {
  return (
    <a className="td-set-link" href={href} target="_blank" rel="noreferrer">
      {label}
      <Icon name="external-link" size={14} />
    </a>
  );
}

export function MonoValue({ value }: { value: string }) {
  return (
    <span className="td-set-mono" title={value}>
      {value}
    </span>
  );
}
