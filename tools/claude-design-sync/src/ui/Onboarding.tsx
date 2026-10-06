// First run: there's no Design snapshot yet, so offer the two ways in.
import { Download, FolderInput } from "lucide-react";
import { useState } from "react";

import { api, type AppState } from "./api";

export function Onboarding({ state, onPull, onImported }: { state: AppState; onPull: () => void; onImported: () => void }) {
  const [path, setPath] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="cds-onboard" aria-labelledby="onboard-h">
      <h2 id="onboard-h">Bring in the Design side</h2>
      <p>To compare, the tool keeps a local snapshot of {state.project.name}. Take one of two routes; you can use either later too.</p>
      <div className="cds-twin cds-onboard-twin">
        <div className="cds-cell">
          <h3>Pull with Claude Code</h3>
          <p className="cds-quiet">Runs Claude Code headless with its DesignSync tool and reads every text file of the project. Takes a few minutes; needs Claude Code signed in to claude.ai.</p>
          <button type="button" className="cds-btn cds-btn-primary" onClick={onPull} disabled={!state.harnesses.claude.ok && !state.fake} data-tip="Run Claude Code headless to read every text file of the project into a local snapshot. Follow it in Activity - Costs tokens">
            <Download size={14} strokeWidth={1.75} aria-hidden /> Pull the project
          </button>
          {!state.harnesses.claude.ok && !state.fake ? <p className="cds-error-inline">{state.harnesses.claude.error}</p> : null}
        </div>
        <div className="cds-rail-cell cds-rail-label">or</div>
        <form
          className="cds-cell"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await api.importExport(path.trim());
              onImported();
            } catch (x) {
              setErr((x as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Import an export</h3>
          <p className="cds-quiet">Download the project from Claude Design (a .zip, or the unzipped folder) and give its path.</p>
          <label className="cds-field">
            <span>Path</span>
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/Downloads/Todoi Design System.zip" required data-tip="The .zip Claude Design exports, or the folder it unzips to" />
          </label>
          <button type="submit" className="cds-btn" disabled={busy || !path.trim()} data-tip={path.trim() ? "Read the export into a local snapshot to compare against" : "Enter the path of an export first"}>
            <FolderInput size={14} strokeWidth={1.75} aria-hidden /> {busy ? "Importing…" : "Import"}
          </button>
          {err ? <p className="cds-error-inline">{err}</p> : null}
        </form>
      </div>
    </section>
  );
}
