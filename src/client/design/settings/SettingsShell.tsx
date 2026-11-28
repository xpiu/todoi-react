// SettingsShell — the secondary-page shell shared by /settings and /account: a page nav on the chrome
// (left) and one white card per group of 48px rows (right). Vocabulary: Page › Section › Group › Row;
// a row is a label + optional hint and exactly one control; a group's `heading` opens a subsection above
// its card. Search filters every row on every page (and matches group titles and headings) and renders
// matches as the same cards with a Page › Section breadcrumb. SettingsPageFrame and
// SettingsCard are the same canvas and card for a page without the nav (Import). Spec: DESIGN.md › Secondary pages.
import { Fragment, useEffect, useState, type ReactNode } from "react";

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
  /** Opens a subsection: a heading on the chrome above this card, e.g. "Synchronization" above the per-project cards of Storage & sync. Section view only; searchable */
  heading?: string;
  /** One quiet line under `heading` */
  headingNote?: string;
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
  /** The page listed first in the nav: the one the visit started on, so opening a section of the other page reorders nothing. Defaults to `page` */
  lead?: string;
  onNavigate: (page: string, section: string) => void;
}

/** The row a search result opened scrolls into view as it mounts (or as it becomes the hit). */
const scrollToHit = (el: HTMLElement | null) => el?.scrollIntoView({ block: "center", behavior: "smooth" });

function Row({ row, q = "", hit }: { row: SettingsRow; q?: string; hit?: boolean }) {
  const label = typeof row.label === "string" ? <Mark text={row.label} q={q} /> : row.label;
  return (
    <>
      <div className="td-settings-row" data-hit={hit || undefined} ref={hit ? scrollToHit : undefined}>
        <div className="td-settings-rowtext" data-swatch={row.swatch ? "true" : undefined}>
          <span className="td-settings-rowlabel" data-mono={row.mono ? "true" : undefined}>
            {row.swatch ? <span className="td-settings-bar" style={{ background: row.swatch }} aria-hidden /> : null}
            <span>{label}</span>
          </span>
          {row.hint ? (
            <span className="td-settings-rowhint">
              <Mark text={row.hint} q={q} />
            </span>
          ) : null}
        </div>
        <div className="td-settings-row-control">{row.control}</div>
      </div>
      {row.body ? <div className="td-settings-body">{row.body}</div> : null}
    </>
  );
}

