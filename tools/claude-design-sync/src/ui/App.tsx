// The sync plan: verdict + direction, the ledger of features, the plan bar, and the activity panel.
import { ArrowLeft, ArrowLeftRight, ArrowRight, History, LoaderCircle, PanelRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Activity } from "./Activity";
import { api, selectedUnitIds, appMoved, designMoved, store, DIRECTION_HINT, DIRECTION_LABEL, DIRECTION_SUB, effective, fmtTime, plural, type AppState, type Comparison, type Direction, type Step } from "./api";
import { FeatureRow } from "./FeatureRow";
import { MergeBanner, useMerge } from "./Merge";
import { Onboarding } from "./Onboarding";
import { PlanBar } from "./PlanBar";
import { ProjectFooter } from "./ProjectFooter";
import { TIP } from "./Tooltip";
import { TopBar } from "./TopBar";

// Each option draws its route: App box, arrow, Design box, with the receiving side filled
const GLOBALS: Array<{ d: Direction; Icon: typeof ArrowLeft; into: { app: boolean; design: boolean } }> = [
  { d: "design-to-app", Icon: ArrowLeft, into: { app: true, design: false } },
  { d: "both", Icon: ArrowLeftRight, into: { app: true, design: true } },
  { d: "app-to-design", Icon: ArrowRight, into: { app: false, design: true } },
];
// The empty ledger speaks to the planned direction, and offers the action that would surface new work for it
const EMPTY: Partial<Record<Direction, { line: string; action: "check" | "recompare" }>> = {
  both: { line: "Nothing to move either way. When either side changes, pull a fresh Design snapshot or recompare.", action: "check" },
  "design-to-app": { line: "Nothing to bring into the App. When the kit changes in Claude Design, pull a fresh snapshot.", action: "check" },
  "app-to-design": { line: "Nothing to put into Design. When the App changes, recompare to pick up the new work.", action: "recompare" },
};

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string | null>(() => store.get<string | null>("cds-base", null));
  const [global, setGlobal] = useState<Direction>(() => store.get<Direction>("cds-global", "both"));
  const [overrides, setOverrides] = useState<Record<string, Direction>>(() => store.get("cds-overrides", {}));
  const [unitOverrides, setUnitOverrides] = useState<Record<string, Direction>>(() => store.get("cds-unit-overrides", {}));
  const [steps, setSteps] = useState<Step[]>([]);
  const [unitChoices, setUnitChoices] = useState<Record<string, Direction>>({});
  // /?job=<id> (linked from the Mapping page) opens that job in the activity panel
  const [activity, setActivity] = useState<string | null>(() => new URLSearchParams(location.search).get("job"));
  const [panel, setPanel] = useState(() => !!new URLSearchParams(location.search).get("job"));
  const [loading, setLoading] = useState(true);
  const [runFeatureId, setRunFeatureId] = useState<string | null>(null);
  const [startingRun, setStartingRun] = useState(false);
  const runPending = useRef(false);
  const [markUnits, setMarkUnits] = useState<string[] | null>(null);
  const [showSynced, setShowSynced] = useState(false);
  const [check, setCheck] = useState<{ busy: boolean; stale?: boolean; error?: string } | null>(null);

  // State + comparison for a sync point; applied in one place so effects never set state synchronously
  const load = useCallback(
    (fresh = false) =>
      api
        .state()
        .then(async (s) => {
          const b = baseId && s.syncPoints.some((p) => p.id === baseId) ? baseId : (s.syncPoints[0]?.id ?? null);
          return { s, b, c: s.snapshots.length ? await api.compare(b, fresh) : null };
        })
        .then(
          ({ s, b, c }) => {
            setState(s);
            if (b !== baseId) setBaseId(b);
            setCmp(c);
            setError(null);
            setLoading(false);
          },
          (e: Error) => {
            setError(e.message);
            setLoading(false);
          },
        ),
    [baseId],
  );

  useEffect(() => {
    void load();
  }, [load]);
  const refresh = (fresh = false) => {
    setLoading(true);
    // a pull, upload or new target makes the last "Check for changes" answer stale
    setCheck(null);
    void load(fresh);
  };
  // a finished job only needs the job list again; a merge moves the App, so it recompares
  const merge = useMerge(state, () => void api.state().then(setState, () => {}), () => refresh(true));
  useEffect(() => store.set("cds-base", baseId), [baseId]);
  useEffect(() => store.set("cds-global", global), [global]);
  useEffect(() => store.set("cds-overrides", overrides), [overrides]);
  useEffect(() => store.set("cds-unit-overrides", unitOverrides), [unitOverrides]);

  // the plan follows every decision
  useEffect(() => {
    if (!cmp) return;
    let live = true;
    api.plan(cmp.base?.id ?? null, global, overrides, unitOverrides).then(
      (r) => {
        if (!live) return;
        setSteps(r.steps);
        setUnitChoices(r.units);
      },
      (e) => live && setError((e as Error).message),
    );
    return () => {
      live = false;
    };
  }, [cmp, global, overrides, unitOverrides]);

  const features = useMemo(() => cmp?.features ?? [], [cmp]);
  const visibleSteps = cmp ? steps : [];
  const tally = useMemo(() => {
    const t = { app: 0, design: 0, both: 0 };
    for (const f of features) {
      if (f.status === "both") t.both++;
      else if (appMoved(f.status)) t.app++;
      else if (designMoved(f.status)) t.design++;
    }
    return t;
  }, [features]);

  // Available features, independent of plan choices; reference-only work has no one-way direction.
  const available = useMemo(() => ({
    "design-to-app": features.filter((f) => f.directions.includes("design-to-app")).length,
    "app-to-design": features.filter((f) => f.directions.includes("app-to-design")).length,
  }), [features]);

  const openJob = (id: string) => {
    setActivity(id);
    setPanel(true);
    // the new job joins the list at once: the bar shows it live and Merge greys in while App work ports
    return api.state().then(setState, () => {});
  };
  const run = async (only?: string[]) => {
    if (runPending.current) return;
    runPending.current = true;
    setStartingRun(true);
    try {
      const r = await api.run(cmp?.base?.id ?? null, global, overrides, unitOverrides, only);
      await openJob(r.job);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      runPending.current = false;
      setStartingRun(false);
    }
  };
  const checkDesign = async () => {
    setCheck({ busy: true });
    try {
      const r = await api.statusCheck();
      setCheck({ busy: false, stale: r.stale });
    } catch (e) {
      setCheck({ busy: false, error: (e as Error).message });
    }
  };
  const pull = async () => {
    try {
      const r = await api.pull();
      openJob(r.job);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const base = cmp?.base ?? null;
  const snap = cmp?.designSnapshot ?? state?.snapshots[0] ?? null;
  const unpulled = snap?.unpulled ? [...snap.unpulled.carried, ...snap.unpulled.missing] : [];
  // the newest snapshot came from a project the tool no longer targets
  const otherProject = !!snap?.projectId && !!state && snap.projectId !== state.project.id;
  const running = state?.jobs.find((j) => j.state === "running" || j.state === "awaiting-approval");
  const synced = cmp?.units.filter((u) => u.status === "in-sync").length ?? 0;

  return (
    <div className={`cds ${panel ? "has-panel" : ""}`}>
      <a className="cds-skip" href="#ledger" data-tip="Jump past the toolbar to the list of features">Skip to the features</a>
      <TopBar state={state} page="plan" merge={merge}>
        {state?.syncPoints.length ? (
          <label className="cds-since">
            <History size={14} strokeWidth={1.75} aria-hidden />
            <span>Since</span>
            <select value={baseId ?? ""} onChange={(e) => setBaseId(e.target.value || null)} aria-label="Compare since sync point" data-tip="The sync point to compare from: only changes made after it count">
              {state.syncPoints.map((p) => (
                <option key={p.id} value={p.id} title={`${p.label} — App @${p.rev}, ${fmtTime(p.createdAt)}`}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="cds-tool" onClick={() => refresh(true)} disabled={loading} data-tip={TIP.recompare} aria-label="Recompare">
          {loading ? <LoaderCircle size={14} className="cds-spin" aria-hidden /> : <RefreshCw size={14} strokeWidth={1.75} aria-hidden />} <span className="cds-tool-label">Recompare</span>
        </button>
        <button type="button" className={`cds-tool ${running ? "is-live" : ""}`} aria-pressed={panel} aria-label="Activity" data-tip={panel ? "Hide the activity panel" : running ? "A job is running: show its live log" : "Show pulls, runs and uploads with their logs, and anything waiting for your approval"} onClick={() => setPanel((p) => !p)}>
          <PanelRight size={14} strokeWidth={1.75} aria-hidden /> <span className="cds-tool-label">Activity</span>{running ? <span className="cds-live" aria-label="A job is running" /> : null}
        </button>
      </TopBar>

      <main className="cds-main">
        {error ? (
          <p className="cds-error" role="alert">
            {error}
          </p>
        ) : null}
        <MergeBanner offer={merge} onReview={openJob} />

        {state && !state.snapshots.length ? (
          <Onboarding state={state} onPull={pull} onImported={() => refresh(true)} />
        ) : (
          <>
            <section className="cds-verdict" aria-labelledby="verdict">
              <h2 id="verdict" className="cds-verdict-line">
                {!cmp ? (
                  <span className="cds-skel cds-skel-line" />
                ) : !base ? (
                  <>No sync point yet, so drift can't be dated. Everything that differs is listed.</>
                ) : features.length === 0 ? (
                  <>Both sides match since {base.label}.</>
                ) : (
                  <>
                    Since {base.label}: <em>{plural(tally.app, "feature")}</em> changed only in the App, <em>{tally.design}</em> only in Design
                    {tally.both ? (
                      <>
                        , <em className="is-both">{tally.both}</em> on both sides
                      </>
                    ) : null}
                    .
                  </>
                )}
              </h2>
              <div className="cds-direction">
                <span className="cds-direction-label" id="dir-l">
                  Plan every feature
                </span>
                <div className="cds-global" role="radiogroup" aria-labelledby="dir-l">
                  {GLOBALS.map(({ d, Icon, into }) => {
                    const count = d === "design-to-app" || d === "app-to-design" ? available[d] : null;
                    const countLabel = count !== null && cmp ? `${plural(count, "changed feature")} available` : null;
                    return (
                      <button key={d} type="button" role="radio" aria-checked={global === d} className="cds-global-opt" onClick={() => setGlobal(d)} data-tip={`${DIRECTION_HINT[d]}.${countLabel ? ` ${countLabel}, including features changed on both sides. Counts are independent of overrides.` : ""} Features and parts you set by hand keep their own direction`}>
                        <span className="cds-route" aria-hidden>
                          <span className={`cds-route-end ${into.app ? "is-into" : ""}`}>App</span>
                          <Icon size={14} strokeWidth={2} className="cds-route-arrow" />
                          <span className={`cds-route-end ${into.design ? "is-into" : ""}`}>Design</span>
                        </span>
                        <span className="cds-global-name">
                          {DIRECTION_LABEL[d]}
                          {count !== null ? <span className="cds-global-count" aria-label={countLabel ?? "Comparing changes"}>{cmp ? count : "—"}</span> : null}
                        </span>
                        <span className="cds-global-hint">{DIRECTION_SUB[d]}</span>
                      </button>
                    );
                  })}
                </div>
                {Object.keys(overrides).length + Object.keys(unitOverrides).length ? (
                  <button
                    type="button"
                    className="cds-link"
                    data-tip="Drop every direction set by hand, so all features follow the plan again"
                    onClick={() => {
                      setOverrides({});
                      setUnitOverrides({});
                    }}
                  >
                    Clear {plural(Object.keys(overrides).length + Object.keys(unitOverrides).length, "override")}
                  </button>
                ) : null}
              </div>
            </section>

            <div className="cds-heads">
              <div className="cds-head">
                <span className="cds-head-name">App</span>
                <span className="cds-head-meta">
                  todoi-react @{cmp?.appHead ?? state?.appHead}
                  {state?.dirty ? " · uncommitted changes" : ""}
                </span>
              </div>
              <div className="cds-head cds-head-rail" aria-hidden>direction</div>
              <div className="cds-head">
                <span className="cds-head-name">Design</span>
                <span className="cds-head-meta">
                  {state?.project.name} · {snap ? `${snap.label}, ${fmtTime(snap.createdAt)}` : "no snapshot"}
                  {otherProject ? (
                    <span className="cds-head-warn" data-tip={`This snapshot was pulled from project ${snap?.projectId}, not ${state?.project.id}`}>
                      {" "}· from another project
                    </span>
                  ) : null}
                  {unpulled.length ? (
                    <span className="cds-head-warn" data-tip={`Not pulled:\n${unpulled.join("\n")}${snap?.unpulled?.from ? `\nKept as in ${snap.unpulled.from}` : ""}`}>
                      {" "}· {plural(unpulled.length, "file")} not pulled
                    </span>
                  ) : null}
                </span>
                <span className="cds-head-actions">
                  <button type="button" className="cds-link" onClick={checkDesign} disabled={check?.busy} data-tip={check?.stale ? "Claude Design changed since the snapshot. Ask again, or pull to bring the changes in" : check && !check.busy && !check.error ? "Nothing changed when last asked. Ask Claude Design again" : TIP.check}>
                    {check?.busy ? "Checking…" : check?.stale ? "Design changed — pull" : check && !check.error ? "Up to date" : "Check for changes"}
                  </button>
                  {check?.stale || check?.error || unpulled.length || otherProject ? (
                    <button type="button" className="cds-link" onClick={pull} data-tip={unpulled.length && !check?.stale ? TIP.pullAgain : TIP.pull}>
                      {unpulled.length && !check?.stale ? "Pull again" : "Pull now"}
                    </button>
                  ) : null}
                </span>
              </div>
            </div>
            {check?.error ? <p className="cds-error">{check.error}</p> : null}

            <div id="ledger" className="cds-ledger" aria-busy={loading}>
              {loading && !cmp
                ? [0, 1, 2, 3].map((i) => <div key={i} className="cds-row cds-row-skel"><span className="cds-skel" /><span className="cds-skel" /></div>)
                : features.map((f) => {
                    const d = effective(f, global, overrides[f.id]);
                    return (
                      <FeatureRow
                        key={f.id}
                        feature={f}
                        direction={d}
                        overridden={f.id in overrides}
                        onDirection={(nd) =>
                          setOverrides((o) => {
                            const n = { ...o };
                            if (nd === null || nd === effective(f, global)) delete n[f.id];
                            else n[f.id] = nd;
                            return n;
                          })
                        }
                        global={global}
                        featureOverride={overrides[f.id]}
                        unitOverrides={unitOverrides}
                        onUnitDirection={(unitId, nd) =>
                          setUnitOverrides((o) => {
                            const n = { ...o };
                            if (nd === null) delete n[unitId];
                            else n[unitId] = nd;
                            return n;
                          })
                        }
                        baseId={base?.id ?? null}
                        snapshotId={snap?.id ?? null}
                        steps={visibleSteps}
                        busy={!!running || startingRun}
                        onRunOne={() => { setMarkUnits(null); setRunFeatureId(f.id); }}
                        onMarkSynced={() => setMarkUnits(selectedUnitIds(f.units, unitChoices))}
                      />
                    );
                  })}
              {cmp && features.length === 0 ? (
                <div className="cds-empty">
                  <p>{(EMPTY[global] ?? EMPTY.both!).line}</p>
                  <div className="cds-empty-actions">
                    {(EMPTY[global] ?? EMPTY.both!).action === "recompare" ? (
                      <button type="button" className="cds-btn" onClick={() => refresh(true)} disabled={loading} data-tip={TIP.recompare}>
                        Recompare the App
                      </button>
                    ) : (
                      <button type="button" className="cds-btn" onClick={checkDesign} disabled={check?.busy} data-tip={TIP.check}>
                        {check?.busy ? "Checking…" : "Check Claude Design for changes"}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {cmp ? (
              <section className="cds-synced">
                <button type="button" className="cds-link" aria-expanded={showSynced} data-tip={showSynced ? "Hide the parts that match on both sides" : "List the parts that already match on both sides"} onClick={() => setShowSynced((s) => !s)}>
                  {plural(synced, "unit")} in sync{showSynced ? " — hide" : ""}
                </button>
                {showSynced ? (
                  <ul className="cds-synced-list">
                    {cmp.units
                      .filter((u) => u.status === "in-sync")
                      .map((u) => (
                        <li key={u.id}>
                          {u.name} <span className="cds-kind">{u.kind}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </main>
      {state ? <ProjectFooter state={state} onChanged={() => refresh(true)} /> : null}

      {cmp && features.length ? <PlanBar runFeatureId={runFeatureId} onRunFeature={setRunFeatureId} baseId={base?.id ?? null} markUnits={markUnits} onMarkUnits={setMarkUnits} steps={visibleSteps} features={features} global={global} overrides={overrides} unitChoices={unitChoices} state={state} onRun={(only) => void run(only)} busy={!!running || startingRun} merge={merge} onSyncPoint={async (label, tag, hold) => {
        const { syncPoint } = await api.syncPoint(label, tag, base?.id ?? null, hold);
        // compare from the new point (the base change reloads); re-recording the same point just refreshes
        if (syncPoint.id !== baseId) setBaseId(syncPoint.id);
        else refresh(true);
      }} /> : null}

      {panel ? <Activity state={state} merge={merge} focus={activity} onFocus={setActivity} onClose={() => setPanel(false)} onChanged={() => refresh(true)} /> : null}
    </div>
  );
}
