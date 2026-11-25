// Restore from an export: read the picked .zip in the browser (its JSON only — attachment bytes stay
// unread), check it and summarise it with the server's own rules (shared/archive.ts), then upload it.
// Spec: DESIGN.md › Export & print › Restore.
import { useNavigate } from "@tanstack/react-router";
import { strFromU8, unzipSync } from "fflate";
import { useState } from "react";

import { ArchiveRejected, checkArchive, MAX_ARCHIVE_BYTES, NOT_AN_EXPORT, summarizeArchive } from "../../shared/archive";
import { unwrap, errorMessage } from "../data/api";
import { useProjectMutations } from "../data/projects";
import { RestoreArchiveDialog, type RestorePreview, type RestoreStage } from "../design/settings/RestoreArchiveDialog";
import { useFeedback } from "./feedback";

/** What restoring this file would do, or why it can't be restored. */
export async function previewArchive(file: File, viewer: { email: string }): Promise<RestorePreview> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new ArchiveRejected("This export is larger than 512 MB, more than one restore can take.");
  const names = new Set<string>();
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => {
        names.add(f.name);
        return f.name.endsWith(".json");
      },
    });
  } catch {
    throw new ArchiveRejected(NOT_AN_EXPORT);
  }
  const { manifest, files } = checkArchive((name) => (entries[name] ? strFromU8(entries[name]) : undefined), (name) => names.has(name));
  return { ...summarizeArchive(manifest, files, viewer), accountName: manifest.account.name, exportedAt: manifest.exportedAt, projectNames: manifest.projects.map((p) => p.name) };
}

export function useRestoreArchive({ email, online }: { email: string; online: boolean }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<RestoreStage>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useProjectMutations();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const start = () => {
    setStage("choose");
    setFile(null);
    setPreview(null);
    setError(null);
    setOpen(true);
  };
  const dialog = (
    <RestoreArchiveDialog
      open={open}
      onClose={() => setOpen(false)}
      stage={stage}
      preview={preview}
      busy={busy}
      error={error}
      offline={!online}
      onPick={async (f) => {
        setBusy(true);
        setError(null);
        try {
          setPreview(await previewArchive(f, { email }));
          setFile(f);
          setStage("review");
        } catch (e) {
          setError(e instanceof ArchiveRejected ? e.message : NOT_AN_EXPORT);
        } finally {
          setBusy(false);
        }
      }}
      onBack={() => {
        setStage("choose");
        setError(null);
      }}
      onRestore={async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
          const body = new FormData();
          body.set("file", file);
          await fetch("/api/me/restore", { method: "POST", body }).then((r) => unwrap(r));
          await refresh();
          setStage("done");
          notify({ message: `Restored ${preview?.projects === 1 ? "1 project" : `${preview?.projects ?? 0} projects`} from the export`, icon: "archive-restore" });
        } catch (e) {
          // The server restores all or nothing.
          setError(`Couldn't restore, and nothing was added: ${errorMessage(e).replace(/\.$/, "")}. Try again.`);
        } finally {
          setBusy(false);
        }
      }}
      onOpenProjects={() => {
        setOpen(false);
        void navigate({ to: "/projects" });
      }}
    />
  );
  return { start, dialog };
}
