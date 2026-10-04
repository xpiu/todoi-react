// The sync plan: verdict + direction, the ledger of features, the plan bar, and the activity panel.
import { ArrowLeft, ArrowLeftRight, ArrowRight, History, LoaderCircle, PanelRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Activity } from "./Activity";
import { api, DIRECTION_HINT, DIRECTION_LABEL, DIRECTION_SUB, effective, fmtTime, plural, type AppState, type Comparison, type Direction, type Step } from "./api";
import { FeatureRow } from "./FeatureRow";
import { Onboarding } from "./Onboarding";
import { PlanBar } from "./PlanBar";

const GLOBALS: Array<{ d: Direction; Icon: typeof ArrowLeft }> = [
  { d: "design-to-app", Icon: ArrowLeft },
  { d: "both", Icon: ArrowLeftRight },
  { d: "app-to-design", Icon: ArrowRight },
];
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private window */
    }
  },
};

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string | null>(() => store.get<string | null>("cds-base", null));
  const [global, setGlobal] = useState<Direction>(() => store.get<Direction>("cds-global", "both"));
  const [overrides, setOverrides] = useState<Record<string, Direction>>(() => store.get("cds-overrides", {}));
  const [unitOverrides, setUnitOverrides] = useState<Record<string, Direction>>(() => store.get("cds-unit-overrides", {}));
  const [harnessPick, setHarnessPick] = useState<"claude" | "codex" | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSynced, setShowSynced] = useState(false);
  const [check, setCheck] = useState<{ busy: boolean; stale?: boolean; updatedAt?: string | null; error?: string } | null>(null);

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
    void load(fresh);
  };
  useEffect(() => store.set("cds-base", baseId), [baseId]);
  useEffect(() => store.set("cds-global", global), [global]);
  useEffect(() => store.set("cds-overrides", overrides), [overrides]);
  useEffect(() => store.set("cds-unit-overrides", unitOverrides), [unitOverrides]);
  const harness = harnessPick ?? state?.implement ?? "claude";

  // the plan follows every decision
  useEffect(() => {
    if (!cmp) return;
    let live = true;
    api.plan(cmp.base?.id ?? null, global, overrides, unitOverrides).then((r) => live && setSteps(r.steps), (e) => live && setError((e as Error).message));
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
      else if (f.status === "app-ahead" || f.status === "app-only") t.app++;
      else if (f.status === "design-ahead" || f.status === "design-only") t.design++;
    }
    return t;
  }, [features]);

  const openJob = (id: string) => {
    setActivity(id);
    setPanel(true);
  };
  const run = async (only?: string[]) => {
    try {
      const r = await api.run(cmp?.base?.id ?? null, global, overrides, unitOverrides, harness, only);
      openJob(r.job);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const checkDesign = async () => {
    setCheck({ busy: true });
    try {
      const r = await api.statusCheck();
      setCheck({ busy: false, stale: r.stale, updatedAt: r.updatedAt });
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
  const running = state?.jobs.find((j) => j.state === "running" || j.state === "awaiting-upload");
  const synced = cmp?.units.filter((u) => u.status === "in-sync").length ?? 0;

  return (
    <div className={`cds ${panel ? "has-panel" : ""}`}>
      <a className="cds-skip" href="#ledger">Skip to the features</a>
      <header className="cds-bar">
        <h1 className="cds-wordmark">
          Todoi <ArrowLeftRight size={14} strokeWidth={1.75} className="cds-wordmark-mark" aria-hidden />
          <span className="cds-sr"> and </span> Claude Design
        </h1>
        <div className="cds-bar-tools">
          {state?.syncPoints.length ? (
            <label className="cds-since">
              <History size={14} strokeWidth={1.75} aria-hidden />
              <span>Since</span>
              <select value={baseId ?? ""} onChange={(e) => setBaseId(e.target.value || null)} aria-label="Compare since sync point">
                {state.syncPoints.map((p) => (
                  <option key={p.id} value={p.id} title={`${p.label} — App @${p.rev}, ${fmtTime(p.createdAt)}`}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="cds-tool" onClick={() => refresh(true)} disabled={loading} title="Re-read the App and the latest snapshot" aria-label="Recompare">
            {loading ? <LoaderCircle size={14} className="cds-spin" aria-hidden /> : <RefreshCw size={14} strokeWidth={1.75} aria-hidden />} <span className="cds-tool-label">Recompare</span>
          </button>
          <button type="button" className={`cds-tool ${running ? "is-live" : ""}`} aria-pressed={panel} aria-label="Activity" onClick={() => setPanel((p) => !p)}>
            <PanelRight size={14} strokeWidth={1.75} aria-hidden /> <span className="cds-tool-label">Activity</span>{running ? <span className="cds-live" aria-label="A job is running" /> : null}
          </button>
        </div>
      </header>

      <main className="cds-main">
        {error ? (
          <p className="cds-error" role="alert">
            {error}
          </p>
        ) : null}

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
                  {GLOBALS.map(({ d, Icon }) => (
                    <button key={d} type="button" role="radio" aria-checked={global === d} className="cds-global-opt" onClick={() => setGlobal(d)} title={DIRECTION_HINT[d]}>
                      <Icon size={16} strokeWidth={1.75} className="cds-global-icon" aria-hidden />
                      <span className="cds-global-text">
                        <span className="cds-global-name">{DIRECTION_LABEL[d]}</span>
                        <span className="cds-global-hint">{DIRECTION_SUB[d]}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {Object.keys(overrides).length + Object.keys(unitOverrides).length ? (
                  <button
                    type="button"
                    className="cds-link"
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
                </span>
                <span className="cds-head-actions">
                  <button type="button" className="cds-link" onClick={checkDesign} disabled={check?.busy}>
                    {check?.busy ? "Checking…" : check?.stale ? "Design changed — pull" : check && !check.error ? "Up to date" : "Check for changes"}
                  </button>
                  {check?.stale || check?.error ? (
                    <button type="button" className="cds-link" onClick={pull}>
                      Pull now
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
                        onRunOne={(ids) => void run(ids)}
                      />
                    );
                  })}
              {cmp && features.length === 0 ? (
                <div className="cds-empty">
                  <p>Nothing to move. When either side changes, pull a fresh Design snapshot or recompare.</p>
                  <div className="cds-empty-actions">
                    <button type="button" className="cds-btn" onClick={checkDesign}>
                      Check Claude Design for changes
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {cmp ? (
              <section className="cds-synced">
                <button type="button" className="cds-link" aria-expanded={showSynced} onClick={() => setShowSynced((s) => !s)}>
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

      {cmp && features.length ? <PlanBar steps={visibleSteps} features={features} global={global} overrides={overrides} state={state} harness={harness} onHarness={setHarnessPick} onRun={() => void run()} busy={!!running} onSyncPoint={async (label, tag) => {
        await api.syncPoint(label, tag);
        refresh(true);
      }} /> : null}

      {panel ? <Activity state={state} focus={activity} onFocus={setActivity} onClose={() => setPanel(false)} onChanged={() => refresh(true)} /> : null}
    </div>
  );
}

