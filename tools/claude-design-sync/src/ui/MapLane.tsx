// One lane of the mapping diagram: the App's files on the left, Design's on the right, and the rail
// between them, which stands for the tool. Its two tracks carry work App → Design (top) and
// Design → App (bottom); a track's halves light up for the part of the trip a move made.
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { displayName, plural, STATUS_WORD, type LaneRule, type MappingEvent, type Technique, type Unit, type UnitStatus } from "./api";

/** Which halves of a track are lit: App ↔ the tool, the tool ↔ Design */
export interface Seg {
  app: boolean;
  design: boolean;
}

export interface LaneFlow {
  /** App → Design */
  out: Seg;
  /** Design → App */
  in: Seg;
  outLabel?: string;
  inLabel?: string;
  /** Units changed on both sides (waiting view only) */
  conflicts: number;
  /** "loop" reports work still waiting; "once" replays a past move */
  motion: "loop" | "once";
  /** The shown event didn't touch this lane */
  dim: boolean;
}

export interface LaneStats {
  units: Unit[];
  app: number;
  design: number;
  appChanged: number;
  designChanged: number;
  toDesign: number;
  toApp: number;
  both: number;
}

const FILTERS: Array<{ id: string; label: string; test: (u: Unit) => boolean }> = [
  { id: "moving", label: "Changed", test: (u) => u.status !== "in-sync" },
  { id: "all", label: "All", test: () => true },
  { id: "sync", label: "In sync", test: (u) => u.status === "in-sync" },
  { id: "one", label: "One side only", test: (u) => !u.app.exists || !u.design.exists },
];
const SHOWN = 40;

function Track({ seg, dir, label, motion }: { seg: Seg; dir: "out" | "in"; label?: string; motion: LaneFlow["motion"] }) {
  const on = seg.app || seg.design;
  return (
    <span className={`cds-map-track is-${dir}`} data-on={on || undefined} data-motion={motion}>
      {dir === "out" && label ? <span className="cds-map-count is-out">{label}</span> : null}
      <span className="cds-map-line">
        <span className="cds-map-seg" data-on={seg.app || undefined} />
        <span className="cds-map-node" />
        <span className="cds-map-seg" data-on={seg.design || undefined} />
      </span>
      {dir === "in" && label ? <span className="cds-map-count is-in">{label}</span> : null}
    </span>
  );
}

function Side({ rule, side, stats }: { rule: LaneRule; side: "app" | "design"; stats: LaneStats | null }) {
  const where = rule[side];
  const n = stats ? stats[side] : 0;
  const changed = stats ? (side === "app" ? stats.appChanged : stats.designChanged) : 0;
  return (
    <div className={`cds-cell cds-map-side ${where ? "" : "is-quiet"}`}>
      {where ? <span className="cds-path cds-break">{where}</span> : <span>Nothing in the {side === "app" ? "App" : "Design project"}</span>}
      {stats && where ? (
        <span className="cds-map-tally">
          {plural(n, "unit")}
          {changed ? ` · ${changed} changed since the sync point` : ""}
        </span>
      ) : null}
    </div>
  );
}

function TechniqueLine({ t, into }: { t: Technique | null; into: string }) {
  return (
    <div className="cds-map-tech-line">
      <span className="cds-map-tech-into">Into {into}</span>
      {t ? (
        <>
          <span className="cds-map-tech-name">{t.label}</span>
          <span className="cds-quiet">{t.detail}</span>
        </>
      ) : (
        <span className="cds-quiet">Never moves this way.</span>
      )}
    </div>
  );
}

