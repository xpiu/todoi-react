// The Mapping page: how todoi-react and the Claude Design project pair up, lane by lane, what moved
// between them lately, and how fresh the tool's picture of each side is (with the means to refresh it).
import { LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, appMoved, designMoved, followJob, fmtTime, plural, projectUrl, REFERENCE_KINDS, store, type AppState, type Comparison, type LaneId, type MappingData, type MappingEvent, type Unit } from "./api";
import { MapLane, type LaneFlow, type LaneStats } from "./MapLane";
import { MergeBanner, useMerge } from "./Merge";
import { ProjectFooter } from "./ProjectFooter";
import { TIP } from "./Tooltip";
import { Select } from "./Select";
import { TopBar } from "./TopBar";

const WAITING = "waiting";

const STEPS: Array<{ name: string; text: string }> = [
  { name: "Snapshot", text: "A pull reads every text file of the Design project through DesignSync into a local snapshot, and stops early when Claude Design hasn't changed." },
  { name: "Pair", text: "Path rules from config.json pair App files with Design files into units, one lane per kind." },
  { name: "Date", text: "Each unit is compared three ways: the App at the sync point's git rev and now, Design in the sync point's snapshot and now." },
  { name: "Move", text: "Token CSS merges deterministically. Everything else is ported by AI from a brief, App work into a worktree, kit work into staging." },
  { name: "Approve", text: "You merge the App branch after its check passes, and tick the exact kit files to upload; uploads are read back." },
  { name: "Mark selected features synced", text: "App HEAD and the newest snapshot become the next sync point. Parts you skip stay open on their old baseline." },
];

const ARROW: Record<string, string> = { "to-design": "→", "from-design": "←", "to-app": "←" };

function stats(units: Unit[]): LaneStats {
  const s: LaneStats = { units, app: 0, design: 0, appChanged: 0, designChanged: 0, toDesign: 0, toApp: 0, both: 0, related: new Set(units.flatMap((u) => u.related ?? [])).size };
  for (const u of units) {
    if (u.app.exists) s.app++;
    if (u.design.exists) s.design++;
    if (u.app.changed) s.appChanged++;
    if (u.design.changed) s.designChanged++;
    if (REFERENCE_KINDS.includes(u.kind)) continue; // reference material never moves
    if (appMoved(u.status)) s.toDesign++;
    if (designMoved(u.status)) s.toApp++;
    if (u.status === "both") s.both++;
  }
  return s;
}

/** What a lane's tracks show: the work waiting now, or one past move */
function flowFor(lane: LaneId, st: LaneStats | null, event: MappingEvent | null): LaneFlow {
  const off = { app: false, design: false };
  if (!event) {
    const out = !!st?.toDesign;
    const inn = !!st?.toApp;
    return { out: { app: out, design: out }, in: { app: inn, design: inn }, outLabel: out ? `${st!.toDesign} → Design` : undefined, inLabel: inn ? `App ← ${st!.toApp}` : undefined, conflicts: st?.both ?? 0, motion: "loop", dim: false };
  }
  const f: LaneFlow = { out: { ...off }, in: { ...off }, conflicts: 0, motion: "once", dim: true };
  for (const m of event.moves) {
    const n = m.lanes[lane];
    if (!n) continue;
    f.dim = false;
    if (m.flow === "to-design") {
      f.out.design = true;
      f.outLabel = `${plural(n, "file")} ${event.open ? "staged" : "uploaded"}`;
    } else if (m.flow === "from-design") {
      f.in.design = true;
      f.inLabel = `${plural(n, "file")} ${event.kind === "import" ? "imported" : "pulled"}`;
    } else {
      f.in.app = true;
      f.inLabel = `${plural(n, "file")} ${event.open ? "to merge" : "merged"}`;
    }
  }
  return f;
}

type Busy = { text: string; progress?: { done: number; total: number } } | null;

