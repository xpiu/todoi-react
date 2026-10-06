// One ledger line: the feature title across, its App work left and Design work right, the direction
// on the rail between. Opening it shows each subfeature's evidence, diffs and preview cards.
import { ChevronRight, Copy, Check, Play } from "lucide-react";
import { Fragment, useState } from "react";

import { api, appMoved, designMoved, directionsFor, displayName, DIRECTION_LABEL, KIND_WORD, plural, STATUS_WORD, unitDirection, type Direction, type Feature, type Step, type Unit } from "./api";
import { Diff } from "./Diff";
import { RailKeys } from "./Rail";

function SideCell({ units, side, known }: { units: Unit[]; side: "app" | "design"; known: string[] }) {
  const moved = units.filter((u) => (side === "app" ? appMoved : designMoved)(u.status));
  const telling = (u: Unit) => (side === "app" ? u.app.evidence : u.design.evidence).find((e) => !known.includes(e));
  if (!moved.length) return <div className={`cds-cell cds-cell-${side} is-quiet`}>No change</div>;
  return (
    <ul className={`cds-cell cds-cell-${side}`}>
      {moved.slice(0, 4).map((u) => (
        <li key={u.id}>
          <span className="cds-sub">{displayName(u)}</span>
          <span className="cds-kind">{(side === "app" ? u.app.added : u.design.added) ? "new " : ""}{KIND_WORD[u.kind]}</span>
          {telling(u) ? <span className="cds-ev">{telling(u)}</span> : null}
        </li>
      ))}
      {moved.length > 4 ? <li className="cds-more">+{moved.length - 4} more</li> : null}
    </ul>
  );
}

interface UnitDirections {
  global: Direction;
  featureOverride?: Direction;
  unitOverrides: Record<string, Direction>;
  onUnitDirection: (unitId: string, d: Direction | null) => void;
}

