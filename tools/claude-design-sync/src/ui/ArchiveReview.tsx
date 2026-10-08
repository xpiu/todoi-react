import { FileArchive } from "lucide-react";

import { archiveName, isProjectArchive, type AppState, type SnapshotMeta } from "./api";

function ArchiveTime({ at }: { at: string }) {
  return <time dateTime={at} title={at}>{new Date(at).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  })}</time>;
}

/** Show the archive's provenance at the decision to bring Design work into the App. */
export function ArchiveReview({ state, snapshot, onImport }: { state: AppState; snapshot: SnapshotMeta; onImport: () => void }) {
  const latest = state.snapshots.find((s) => isProjectArchive(s, state.project.id));
  const inUse = latest?.id === snapshot.id;

  return (
    <section className="cds-archive-review" aria-label="Project archive reminder">
      <h4>Design source for this App update</h4>
      {latest ? <>
        <p>Latest imported Project archive: <strong>{archiveName(latest)}</strong></p>
        <p className="cds-quiet">
          {latest.exportedAt ? <>Downloaded (file timestamp) <ArchiveTime at={latest.exportedAt} /> · </> : <>Download time not recorded · </>}
          Imported <ArchiveTime at={latest.createdAt} />
        </p>
      </> : <p>No Project archive has been imported for this project yet.</p>}
      <p>{inUse ? "These steps use this archive's files." : <>These steps use “{snapshot.label}”, {snapshot.source === "pull" ? "pulled from Claude Design" : snapshot.source === "upload" ? "saved after an upload to Claude Design" : "imported"} on <ArchiveTime at={snapshot.createdAt} />.</>}</p>
      <p className="cds-quiet">Changes made in Claude Design since this snapshot are not included. If you've made more changes, download and import a newer Project archive, then review the updated steps.</p>
      <button type="button" className="cds-btn" onClick={onImport}>
        <FileArchive size={14} strokeWidth={1.75} aria-hidden /> {latest ? "Import a newer project archive" : "Import project archive"}
      </button>
    </section>
  );
}
