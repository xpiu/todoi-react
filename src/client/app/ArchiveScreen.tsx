// Archive and Trash on real data, account-wide or scoped to one project (?project=). Restore puts
// things back where they were; Delete forever is the explicit, inline-confirmed step.
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type { UpdateItemInput } from "../../shared/items";

import { useUpdateItem } from "../data/mutations";
import { useArchive, useProjectMutations } from "../data/projects";
import { useGroups } from "../data/queries";
import type { IconName } from "../design/core/Icon";
import { ViewSkeleton } from "../design/core/Skeleton";
import { ArchiveView, type ArchiveEntry } from "../design/project/ArchiveView";
import { projectColorVar } from "../design/project/ProjectIconPicker";
import { quote, useFeedback } from "./feedback";
import { LoadFailed } from "./LoadFailed";

const route = getRouteApi("/app/archive");

export function ArchiveScreen() {
  const { project: projectId } = route.useSearch();
  const archive = useArchive(projectId);
  const groups = useGroups();
  const m = useProjectMutations();
  const scope = useMemo(() => (projectId ? { projectId } : { listId: "none" }), [projectId]);
  const updateItem = useUpdateItem(scope);
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (error) { notify({ message: error instanceof Error ? error.message : "The action failed. Please try again.", icon: "circle-alert" }); }
    finally { setBusy(false); }
  };
  if (archive.isError) return <LoadFailed what="the archive" error={archive.error} onRetry={() => void archive.refetch()} />;
  if (!archive.data) return <ViewSkeleton view="list" lists={1} />;
  const entries: ArchiveEntry[] = [
    ...archive.data.projects.map((p) => ({ id: p.id, kind: "project" as const, removed: p.deletedAt ? ("deleted" as const) : ("archived" as const), title: p.name, at: p.deletedAt ?? p.archivedAt, icon: p.icon as IconName | null, color: projectColorVar(p.color), groupName: p.groupName ?? undefined })),
    ...archive.data.items.map((it) => ({ id: it.id, kind: "item" as const, removed: it.deletedAt ? ("deleted" as const) : ("archived" as const), title: it.title, key: it.keyNumber != null && it.keyPrefix ? `${it.keyPrefix}-${it.keyNumber}` : undefined, at: it.deletedAt ?? it.archivedAt, done: it.done, projectId: it.projectId ?? undefined, projectName: it.projectName ?? undefined, listName: it.listName ?? undefined })),
  ];
  const updateArchivedItem = async (e: ArchiveEntry, changes: UpdateItemInput) => {
    await updateItem.mutateAsync({ id: e.id, ...changes });
    await m.refresh(e.projectId);
  };
  const restore = (e: ArchiveEntry) => run(async () => {
    if (e.kind === "project") await m.restoreProject.mutateAsync({ id: e.id });
    else await updateArchivedItem(e, { deleted: false, archived: false });
    notify({ message: `Restored ${quote(e.title)}${e.listName ? ` to ${e.listName}` : ""}`, icon: "archive-restore", restore: async () => {
      if (e.kind === "project") await (e.removed === "deleted" ? m.deleteProject : m.archiveProject).mutateAsync({ id: e.id });
      else await updateArchivedItem(e, e.removed === "deleted" ? { deleted: true } : { archived: true });
    } });
  });
  const destroy = (e: ArchiveEntry) => e.kind === "project" ? m.destroyProject.mutateAsync({ id: e.id }) : m.destroyItem.mutateAsync({ id: e.id });
  return (
    <ArchiveView
      entries={entries}
      busy={busy}
      project={!!projectId}
      projects={(groups.data ?? []).flatMap((g) => g.projects).map((p) => ({ id: p.id, name: p.name, icon: p.icon as IconName | null, color: projectColorVar(p.color) }))}
      onRestore={restore}
      onDelete={(e) => void run(async () => {
        if (e.kind === "project") await m.deleteProject.mutateAsync({ id: e.id });
        else await updateArchivedItem(e, { deleted: true, archived: false });
        notify({ message: `Moved ${quote(e.title)} to the Trash`, icon: "trash-2" });
      })}
      onDestroy={(e) => void run(async () => {
        await destroy(e);
        notify({ message: `Deleted ${quote(e.title)} forever`, icon: "trash-2" });
      })}
      onEmptyTrash={(es) => void run(async () => {
        let removed = 0;
        for (const e of es) {
          try { await destroy(e); removed++; }
          catch { /* Report the aggregate result; failed entries remain available to retry. */ }
        }
        notify({ message: `Deleted ${removed} of ${es.length} entries forever`, meta: removed < es.length ? `${es.length - removed} could not be deleted. Try again.` : undefined, icon: removed < es.length ? "circle-alert" : "trash-2" });
      })}
      onOpen={(e) => {
        if (e.kind === "project") void navigate({ to: "/p/$projectId", params: { projectId: e.id }, search: {} });
        else if (e.projectId) void navigate({ to: "/p/$projectId", params: { projectId: e.projectId }, search: { item: e.id } });
      }}
    />
  );
}
