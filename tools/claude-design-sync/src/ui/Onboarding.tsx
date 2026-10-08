// First run: there's no Design snapshot yet, so offer the two ways in.
import { type AppState, type Imported } from "./api";
import { DesignRefresh } from "./DesignRefresh";

export function Onboarding({ state, onPull, onImported }: { state: AppState; onPull: () => void; onImported: (r: Imported) => void }) {
  return (
    <section className="cds-onboard" aria-labelledby="onboard-h">
      <h2 id="onboard-h">Bring in the Design side</h2>
      <p>Start with a Project archive of {state.project.name}. It brings all the project files into a local snapshot without using tokens.</p>
      <DesignRefresh key={state.project.id} state={state} onPull={onPull} onImported={onImported} />
    </section>
  );
}
