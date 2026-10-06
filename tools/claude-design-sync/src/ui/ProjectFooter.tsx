// The footer names the Claude Design project every pull and upload targets, links to it, and lets
// the developer point the tool at another project (checked against their account before it's saved).
import { ArrowUpRight, Pencil } from "lucide-react";
import { useState } from "react";

import { api, projectUrl, type AppState } from "./api";
import { TIP } from "./Tooltip";

export function ProjectFooter({ state, onChanged }: { state: AppState; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = projectUrl(state.project.id);
  const close = () => {
    setEditing(false);
    setErr(null);
  };

  return (
    <footer className="cds-foot" aria-labelledby="foot-h">
      <h2 id="foot-h" className="cds-foot-label">
        Claude Design project
      </h2>
      {editing ? (
        <form
          className="cds-foot-edit"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await api.setProject(value);
              close();
              onChanged();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="cds-field">
            <span>Project link or id</span>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://claude.ai/design/p/…" autoFocus spellCheck={false} data-tip="Paste the project's claude.ai/design link, or just its id" />
          </label>
          <p className="cds-quiet">Pulls and uploads go to this project from now on. Snapshots and sync points stay as they are, so pull before you compare.</p>
          {err ? <p className="cds-error-inline">{err}</p> : null}
          <div className="cds-confirm-actions">
            <button type="submit" className="cds-btn cds-btn-primary" disabled={busy || !value.trim() || value.trim() === url} data-tip={!value.trim() ? "Enter a project link or id first" : value.trim() === url ? "This is already the project the tool targets" : "Check the project against your Claude Design account, then send every pull and upload there"}>
              {busy ? "Checking with Claude Design…" : "Use this project"}
            </button>
            <button type="button" className="cds-btn" onClick={close} disabled={busy} data-tip="Keep the current project">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="cds-foot-target">
          <span className="cds-foot-name">{state.project.name}</span>
          <a className="cds-foot-url" href={url} target="_blank" rel="noreferrer" aria-label={`${url} (opens in a new tab)`} data-tip={TIP.project}>
            {url.replace(/^https:\/\//, "")}
            <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden />
          </a>
          <button
            type="button"
            className="cds-link"
            data-tip="Point the tool at another Claude Design project"
            onClick={() => {
              setValue(url);
              setEditing(true);
            }}
          >
            <Pencil size={12} strokeWidth={1.75} aria-hidden /> Edit
          </button>
        </p>
      )}
    </footer>
  );
}