export function Mapping() {
  const [state, setState] = useState<AppState | null>(null);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [map, setMap] = useState<MappingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [open, setOpen] = useState<LaneId | null>(null);
  const [shown, setShown] = useState(WAITING);
  const [replay, setReplay] = useState(0);
  const diagram = useRef<HTMLElement>(null);

  // State, mapping and comparison for the plan's chosen sync point; applied in one place so effects never set state synchronously
  const load = useCallback(
    (fresh = false) =>
      api
        .state()
        .then(async (s) => {
          const saved = store.get<string | null>("cds-base", null);
          const base = saved && s.syncPoints.some((p) => p.id === saved) ? saved : (s.syncPoints[0]?.id ?? null);
          const [m, c] = await Promise.all([api.mapping(base), s.snapshots.length ? api.compare(base, fresh) : Promise.resolve(null)]);
          return { s, m, c };
        })
        .then(({ s, m, c }) => {
          setState(s);
          setMap(m);
          setCmp(c);
          setError(null);
        }),
    [],
  );

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);
  const merge = useMerge(state, () => void api.state().then(setState, () => {}), () => void load(true).catch((e: Error) => setError(e.message)));

  /** Run one refresh step at a time, reporting what it's doing; errors land in the banner */
  const step = async (text: string, fn: () => Promise<unknown>) => {
    setBusy({ text });
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(null);
    }
  };
  const pull = async () => {
    const { job } = await api.pull();
    const done = await followJob(job, (j) => setBusy({ text: j.progress ? "Pulling from Claude Design" : "Asking Claude Design what changed…", progress: j.progress }));
    if (done.state === "failed") throw new Error(done.result ?? "The pull failed");
  };
  const recompare = () => step("Recomparing the App with the newest snapshot…", () => load(true));
  const check = () => step("Asking Claude Design whether the project changed…", async () => {
    await api.statusCheck();
    await load();
  });
  const pullNow = () => step("Pulling from Claude Design…", async () => {
    await pull();
    await load(true);
  });
  /** Everything at once: ask Design, pull when the snapshot is behind or incomplete, recompare */
  const bringUpToDate = async () => {
    setError(null);
    try {
      const snap = state?.snapshots[0];
      let needPull = !snap || !!snap.unpulled || (!!snap.projectId && snap.projectId !== state?.project.id);
      if (!needPull) {
        setBusy({ text: "Asking Claude Design whether the project changed…" });
        needPull = (await api.statusCheck()).stale;
      }
      if (needPull) {
        setBusy({ text: "Pulling from Claude Design…" });
        await pull();
      }
      setBusy({ text: "Recomparing the App with the newest snapshot…" });
      await load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const byLane = useMemo(() => {
    const out = new Map<LaneId, LaneStats>();
    if (!cmp) return out;
    const groups = new Map<LaneId, Unit[]>();
    for (const u of cmp.units) {
      const units = groups.get(u.kind) ?? [];
      units.push(u);
      groups.set(u.kind, units);
    }
    for (const [k, units] of groups) out.set(k, stats(units));
    return out;
  }, [cmp]);

  const titles = useMemo(() => new Map((map?.lanes ?? []).map((l) => [l.id, l.title])), [map]);
  const event = shown === WAITING ? null : (map?.history.find((e) => e.id === shown) ?? null);
  const showEvent = (id: string) => {
    setShown(id);
    setReplay((r) => r + 1);
    diagram.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const snap = cmp?.designSnapshot ?? state?.snapshots[0] ?? null;
  const base = cmp?.base ?? null;
  const unpulled = snap?.unpulled ? snap.unpulled.carried.length + snap.unpulled.missing.length : 0;
  const otherProject = !!snap?.projectId && !!state && snap.projectId !== state.project.id;
  const last = map?.lastCheck ?? null;
  const headMoved = !!cmp && !!state && cmp.appHead !== state.appHead;
  const running = !!state?.jobs.some((j) => j.state === "running");
  const all = [...byLane.values()].reduce((a, s) => ({ units: a.units + s.units.length, waiting: a.waiting + s.toApp + s.toDesign - s.both, both: a.both + s.both }), { units: 0, waiting: 0, both: 0 });

  // Each side's data, with what is missing or behind, and the one action that fixes it
  const design: Freshness = !snap
    ? { ok: false, text: "No snapshot yet, so the Design side has nothing to compare.", fix: { label: "Pull now", tip: TIP.pull, run: () => void pullNow().catch(() => {}) } }
    : otherProject
      ? { ok: false, text: "The newest snapshot came from another project.", fix: { label: "Pull now", tip: "Pull a snapshot of the project the tool targets now - Costs tokens", run: () => void pullNow().catch(() => {}) } }
      : unpulled
        ? { ok: false, text: `${plural(unpulled, "file")} couldn't be pulled.`, fix: { label: "Pull again", tip: TIP.pullAgain, run: () => void pullNow().catch(() => {}) } }
        : !last
          ? { ok: null, text: "Not asked whether it changed since the tool started.", fix: { label: "Check for changes", tip: TIP.check, run: () => void check().catch(() => {}) } }
          : last.stale
            ? { ok: false, text: `Changed since the snapshot (asked ${fmtTime(last.at)}).`, fix: { label: "Pull now", tip: "Pull the changes into a fresh snapshot with Claude Code. Takes a few minutes - Costs tokens", run: () => void pullNow().catch(() => {}) } }
            : { ok: true, text: `Up to date when asked, ${fmtTime(last.at)}.`, fix: { label: "Check again", tip: TIP.check, run: () => void check().catch(() => {}) } };
  const app: Freshness = !cmp
    ? { ok: null, text: "Not compared yet." }
    : headMoved
      ? { ok: false, text: `HEAD moved to @${state?.appHead} since the comparison.`, fix: { label: "Recompare", tip: TIP.recompare, run: () => void recompare().catch(() => {}) } }
      : { ok: true, text: `Compared ${fmtTime(cmp.generatedAt)}${state?.dirty ? ", uncommitted changes included" : ""}.`, fix: { label: "Recompare", tip: TIP.recompare, run: () => void recompare().catch(() => {}) } };
  const behind = design.ok === false || app.ok === false || design.ok === null;

  const verdict = !map ? null : !cmp ? (
    <>No Design snapshot yet, so only the rules can be shown. Bring the mapping up to date to pull one.</>
  ) : (
    <>
      {state?.project.name} and todoi-react pair up as <em>{plural(all.units, "unit")}</em> in {map.lanes.filter((l) => byLane.has(l.id)).length} lanes; <em>{all.waiting}</em> {all.waiting === 1 ? "is" : "are"} waiting to move
      {all.both ? (
        <>
          , <em className="is-both">{all.both}</em> changed on both sides
        </>
      ) : null}
      .
    </>
  );

  return (
    <div className="cds cds-map">
      <a className="cds-skip" href="#diagram" data-tip="Jump past the summary to the lane diagram">
        Skip to the diagram
      </a>
      <TopBar state={state} page="mapping" merge={merge} />
      <main className="cds-main">
        {error ? (
          <p className="cds-error" role="alert">
            {error}
          </p>
        ) : null}
        <MergeBanner offer={merge} />

        <section className="cds-verdict cds-map-top" aria-labelledby="map-h">
          <p className="cds-map-kicker" id="map-h">
            Mapping
          </p>
          <h2 className="cds-verdict-line">{verdict ?? <span className="cds-skel cds-skel-line" />}</h2>
          <div className="cds-map-refresh">
            <button type="button" className={`cds-btn ${behind ? "cds-btn-primary" : ""}`} onClick={() => void bringUpToDate()} disabled={!!busy || running} data-tip={running ? "A job is running. Refresh when it finishes" : "Ask Claude Design what changed, pull when the snapshot is behind or incomplete, then recompare the App - Costs tokens"}>
              {busy ? <LoaderCircle size={14} className="cds-spin" aria-hidden /> : <RefreshCw size={14} strokeWidth={1.75} aria-hidden />} Bring the mapping up to date
            </button>
            <span className="cds-quiet" role="status">
              {busy ? `${busy.text}${busy.progress ? ` ${busy.progress.done}/${busy.progress.total} files` : ""}` : running ? "A job is running; refresh when it finishes." : behind ? "Some of this is behind or missing." : "Both sides are current."}
            </span>
          </div>
          {busy?.progress ? (
            <div className="cds-progress" role="progressbar" aria-label="Pull progress" aria-valuemin={0} aria-valuemax={busy.progress.total} aria-valuenow={busy.progress.done}>
              <span style={{ transform: `scaleX(${busy.progress.done / Math.max(1, busy.progress.total)})` }} />
            </div>
          ) : null}

          <dl className="cds-map-meta">
            <div>
              <dt>Project</dt>
              <dd>
                <span className="cds-map-meta-main">{state?.project.name ?? "…"}</span>
                {state ? (
                  <a className="cds-path cds-break" href={projectUrl(state.project.id)} target="_blank" rel="noreferrer" data-tip={TIP.project}>
                    {projectUrl(state.project.id).replace(/^https:\/\//, "")}
                  </a>
                ) : null}
                <span className="cds-quiet">Every pull and upload goes here. Change it in the footer.</span>
              </dd>
            </div>
            <div>
              <dt>App</dt>
              <dd>
                <span className="cds-map-meta-main">todoi-react</span>
                <span className="cds-path cds-break">
                  {map?.app.branch ?? "detached"} @{cmp?.appHead ?? state?.appHead}
                  {state?.dirty ? " · uncommitted changes" : ""}
                </span>
                <Fresh {...app} />
              </dd>
            </div>
            <div>
              <dt>Design</dt>
              <dd>
                <span className="cds-map-meta-main">{snap ? snap.label : "No snapshot"}</span>
                {snap ? (
                  <span className="cds-path">
                    {snap.fileCount} files · {snap.source} · {fmtTime(snap.createdAt)}
                  </span>
                ) : null}
                <Fresh {...design} />
              </dd>
            </div>
            <div>
              <dt>Sync point</dt>
              <dd>
                <span className="cds-map-meta-main">{base ? base.label : "None yet"}</span>
                {base ? (
                  <span className="cds-path">
                    App @{base.rev} · {fmtTime(base.createdAt)}
                  </span>
                ) : null}
                <span className="cds-quiet">{base ? `${plural(map?.app.commitsSinceBase ?? 0, "App commit")} since.${base.held ? ` ${plural(Object.keys(base.held).length, "part")} kept open.` : ""}` : "Changes can't be dated until you mark a sync point on the plan."}</span>
              </dd>
            </div>
          </dl>

          <div className="cds-map-technique">
            <h3>Mapping technique</h3>
            <ol>
              {STEPS.map((s, i) => (
                <li key={s.name}>
                  <span className="cds-map-step-n">{i + 1}</span>
                  <span className="cds-map-step-name">{s.name}</span>
                  <span className="cds-quiet">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="diagram" className="cds-map-diagram" ref={diagram} aria-labelledby="diagram-h">
          <div className="cds-map-diagram-head">
            <h3 id="diagram-h">How each lane maps</h3>
            <label className="cds-since">
              <span>Show</span>
              <Select value={shown} onChange={(e) => showEvent(e.target.value)} aria-label="What the diagram shows" data-tip="Play the work waiting now, or replay a past pull, upload or merge">
                <option value={WAITING}>Work waiting now{base ? ` (since ${base.label})` : ""}</option>
                {map?.history
                  .filter((e) => e.moves.length)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} · {fmtTime(e.at)}
                    </option>
                  ))}
              </Select>
            </label>
            {event ? (
              <button type="button" className="cds-link" data-tip="Play this move through the lanes again" onClick={() => setReplay((r) => r + 1)}>
                <RotateCcw size={12} strokeWidth={1.75} aria-hidden /> Replay
              </button>
            ) : null}
          </div>
          <p className="cds-quiet cds-map-legend">
            {event ? `${event.title}, ${fmtTime(event.at)}: ${event.detail}. Lanes it didn't touch are dimmed.` : "The middle column is the tool: top tracks carry App work into Design, bottom tracks carry Design work into the App. A moving track has work waiting; select a lane for its rules and units."}
          </p>
          <div className="cds-heads">
            <div className="cds-head">
              <span className="cds-head-name">todoi-react</span>
              <span className="cds-head-meta">{state?.repo}</span>
            </div>
            <div className="cds-head cds-head-rail">the tool</div>
            <div className="cds-head">
              <span className="cds-head-name">Claude Design</span>
              <span className="cds-head-meta">{state?.project.name}</span>
            </div>
          </div>
          <div className="cds-ledger" aria-busy={!map}>
            {map
              ? map.lanes.map((rule) => (
                  <MapLane
                    key={rule.id}
                    rule={rule}
                    stats={byLane.get(rule.id) ?? (cmp && !rule.reference ? stats([]) : null)}
                    flow={flowFor(rule.id, byLane.get(rule.id) ?? null, event)}
                    flowKey={`${shown}:${replay}`}
                    open={open === rule.id}
                    onToggle={() => setOpen((o) => (o === rule.id ? null : rule.id))}
                    events={map.history.filter((e) => e.moves.some((m) => m.lanes[rule.id]))}
                    onShowEvent={showEvent}
                  />
                ))
              : [0, 1, 2, 3].map((i) => (
                  <div key={i} className="cds-row cds-row-skel">
                    <span className="cds-skel" />
                    <span className="cds-skel" />
                  </div>
                ))}
          </div>
        </section>

        <section className="cds-map-history" aria-labelledby="history-h">
          <h3 id="history-h">Recent imports and exports</h3>
          {map?.history.length ? (
            <ol className="cds-map-events">
              {map.history.map((e) => {
                const toApp = e.moves.filter((m) => m.flow === "to-app");
                const toDesign = e.moves.filter((m) => m.flow !== "to-app");
                return (
                  <li key={e.id} className="cds-map-event" data-open={e.open || undefined} aria-current={shown === e.id || undefined}>
                    <div className="cds-map-event-head">
                      <span className="cds-sub">{e.title}</span>
                      <span className="cds-quiet">{e.detail}</span>
                      <span className="cds-map-event-actions">
                        {e.moves.length ? (
                          <button type="button" className="cds-link" aria-pressed={shown === e.id} data-tip={TIP.showOnDiagram} onClick={() => showEvent(e.id)}>
                            Show on the diagram
                          </button>
                        ) : null}
                        {e.jobId ? (
                          <a className="cds-link" href={`/?job=${encodeURIComponent(e.jobId)}`} data-tip={e.open ? "Open this run in Activity to merge, upload or discard what it left waiting" : "Open this job's full log in Activity"}>
                            {e.open ? "Review in Activity" : "Log"}
                          </a>
                        ) : null}
                      </span>
                    </div>
                    <div className="cds-twin">
                      <div className="cds-cell">{toApp.length ? <Files moves={toApp} titles={titles} /> : <span className="cds-quiet">—</span>}</div>
                      <div className="cds-rail-cell cds-map-event-mid">
                        <span className="cds-map-event-arrow" aria-hidden>
                          {e.moves.length ? [...new Set(e.moves.map((m) => ARROW[m.flow]))].join(" ") : "·"}
                        </span>
                        <span className="cds-mono">{fmtTime(e.at)}</span>
                      </div>
                      <div className="cds-cell">{toDesign.length ? <Files moves={toDesign} titles={titles} /> : <span className="cds-quiet">—</span>}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="cds-quiet">{map ? "Nothing has moved yet. Pulls, uploads, merges and sync points appear here." : ""}</p>
          )}
        </section>
      </main>
      {state ? <ProjectFooter state={state} onChanged={() => void load(true).catch((e: Error) => setError(e.message))} /> : null}
    </div>
  );
}

/** One side's data: current, behind or unknown, and the one action that fixes it */
type Freshness = { ok: boolean | null; text: string; fix?: { label: string; tip: string; run: () => void } };

function Fresh({ ok, text, fix }: Freshness) {
  return (
    <span className="cds-map-fresh" data-ok={ok === null ? "unknown" : String(ok)}>
      <span className="cds-map-fresh-mark" aria-hidden />
      <span>{text}</span>
      {fix ? (
        <button type="button" className="cds-link" onClick={fix.run} data-tip={fix.tip}>
          {fix.label}
        </button>
      ) : null}
    </span>
  );
}

function Files({ moves, titles }: { moves: MappingEvent["moves"]; titles: Map<LaneId, string> }) {
  return (
    <ul className="cds-map-files">
      {moves.map((m) => {
        const total = Object.values(m.lanes).reduce((a, n) => a + (n ?? 0), 0);
        return (
          <li key={m.flow}>
            <span>
              {plural(total, "file")}: {Object.entries(m.lanes).map(([lane, n]) => `${titles.get(lane as LaneId) ?? lane} ${n}`).join(" · ")}
            </span>
            <span className="cds-path cds-map-files-list" data-tip={m.files.join("\n")}>
              {m.files.slice(0, 3).join(", ")}
              {total > 3 ? ` +${total - 3} more` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
