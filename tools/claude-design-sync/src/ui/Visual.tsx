// Pictures instead of a text diff between React 18 mockups and React 19 code: the App's component as its
// Storybook stories render it, in the App column, beside the kit's cards that show it, in the Design column,
// one theme at a time.
import { useState } from "react";

import { api, plural, type Unit, type VisualComparison, type VisualTheme } from "./api";

const THEMES: Array<{ id: VisualTheme; label: string; mode: string }> = [
  { id: "rounded", label: "Rounded", mode: "dark" },
  { id: "minimal", label: "Minimal", mode: "light" },
];

/** The link that opens a component's visual comparison, and the comparison itself under the unit */
export function useVisual(unit: Unit, baseId: string | null) {
  const [state, setState] = useState<{ data: VisualComparison | null; error: string | null } | null>(null);
  const toggle = async () => {
    if (state) return setState(null);
    setState({ data: null, error: null });
    try {
      setState({ data: await api.visual(unit.id, baseId), error: null });
    } catch (e) {
      setState({ data: null, error: (e as Error).message });
    }
  };
  return { open: !!state, toggle, panel: state ? <VisualCompare data={state.data} error={state.error} name={unit.name} /> : null };
}

function VisualCompare({ data, error, name }: { data: VisualComparison | null; error: string | null; name: string }) {
  const [theme, setTheme] = useState<VisualTheme>("minimal");
  const t = THEMES.find((x) => x.id === theme)!;
  if (error) return <p className="cds-error-inline cds-visual-msg" role="alert">Couldn't picture {name}: {error}</p>;
  if (!data)
    return (
      <div className="cds-visual is-loading" aria-busy="true">
        <p className="cds-quiet cds-visual-msg" role="status">Rendering {name}'s stories and the kit's cards… The first look at a component takes up to half a minute (it may build Storybook first); later looks are instant.</p>
        <div className="cds-twin"><span className="cds-skel cds-visual-skel" /><span /><span className="cds-skel cds-visual-skel" /></div>
      </div>
    );
  const side = (shots: VisualComparison["app"], note: string | undefined, what: string) => {
    const mine = shots.filter((s) => s.theme === theme);
    return (
      <div className="cds-cell cds-visual-side">
        {mine.length ? (
          mine.map((s) => (
            <figure key={s.file}>
              <figcaption>
                {s.label}
                {s.errors?.length ? <span className="cds-error-inline">{plural(s.errors.length, "error")} while rendering</span> : null}
              </figcaption>
              <img src={`/visual/${data.key}/${s.file}`} alt={`${what}: ${s.label}, ${t.label} theme`} loading="lazy" />
            </figure>
          ))
        ) : (
          <p className="cds-quiet">{note ?? `Nothing to show in ${t.label}.`}</p>
        )}
      </div>
    );
  };
  return (
    <section className="cds-visual" aria-label={`${name} on both sides`}>
      <div className="cds-visual-bar">
        <div className="cds-map-filters" role="group" aria-label="Theme">
          {THEMES.map((x) => (
            <button key={x.id} type="button" className="cds-map-filter" aria-pressed={theme === x.id} data-tip={`Show both sides in the ${x.label} theme (${x.mode} mode, as the kit's cards are)`} onClick={() => setTheme(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <span className="cds-quiet">{t.label} theme, {t.mode} mode on both sides</span>
      </div>
      <div className="cds-twin cds-visual-head">
        <p className="cds-cell cds-quiet">The App's Storybook stories</p>
        <span className="cds-rail-cell" />
        <p className="cds-cell cds-quiet">The kit's preview cards that show it</p>
      </div>
      <div className="cds-twin">
        {side(data.app, data.notes.app, "App story")}
        <span className="cds-rail-cell" />
        {side(data.design, data.notes.design, "Kit card")}
      </div>
    </section>
  );
}
