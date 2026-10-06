// Pictures instead of a text diff between React 18 mockups and React 19 code: the App's component as its
// Storybook stories render it, in the App column, beside the kit's cards that render it, in the Design
// column, one theme at a time. Both sides are shot at 2× and shown 1:1, so sizes, padding and type compare.
import { useState } from "react";

import { api, isStoryPath, plural, store, type Unit, type VisualComparison, type VisualTheme } from "./api";

const THEMES: Array<{ id: VisualTheme; label: string; mode: string }> = [
  { id: "rounded", label: "Rounded", mode: "dark" },
  { id: "minimal", label: "Minimal", mode: "light" },
];
const THEME_KEY = "cds-visual-theme";

/** The theme switch stays in view while scrolling the pictures: it sticks under the ledger's sticky column heads */
const stickUnderHeads = (el: HTMLElement | null) => {
  const heads = document.querySelector(".cds-heads");
  if (el && heads) el.style.top = `calc(var(--cds-bar) + ${Math.round(heads.getBoundingClientRect().height)}px)`;
};

/** Only a component with stories has an App side to picture */
export const canPicture = (unit: Unit) => unit.kind === "component" && unit.app.paths.some(isStoryPath);

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
  // one theme for every comparison, remembered per browser
  const [theme, setThemeState] = useState<VisualTheme>(() => store.get<VisualTheme>(THEME_KEY, "minimal"));
  const setTheme = (t: VisualTheme) => {
    setThemeState(t);
    store.set(THEME_KEY, t);
  };
  const t = THEMES.find((x) => x.id === theme) ?? THEMES[1]!;
  if (error) return <p className="cds-error-inline cds-visual-msg" role="alert">Couldn't picture {name}: {error}</p>;
  if (!data)
    return (
      <div className="cds-visual is-loading" aria-busy="true">
        <p className="cds-quiet cds-visual-msg" role="status">Rendering {name}'s stories and the kit's cards… The first look at a component takes up to half a minute (it may build Storybook first); later looks are instant.</p>
        <div className="cds-twin"><span className="cds-skel cds-visual-skel" /><span /><span className="cds-skel cds-visual-skel" /></div>
      </div>
    );
  const app = data.app.filter((s) => s.theme === theme);
  const design = data.design.filter((s) => s.theme === theme);
  const side = (shots: VisualComparison["app"], note: string | undefined, what: string) => (
    <div className="cds-cell cds-visual-side">
      {shots.length ? (
        shots.map((s) => (
          <figure key={s.file}>
            <figcaption>
              <span>{s.label}</span>
              {s.shows ? <span className="cds-quiet">{name} × {s.shows}</span> : null}
              {s.errors?.length ? (
                <details className="cds-visual-errors">
                  <summary className="cds-error-inline">{plural(s.errors.length, "error")} while rendering</summary>
                  <ul>{s.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </details>
              ) : null}
            </figcaption>
            <div className="cds-visual-frame">
              <img src={`/visual/${data.key}/${s.file}`} width={s.width} height={s.height} alt={`${what}: ${s.label}, ${t.label} theme`} loading="lazy" />
            </div>
          </figure>
        ))
      ) : (
        <p className="cds-quiet">{note ?? `Nothing to show in ${t.label}.`}</p>
      )}
    </div>
  );
  return (
    <section className="cds-visual" aria-label={`${name} on both sides`}>
      <div className="cds-visual-bar" ref={stickUnderHeads}>
        <div className="cds-map-filters" role="group" aria-label="Theme">
          {THEMES.map((x) => (
            <button key={x.id} type="button" className="cds-map-filter" aria-pressed={theme === x.id} data-tip={`Show both sides in the ${x.label} theme (${x.mode} mode, as the kit's cards are)`} onClick={() => setTheme(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <span className="cds-quiet">{t.mode} mode · both sides at actual size</span>
      </div>
      <div className="cds-twin cds-visual-head">
        <p className="cds-cell cds-quiet">The App's stories ({app.length})</p>
        <span className="cds-rail-cell" />
        <p className="cds-cell cds-quiet">Kit cards that render {name} ({design.length})</p>
      </div>
      <div className="cds-twin">
        {side(app, data.notes.app, "App story")}
        <span className="cds-rail-cell" />
        {side(design, data.notes.design, "Kit card")}
      </div>
    </section>
  );
}