export function MapLane({ rule, stats, flow, flowKey, open, onToggle, events, onShowEvent }: { rule: LaneRule; stats: LaneStats | null; flow: LaneFlow; flowKey: string; open: boolean; onToggle: () => void; events: MappingEvent[]; onShowEvent: (id: string) => void }) {
  const [filter, setFilter] = useState("moving");
  const [all, setAll] = useState(false);
  const units = stats?.units ?? [];
  const f = FILTERS.find((x) => x.id === filter)!;
  const list = units.filter(f.test);
  const panelId = `lane-${rule.id}`;
  const technique = rule.reference ? (rule.id === "other" ? "Not mapped" : "Reference only") : rule.toApp?.id === "merge-css" ? "CSS merge" : "AI port";
  const waiting = stats ? stats.toApp + stats.toDesign - stats.both : 0;

  return (
    <section className="cds-row cds-map-lane" data-dim={flow.dim || undefined} data-open={open || undefined} aria-labelledby={`${panelId}-h`}>
      <div className="cds-row-head">
        <button type="button" id={`${panelId}-h`} className="cds-row-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          <ChevronRight size={14} strokeWidth={1.75} className="cds-chev" aria-hidden />
          <span className="cds-row-title">{rule.title}</span>
        </button>
        <span className="cds-status" data-status={stats?.both ? "both" : waiting ? "app-ahead" : undefined}>
          {!stats ? (rule.reference ? "" : "no snapshot to compare") : rule.reference ? (stats.designChanged ? `${stats.designChanged} changed in Design, not ported` : "") : stats.both ? `${stats.both} changed on both` : waiting ? `${waiting} waiting to move` : units.length ? "in sync" : ""}
        </span>
        <span className="cds-count">{stats ? plural(units.length, "unit") : ""}</span>
      </div>
      <div className="cds-twin">
        <Side rule={rule} side="app" stats={stats} />
        <div className="cds-rail-cell cds-map-rail" key={flowKey}>
          <Track seg={flow.out} dir="out" label={flow.outLabel} motion={flow.motion} />
          <button type="button" className="cds-map-tech" data-kind={rule.reference ? "reference" : rule.toApp?.id} aria-expanded={open} aria-controls={panelId} onClick={onToggle} title={rule.match}>
            {flow.conflicts ? <span className="cds-map-conflict" aria-label={`${flow.conflicts} changed on both sides`} /> : null}
            {technique}
          </button>
          <Track seg={flow.in} dir="in" label={flow.inLabel} motion={flow.motion} />
        </div>
        <Side rule={rule} side="design" stats={stats} />
      </div>
      {open ? (
        <div id={panelId} className="cds-map-detail">
          <div className="cds-twin cds-map-how">
            <TechniqueLine t={rule.toApp} into="the App" />
            <div className="cds-rail-cell cds-map-match">
              <span className="cds-map-tech-into">Paired by</span>
              <span>{rule.match}</span>
            </div>
            <TechniqueLine t={rule.toDesign} into="Design" />
          </div>
          {rule.notes?.length ? (
            <ul className="cds-map-notes">
              {rule.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {rule.pairs?.length ? (
            <div className="cds-map-block">
              <h4>Pinned in config.json</h4>
              <ul className="cds-map-pairs">
                {rule.pairs.map((p) => (
                  <li key={`${p.app}|${p.design}`} className="cds-twin">
                    <span className="cds-path cds-break">{p.app}</span>
                    <span className="cds-rail-cell cds-quiet">{p.name ?? "⇄"}</span>
                    <span className="cds-path cds-break">{p.design}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {units.length ? (
            <div className="cds-map-block">
              <div className="cds-map-block-head">
                <h4>Units</h4>
                <div className="cds-map-filters" role="group" aria-label={`Filter ${rule.title.toLowerCase()} units`}>
                  {FILTERS.map((x) => (
                    <button key={x.id} type="button" className="cds-map-filter" aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>
                      {x.label} <span className="cds-mono">{units.filter(x.test).length}</span>
                    </button>
                  ))}
                </div>
              </div>
              {list.length ? (
                <ul className="cds-map-units">
                  {(all ? list : list.slice(0, SHOWN)).map((u) => (
                    <li key={u.id} className="cds-twin">
                      <span className="cds-map-unit-side">
                        <span className="cds-sub">{displayName(u)}</span>
                        <span className="cds-path cds-break">{u.app.paths.join(", ") || "—"}</span>
                      </span>
                      <span className="cds-rail-cell">
                        <span className="cds-status" data-status={u.status}>
                          {STATUS_WORD[u.status as UnitStatus]}
                        </span>
                      </span>
                      <span className="cds-map-unit-side">
                        <span className="cds-path cds-break">{u.design.paths.join(", ") || "—"}</span>
                        {u.heldFrom ? <span className="cds-quiet">kept open since {u.heldFrom.label}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cds-quiet cds-map-none">No {f.label.toLowerCase()} units in this lane.</p>
              )}
              {!all && list.length > SHOWN ? (
                <button type="button" className="cds-link" onClick={() => setAll(true)}>
                  Show all {list.length}
                </button>
              ) : null}
            </div>
          ) : null}
          {events.length ? (
            <div className="cds-map-block">
              <h4>Recent moves through this lane</h4>
              <ul className="cds-map-lane-events">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="cds-mono">{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span>{e.title}</span>
                    <span className="cds-quiet">{plural(e.moves.reduce((n, m) => n + (m.lanes[rule.id] ?? 0), 0), "file")}</span>
                    <button type="button" className="cds-link" onClick={() => onShowEvent(e.id)}>
                      Show on the diagram
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
