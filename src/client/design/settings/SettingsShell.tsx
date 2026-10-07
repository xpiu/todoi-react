// SettingsShell — the secondary-page shell shared by /settings and /account: a page nav on the chrome
// (left) and one white card per group of 48px rows (right). Vocabulary: Page › Section › Group › Row;
// a row is a label + optional hint and exactly one control. Search filters every row on every page
// and renders matches as the same cards with a Page › Section breadcrumb. SettingsPageFrame and
// SettingsCard are the same canvas and card for a page without the nav (Import). Spec: DESIGN.md › Secondary pages.
import { useEffect, useState, type ReactNode } from "react";

import { Icon, type IconName } from "../core/Icon";
import { count, Mark } from "../core/text";
import { TextField } from "../core/TextField";
import "./SettingsShell.css";

export interface SettingsRow {
  id: string;
  label: ReactNode;
  hint?: string | null;
  /** One control at the trailing edge */
  control?: ReactNode;
  /** Expanded body under the row (help topics, the import paste area) */
  body?: ReactNode;
  bodyText?: string;
  /** Colour bar before the label (labels) */
  swatch?: string;
  /** Mono label (secrets) */
  mono?: boolean;
  /** Extra search terms (shortcut keys) */
  keywords?: ReadonlyArray<string>;
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
  /** Replaces the head (an identity card); the card is then labelled by its title */
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

/** The row a search result opened scrolls into view as it mounts (or as it becomes the hit). */
const scrollToHit = (el: HTMLElement | null) => el?.scrollIntoView({ block: "center", behavior: "smooth" });

function Row({ row, q = "", hit }: { row: SettingsRow; q?: string; hit?: boolean }) {
  const label = typeof row.label === "string" ? <Mark text={row.label} q={q} /> : row.label;
  return (
    <>
      <div className="td-set-row" data-hit={hit || undefined} ref={hit ? scrollToHit : undefined}>
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

/** One card: head (title, or a breadcrumb button in search results), rows, and anything composed after them. */
export function SettingsCard({ group, crumb, q = "", hit, children }: { group: SettingsGroup; crumb?: { label: string; onOpen: () => void }; q?: string; hit?: string | null; children?: ReactNode }) {
  const headingId = `set-g-${group.id}`;
  return (
    <section className="td-set-group" data-fields={group.fields || undefined} data-tone={group.tone} aria-labelledby={group.lead ? undefined : headingId} aria-label={group.lead ? group.title : undefined}>
      {group.lead ?? (
        <div className="td-set-grouphead">
          <h2 className="td-set-grouptitle" id={headingId}>
            <Mark text={group.title} q={q} />
          </h2>
          {crumb ? (
            <button type="button" className="td-set-grouppath-btn" onClick={crumb.onOpen} aria-label={`Open ${crumb.label}`}>
              {crumb.label}
              <Icon name="arrow-right" size={12} />
            </button>
          ) : group.sub ? (
            <span className="td-set-grouppath">{group.sub}</span>
          ) : null}
        </div>
      )}
      {!group.rows.length && group.empty ? <p className="td-set-note">{group.empty}</p> : null}
      {group.rows.map((r) => (
        <Row key={r.id} row={r} q={q} hit={hit === r.id} />
      ))}
      {children}
    </section>
  );
}

/** The settings canvas and column without the page nav: a title, a line under it, then cards. */
export function SettingsPageFrame({ title, crumb, children }: { title: string; crumb?: string; children?: ReactNode }) {
  return (
    <div className="td-set">
      <div className="td-set-inner" data-nav="false">
        <div className="td-set-main">
          <div>
            <h1 className="td-set-title">{title}</h1>
            {crumb ? <p className="td-set-crumb">{crumb}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const rowText = (r: SettingsRow) => [typeof r.label === "string" ? r.label : "", r.hint ?? "", r.bodyText ?? "", ...(r.keywords ?? [])].join(" ").toLowerCase();

export function SettingsShell({ pages, page, section, onNavigate }: SettingsShellProps) {
  const [q, setQ] = useState("");
  const [hit, setHit] = useState<string | null>(null);
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
  // The hit highlight fades after a moment; the scroll itself happens as the row mounts.
  useEffect(() => {
    if (!hit || query) return;
    const t = setTimeout(() => setHit(null), 1600);
    return () => clearTimeout(t);
  }, [hit, query]);
  const total = results?.reduce((n, x) => n + x.group.rows.length, 0) ?? 0;
  const matched = results ? `${count(total, "setting")} match “${q.trim()}”` : "";
  return (
    <div className="td-set">
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
                }
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
          {/* Always mounted (so a changed count is announced) and its own node (Minimal hides the crumb). */}
          <p className="td-sr-only" role="status">
            {results ? `${matched}${results.length ? ". Enter opens the first result" : ""}` : ""}
          </p>
          {results ? (
            <>
              <div>
                <h1 className="td-set-title">Search</h1>
                <p className="td-set-crumb">
                  {matched}
                  {results.length ? " · Enter opens the first result" : ""}
                </p>
              </div>
              {results.length ? (
                results.map((x) => <SettingsCard key={`${x.page.id}/${x.section.id}/${x.group.id}`} group={x.group} crumb={{ label: `${x.page.title} › ${x.section.label}`, onOpen: () => openResult(x) }} q={query} />)
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
                <SettingsCard key={g.id} group={g} hit={hit} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
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