export function FeatureRow({ feature, direction, overridden, onDirection, baseId, snapshotId, steps, onRunOne, ...dirs }: { feature: Feature; direction: Direction; overridden: boolean; onDirection: (d: Direction | null) => void; baseId: string | null; snapshotId: string | null; steps: Step[]; onRunOne: (stepIds: string[]) => void } & UnitDirections) {
  const [open, setOpen] = useState(false);
  const status = feature.status;
  const why: Partial<Record<Direction, string>> = {
    "design-to-app": "Design → App: Design hasn't changed this feature since the sync point",
    "app-to-design": "App → Design: the App hasn't changed this feature since the sync point",
  };
  return (
    <section className={`cds-row ${open ? "is-open" : ""}`} data-status={status} data-direction={direction} aria-labelledby={`${feature.id}-t`}>
      <header className="cds-row-head">
        <button type="button" className="cds-row-toggle" aria-expanded={open} aria-controls={`${feature.id}-d`} onClick={() => setOpen((o) => !o)}>
          <ChevronRight size={14} strokeWidth={1.75} className="cds-chev" aria-hidden />
          <span id={`${feature.id}-t`} className="cds-row-title">{feature.title}</span>
        </button>
        <span className="cds-status" data-status={status}>{STATUS_WORD[status]}</span>
        <span className="cds-count">{plural(feature.units.length, "part")}</span>
      </header>
      <div className={`cds-twin ${open ? "is-head" : ""}`}>
        {open ? <div className="cds-cell cds-cell-app is-quiet">{plural(feature.units.filter((u) => appMoved(u.status)).length, "part")} moved in the App</div> : <SideCell units={feature.units} side="app" known={[feature.title, ...feature.appWork, "New since the sync point"]} />}
        <div className="cds-rail-cell">
          <RailKeys value={direction} allowed={feature.directions} onChange={(d) => onDirection(d)} label={`Direction for ${feature.title}`} why={why} />
          {/* quiet at rest: a note only where this feature does something other than the plan */}
          {overridden || direction !== dirs.global ? (
            <span className="cds-rail-note">
              {DIRECTION_LABEL[direction]}
              {overridden ? (
                <button type="button" className="cds-reset" onClick={() => onDirection(null)} title="Use the plan's direction again">
                  · reset
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {open ? <div className="cds-cell cds-cell-design is-quiet">{plural(feature.units.filter((u) => designMoved(u.status)).length, "part")} moved in Design</div> : <SideCell units={feature.units} side="design" known={[feature.title, ...feature.designWork, "New since the sync point"]} />}
      </div>
      {open ? <FeatureDetail id={`${feature.id}-d`} feature={feature} baseId={baseId} snapshotId={snapshotId} steps={steps} onRunOne={onRunOne} {...dirs} /> : null}
    </section>
  );
}

function FeatureDetail({ id, feature, baseId, snapshotId, steps, onRunOne, global, featureOverride, unitOverrides, onUnitDirection }: { id: string; feature: Feature; baseId: string | null; snapshotId: string | null; steps: Step[]; onRunOne: (stepIds: string[]) => void } & UnitDirections) {
  const mine = steps.filter((s) => s.featureId === feature.id);
  return (
    <div id={id} className="cds-detail">
      {feature.appWork.length || feature.designWork.length ? (
        <div className="cds-twin cds-work">
          <ul className="cds-cell">{feature.appWork.map((w) => <li key={w}>{w}</li>)}</ul>
          <div className="cds-rail-cell cds-rail-label">work</div>
          <ul className="cds-cell">{feature.designWork.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      ) : null}
      {feature.units.map((u) => (
        <UnitDetail
          key={u.id}
          unit={u}
          known={[feature.title, ...feature.appWork, ...feature.designWork]}
          baseId={baseId}
          snapshotId={snapshotId}
          direction={unitDirection(feature.directions, u.status, global, featureOverride, unitOverrides[u.id], u.kind)}
          overridden={u.id in unitOverrides}
          onDirection={(d) => onUnitDirection(u.id, d)}
        />
      ))}
      <div className="cds-proposal">
        <h4>What runs for this feature</h4>
        {mine.length ? (
          <ol className="cds-steps">
            {mine.map((s) => (
              <StepLine key={s.id} step={s} />
            ))}
          </ol>
        ) : (
          <p className="cds-quiet">Nothing — this feature is skipped.</p>
        )}
        {mine.length ? (
          <button type="button" className="cds-btn" onClick={() => onRunOne(mine.map((s) => s.id))}>
            <Play size={14} strokeWidth={1.75} aria-hidden /> Run this feature only
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StepLine({ step }: { step: Step }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const kind = { "merge-css": "deterministic merge", "ai-pull": "AI port → App", "ai-push": "AI port → Design", upload: "upload, after your approval" }[step.kind];
  return (
    <li className="cds-step" data-kind={step.kind}>
      <span className="cds-step-title">{step.title}</span>
      <span className="cds-kind">{kind}</span>
      {step.brief ? (
        <span className="cds-step-actions">
          <button type="button" className="cds-link" aria-expanded={show} onClick={() => setShow((s) => !s)}>
            {show ? "Hide brief" : "Read brief"}
          </button>
          <button
            type="button"
            className="cds-link"
            onClick={async () => {
              await navigator.clipboard.writeText(step.brief!);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copied ? "Copied" : "Copy brief"}
          </button>
        </span>
      ) : null}
      {show && step.brief ? <pre className="cds-brief">{step.brief}</pre> : null}
    </li>
  );
}

const REFERENCE_WHY: Partial<Record<Direction, string>> = { both: "Design-only reference (preview or guideline): nothing to port", "app-to-design": "Design-only reference: nothing to port", "design-to-app": "Design-only reference: nothing to port" };

/** One path per line, with break opportunities after each slash instead of mid-word */
function Paths({ paths }: { paths: string[] }) {
  return (
    <p className="cds-path">
      {paths.map((p) => (
        <span key={p} className="cds-path-line">
          {p.split("/").map((seg, i, all) => (
            <Fragment key={i}>
              {seg}
              {i < all.length - 1 ? (
                <>
                  /<wbr />
                </>
              ) : null}
            </Fragment>
          ))}
        </span>
      ))}
    </p>
  );
}

function UnitDetail({ unit, known, baseId, snapshotId, direction, overridden, onDirection }: { unit: Unit; known: string[]; baseId: string | null; snapshotId: string | null; direction: Direction; overridden: boolean; onDirection: (d: Direction | null) => void }) {
  const fresh = (list: string[]) => list.filter((e) => !known.includes(e));
  const [diff, setDiff] = useState<{ side: "app" | "design"; text: string | null } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const load = async (side: "app" | "design") => {
    if (diff?.side === side) return setDiff(null);
    setDiff({ side, text: null });
    try {
      const r = await api.diff(unit.id, side, baseId);
      setDiff({ side, text: r.text });
    } catch (e) {
      setDiff({ side, text: `Couldn't load the diff: ${(e as Error).message}` });
    }
  };
  const cards = unit.kind === "card" ? unit.design.paths : [];
  return (
    <div className="cds-unit">
      <div className="cds-twin">
        <div className="cds-cell">
          <p className="cds-unit-name">
            {displayName(unit)} <span className="cds-kind">{KIND_WORD[unit.kind]}</span>
          </p>
          {unit.app.paths.length ? <Paths paths={unit.app.paths} /> : <p className="cds-quiet">Not in the App</p>}
          <ul className="cds-evlist">{fresh(unit.app.evidence).map((e) => <li key={e}>{e}</li>)}</ul>
          {unit.app.changed ? (
            <button type="button" className="cds-link" aria-expanded={diff?.side === "app"} onClick={() => load("app")}>
              {diff?.side === "app" ? "Hide App diff" : "App diff"}
            </button>
          ) : null}
        </div>
        <div className="cds-rail-cell">
          <RailKeys value={direction} allowed={directionsFor(unit.status, unit.kind).directions} onChange={(d) => onDirection(d)} label={`Direction for ${displayName(unit)}`} why={REFERENCE_WHY} />
          <span className="cds-rail-note">
            {STATUS_WORD[unit.status]}
            {overridden ? (
              <button type="button" className="cds-reset" onClick={() => onDirection(null)} title="Follow the feature's direction again">
                · reset
              </button>
            ) : null}
          </span>
        </div>
        <div className="cds-cell">
          <p className="cds-unit-name cds-ghost" aria-hidden>
            &nbsp;
          </p>
          {unit.design.paths.length ? <Paths paths={unit.design.paths} /> : <p className="cds-quiet">Not in the kit</p>}
          <ul className="cds-evlist">{fresh(unit.design.evidence).map((e) => <li key={e}>{e}</li>)}</ul>
          <span className="cds-unit-actions">
            {unit.design.changed ? (
              <button type="button" className="cds-link" aria-expanded={diff?.side === "design"} onClick={() => load("design")}>
                {diff?.side === "design" ? "Hide Design diff" : "Design diff"}
              </button>
            ) : null}
            {snapshotId
              ? cards.map((c) => (
                  <button key={c} type="button" className="cds-link" aria-expanded={preview === c} onClick={() => setPreview((p) => (p === c ? null : c))}>
                    {preview === c ? "Close preview" : /-minimal/.test(c) ? "Preview · Minimal" : "Preview"}
                  </button>
                ))
              : null}
          </span>
        </div>
      </div>
      {diff ? <Diff text={diff.text} /> : null}
      {preview && snapshotId ? (
        <div className="cds-preview">
          <iframe title={`Preview of ${preview}`} src={`/kit/snapshot/${snapshotId}/${preview}`} loading="lazy" sandbox="allow-scripts allow-same-origin" />
        </div>
      ) : null}
    </div>
  );
}