/** One card: head (title, or a breadcrumb button in search results), rows, and anything composed after them. */
export function SettingsCard({ group, crumb, q = "", hit, children }: { group: SettingsGroup; crumb?: { label: string; onOpen: () => void }; q?: string; hit?: string | null; children?: ReactNode }) {
  const headingId = `set-g-${group.id}`;
  return (
    <section className="td-settings-group" data-fields={group.fields || undefined} data-tone={group.tone} aria-labelledby={group.lead ? undefined : headingId} aria-label={group.lead ? group.title : undefined}>
      {group.lead ?? (
        <div className="td-settings-grouphead">
          <h2 className="td-settings-grouptitle" id={headingId}>
            <Mark text={group.title} q={q} />
          </h2>
          {crumb ? (
            <button type="button" className="td-settings-grouppath-btn" onClick={crumb.onOpen} aria-label={`Open ${crumb.label}`}>
              {crumb.label}
              <Icon name="arrow-right" size={12} />
            </button>
          ) : group.sub ? (
            <span className="td-settings-grouppath">{group.sub}</span>
          ) : null}
        </div>
      )}
      {!group.rows.length && group.empty ? <p className="td-settings-note">{group.empty}</p> : null}
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
    <div className="td-settings">
      <div className="td-settings-inner" data-nav="false">
        <div className="td-settings-main">
          <div>
            <h1 className="td-settings-title">{title}</h1>
            {crumb ? <p className="td-settings-crumb">{crumb}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const rowText = (r: SettingsRow) => [typeof r.label === "string" ? r.label : "", r.hint ?? "", r.bodyText ?? "", ...(r.keywords ?? [])].join(" ").toLowerCase();
const groupText = (g: SettingsGroup) => [g.title, g.heading ?? ""].join(" ").toLowerCase();

export function SettingsShell({ pages, page, section, lead, onNavigate }: SettingsShellProps) {
  const [q, setQ] = useState("");
  const [hit, setHit] = useState<string | null>(null);
  const query = q.trim().toLowerCase();
  const cur = pages.find((p) => p.id === page) ?? pages[0]!;
  const sec = cur.sections.find((s) => s.id === section) ?? cur.sections[0]!;
  const first = pages.find((p) => p.id === lead) ?? cur;
  const results = query
    ? pages.flatMap((p) =>
        p.sections.flatMap((s) =>
          s.groups
            .map((g) => ({ page: p, section: s, group: { ...g, rows: g.rows.filter((r) => (rowText(r) + " " + groupText(g) + " " + s.label.toLowerCase()).includes(query)) } }))
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
    <div className="td-settings">
      <div className="td-settings-inner">
        <nav className="td-settings-nav" aria-label="Settings pages">
          <div className="td-settings-search" role="search">
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
              <button type="button" className="td-settings-clear" aria-label="Clear search" onClick={() => setQ("")}>
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
          <div className="td-settings-navlist">
            {[first, ...pages.filter((p) => p.id !== first.id)].map((p) => (
              <div key={p.id} className="td-settings-navpage">
                <div className="td-settings-navhead">{p.title}</div>
                {p.sections.map((s) => (
                  <button key={s.id} type="button" className="td-settings-navrow" aria-current={!query && p.id === cur.id && s.id === sec.id ? "true" : undefined} onClick={() => go(p.id, s.id)}>
                    <span className="td-settings-navicon">
                      <Icon name={s.icon} size={16} />
                    </span>
                    <span className="td-settings-navlabel">{s.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
        <div className="td-settings-main">
          {/* Always mounted (so a changed count is announced) and its own node (Minimal hides the crumb). */}
          <p className="td-sr-only" role="status">
            {results ? `${matched}${results.length ? ". Enter opens the first result" : ""}` : ""}
          </p>
          {results ? (
            <>
              <div>
                <h1 className="td-settings-title">Search</h1>
                <p className="td-settings-crumb">
                  {matched}
                  {results.length ? " · Enter opens the first result" : ""}
                </p>
              </div>
              {results.length ? (
                results.map((x) => <SettingsCard key={`${x.page.id}/${x.section.id}/${x.group.id}`} group={x.group} crumb={{ label: `${x.page.title} › ${x.section.label}`, onOpen: () => openResult(x) }} q={query} />)
              ) : (
                <div className="td-settings-group">
                  <div className="td-settings-empty">No settings match “{q.trim()}”</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                {/* Minimal titles the page with the section's name (the crumb is hidden there); Rounded keeps the page's */}
                <h1 className="td-settings-title">
                  <span className="td-settings-titlepage">{cur.title}</span>
                  {cur.sections.length > 1 ? <span className="td-settings-titlesec">{sec.label}</span> : null}
                </h1>
                {cur.sections.length > 1 ? (
                  <p className="td-settings-crumb">
                    {sec.title ?? sec.label}
                    {sec.hint ? ` · ${sec.hint}` : ""}
                  </p>
                ) : null}
              </div>
              {sec.groups.map((g) => (
                <Fragment key={g.id}>
                  {g.heading ? (
                    <div className="td-settings-subsection">
                      <h2 className="td-settings-subsection-title">{g.heading}</h2>
                      {g.headingNote ? <p className="td-settings-subsection-note">{g.headingNote}</p> : null}
                    </div>
                  ) : null}
                  <SettingsCard group={g} hit={hit} />
                </Fragment>
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
    <span className="td-settings-status" role="status">
      <span className="td-settings-dot" data-on={on ? "true" : undefined} aria-hidden />
      {label}
    </span>
  );
}

export function SettingsLink({ href, label = "Open" }: { href: string; label?: string }) {
  return (
    <a className="td-settings-link" href={href} target="_blank" rel="noreferrer">
      {label}
      <Icon name="external-link" size={14} />
    </a>
  );
}

export function MonoValue({ value }: { value: string }) {
  return (
    <span className="td-settings-mono" title={value}>
      {value}
    </span>
  );
}
