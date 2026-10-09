// One ledger line: the feature title across, its App work left and Design work right, the direction
// on the rail between. Opening it shows each subfeature's evidence, diffs and preview cards.
import { ChevronRight, Play } from "lucide-react";
import { Fragment, useState, type InputHTMLAttributes } from "react";

import { api, appMoved, designMoved, directionsFor, displayName, DIRECTION_LABEL, isReference, KIND_WORD, plural, REFERENCE_NOTE, STATUS_WORD, unitDirection, type Direction, type Feature, type Step, type Unit } from "./api";
import { CopyLink } from "./CopyLink";
import { Diff } from "./Diff";
import { RailKeys } from "./Rail";
import type { Selection } from "./selection";
import { TIP } from "./Tooltip";
import { canPicture, useVisual } from "./Visual";

/** A checkbox whose third state ("some") shows as a dash; `indeterminate` only exists as a DOM property */
export function TriCheck({ state, ...props }: { state: "all" | "some" | "none" } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked">) {
  return (
    <input
      {...props}
      type="checkbox"
      className="cds-tick"
      checked={state === "all"}
      aria-checked={state === "some" ? "mixed" : state === "all"}
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
    />
  );
}

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

export function FeatureRow({ feature, direction, overridden, onDirection, selection, onSelect, baseId, snapshotId, steps, busy, onRunOne, onMarkSynced, ...dirs }: { feature: Feature; direction: Direction; overridden: boolean; onDirection: (d: Direction | null) => void; selection: Selection; onSelect: (on: boolean) => void; baseId: string | null; snapshotId: string | null; steps: Step[]; busy: boolean; onRunOne: () => void; onMarkSynced: () => void } & UnitDirections) {
  const [open, setOpen] = useState(false);
  const status = feature.status;
  // a feature made only of Design references has nothing to decide: it says so instead of looking skipped
  const reference = feature.units.every(isReference);
  const why: Partial<Record<Direction, string>> = {
    "design-to-app": "Design → App: Design hasn't changed this feature since the sync point",
    "app-to-design": "App → Design: the App hasn't changed this feature since the sync point",
  };
  return (
    <section className={`cds-row ${open ? "is-open" : ""}`} data-status={status} data-direction={reference ? "reference" : direction} data-selected={selection.state} aria-labelledby={`${feature.id}-t`}>
      <header className="cds-row-head">
        {selection.state === "reference" ? (
          <input type="checkbox" className="cds-tick" disabled checked={false} aria-label={`${feature.title}: reference only, nothing to sync`} data-tip="Reference only: nothing here can be synced. Port it by hand, then mark it synced" />
        ) : (
          <TriCheck
            state={selection.state}
            onChange={() => onSelect(selection.state !== "all")}
            aria-label={`Include ${feature.title} in the sync`}
            data-tip={selection.state === "all" ? "Selected: this feature runs. Untick to skip it" : selection.state === "some" ? `${selection.on} of ${plural(selection.total, "part")} selected. Tick to include every part` : "Skipped: nothing runs for this feature. Tick to include it"}
          />
        )}
        <button type="button" className="cds-row-toggle" aria-expanded={open} aria-controls={`${feature.id}-d`} data-tip={open ? "Fold this feature away" : "Show each part's files, diffs and previews, and what runs for this feature"} onClick={() => setOpen((o) => !o)}>
          <ChevronRight size={14} strokeWidth={1.75} className="cds-chev" aria-hidden />
          <span id={`${feature.id}-t`} className="cds-row-title">{feature.title}</span>
        </button>
        <span className="cds-status" data-status={reference ? undefined : status}>{reference ? "changed in Design, not ported" : STATUS_WORD[status]}</span>
        <span className="cds-count">{selection.state === "some" ? `${selection.on}/${plural(selection.total, "part")}` : plural(feature.units.length, "part")}</span>
      </header>
      <div className={`cds-twin ${open ? "is-head" : ""}`}>
        {open ? <div className="cds-cell cds-cell-app is-quiet">{plural(feature.units.filter((u) => appMoved(u.status)).length, "part")} moved in the App</div> : <SideCell units={feature.units} side="app" known={[feature.title, ...feature.appWork, "New since the sync point"]} />}
        <div className="cds-rail-cell">
          <RailKeys value={direction} allowed={feature.directions} onChange={(d) => onDirection(d)} label={`Direction for ${feature.title}`} why={why} />
          {/* quiet at rest: a note only where this feature does something other than the plan */}
          {reference ? (
            <span className="cds-rail-note">Reference only</span>
          ) : overridden || direction !== dirs.global ? (
            <span className="cds-rail-note">
              {DIRECTION_LABEL[direction]}
              {overridden ? (
                <button type="button" className="cds-reset" onClick={() => onDirection(null)} data-tip="Drop this feature's own direction and follow the plan again">
                  · reset
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {open ? <div className="cds-cell cds-cell-design is-quiet">{plural(feature.units.filter((u) => designMoved(u.status)).length, "part")} moved in Design</div> : <SideCell units={feature.units} side="design" known={[feature.title, ...feature.designWork, "New since the sync point"]} />}
      </div>
      {open ? <FeatureDetail id={`${feature.id}-d`} feature={feature} baseId={baseId} snapshotId={snapshotId} steps={steps} busy={busy} onRunOne={onRunOne} onMarkSynced={onMarkSynced} {...dirs} /> : null}
    </section>
  );
}

function FeatureDetail({ id, feature, baseId, snapshotId, steps, busy, onRunOne, onMarkSynced, global, featureOverride, unitOverrides, onUnitDirection }: { id: string; feature: Feature; baseId: string | null; snapshotId: string | null; steps: Step[]; busy: boolean; onRunOne: () => void; onMarkSynced: () => void } & UnitDirections) {
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
        ) : feature.units.every(isReference) ? (
          <p className="cds-quiet">Nothing runs: {REFERENCE_NOTE} Port the components it shows, then mark this feature synced to clear it.</p>
        ) : (
          <p className="cds-quiet">Nothing — this feature is skipped.</p>
        )}
        <div className="cds-proposal-actions">
          {mine.length ? (
            <button type="button" className="cds-btn" disabled={busy} onClick={onRunOne} data-tip={busy ? "Another job is running, paused or waiting for approval. Finish it in Activity first" : "Review only this feature’s steps before running them. Other features are left out"}>
              <Play size={14} strokeWidth={1.75} aria-hidden /> Run this feature only
            </button>
          ) : null}
          <button type="button" className="cds-btn" onClick={onMarkSynced} data-tip="Review a sync point for only this feature. Other features stay open. Use after uploading and checking the result">
            Mark this feature synced
          </button>
        </div>
      </div>
    </div>
  );
}

/** `feature`: the feature this step starts, as a heading over its group */
export function StepLine({ step, feature }: { step: Step; feature?: string }) {
  const [show, setShow] = useState(false);
  const kind = { "merge-css": "deterministic merge", "ai-pull": "AI draft → App, reviewed before merge", "ai-push": "AI port → Design", upload: "upload, after your approval" }[step.kind];
  return (
    <li className="cds-step" data-kind={step.kind}>
      {feature ? <span className="cds-step-feature">{feature}</span> : null}
      <span className="cds-step-title">{step.title}</span>
      <span className="cds-kind">{kind}</span>
      {step.brief ? (
        <span className="cds-step-actions">
          <button type="button" className="cds-link" aria-expanded={show} data-tip={show ? "Hide the brief" : "Read the brief the AI gets for this step"} onClick={() => setShow((s) => !s)}>
            {show ? "Hide brief" : "Read brief"}
          </button>
          <CopyLink text={step.brief} label="Copy brief" tip="Copy the brief, to run this step yourself in Claude Code or Codex" />
        </span>
      ) : null}
      {show && step.brief ? <pre className="cds-brief">{step.brief}</pre> : null}
    </li>
  );
}

const REFERENCE_WHY: Partial<Record<Direction, string>> = { both: "Design reference (preview, screen or guideline): read it, nothing is ported", "app-to-design": "Design reference: nothing is ported", "design-to-app": "Design reference: nothing is ported" };

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
  const visual = useVisual(unit, baseId);
  return (
    <div className="cds-unit">
      <div className="cds-twin">
        <div className="cds-cell">
          <p className="cds-unit-name">
            {displayName(unit)} <span className="cds-kind">{KIND_WORD[unit.kind]}</span>
          </p>
          {unit.app.paths.length ? (
            <Paths paths={unit.app.paths} />
          ) : unit.related?.length ? (
            <>
              <p className="cds-related">Compare with (never written):</p>
              <Paths paths={unit.related} />
            </>
          ) : unit.kind === "screen" ? (
            <p className="cds-quiet">No App screen pinned: add a pair under screens in config.json</p>
          ) : (
            <p className="cds-quiet">Not in the App</p>
          )}
          {isReference(unit) ? <p className="cds-related">{REFERENCE_NOTE}</p> : null}
          <ul className="cds-evlist">{fresh(unit.app.evidence).map((e) => <li key={e}>{e}</li>)}</ul>
          <span className="cds-unit-actions">
            {unit.app.changed ? (
              <button type="button" className="cds-link" aria-expanded={diff?.side === "app"} data-tip={diff?.side === "app" ? "Hide the App diff" : "Show what changed in these App files since the sync point"} onClick={() => load("app")}>
                {diff?.side === "app" ? "Hide App diff" : "App diff"}
              </button>
            ) : null}
            {canPicture(unit) && snapshotId ? (
              <button type="button" className="cds-link" aria-expanded={visual.open} data-tip={visual.open ? "Hide the pictures" : "Picture this component on both sides: the App's Storybook stories beside the kit's cards, per theme"} onClick={() => void visual.toggle()}>
                {visual.open ? "Hide pictures" : "Compare visually"}
              </button>
            ) : null}
          </span>
        </div>
        <div className="cds-rail-cell">
          <RailKeys value={direction} allowed={directionsFor(unit.status, unit.kind).directions} onChange={(d) => onDirection(d)} label={`Direction for ${displayName(unit)}`} why={REFERENCE_WHY} />
          <span className="cds-rail-note">
            {isReference(unit) ? "Reference only" : STATUS_WORD[unit.status]}
            {overridden ? (
              <button type="button" className="cds-reset" onClick={() => onDirection(null)} data-tip="Drop this part's own direction and follow its feature again">
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
              <button type="button" className="cds-link" aria-expanded={diff?.side === "design"} data-tip={diff?.side === "design" ? "Hide the Design diff" : "Show what changed in these kit files since the sync point's snapshot"} onClick={() => load("design")}>
                {diff?.side === "design" ? "Hide Design diff" : "Design diff"}
              </button>
            ) : null}
            {snapshotId && unit.preview ? (
              <a className="cds-link" href={`/kit/snapshot/${snapshotId}/${unit.preview}`} target="_blank" rel="noreferrer" data-tip="Open the kit's interactive app from the newest snapshot, in a new tab">
                Open the kit app
              </a>
            ) : null}
            {snapshotId
              ? cards.map((c) => (
                  <button key={c} type="button" className="cds-link" aria-expanded={preview === c} data-tip={preview === c ? TIP.closePreview : `Render ${/-minimal/.test(c) ? "the Minimal theme's" : "this"} preview card from the newest snapshot`} onClick={() => setPreview((p) => (p === c ? null : c))}>
                    {preview === c ? "Close preview" : /-minimal/.test(c) ? "Preview · Minimal" : "Preview"}
                  </button>
                ))
              : null}
          </span>
        </div>
      </div>
      {visual.panel}
      {diff ? <Diff text={diff.text} /> : null}
      {preview && snapshotId ? (
        <div className="cds-preview">
          <iframe title={`Preview of ${preview}`} src={`/kit/snapshot/${snapshotId}/${preview}`} loading="lazy" sandbox="allow-scripts allow-same-origin" />
        </div>
      ) : null}
    </div>
  );
}
