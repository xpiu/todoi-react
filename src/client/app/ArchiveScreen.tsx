// Archive and Trash on real data, account-wide or scoped to one project (?project=). Restore puts
// things back where they were; Delete forever is the explicit, inline-confirmed step.
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

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
  if (archive.isError) return <LoadFailed what="the archive" error={archive.error} onRetry={() => void archive.refetch()} />;
  if (!archive.data) return <ViewSkeleton view="list" lists={1} />;
  const entries: ArchiveEntry[] = [
    ...archive.data.projects.map((p) => ({ id: p.id, kind: "project" as const, removed: p.deletedAt ? ("deleted" as const) : ("archived" as const), title: p.name, at: p.deletedAt ?? p.archivedAt, icon: p.icon as IconName | null, color: projectColorVar(p.color), groupName: p.groupName ?? undefined })),
    ...archive.data.items.map((it) => ({ id: it.id, kind: "item" as const, removed: it.deletedAt ? ("deleted" as const) : ("archived" as const), title: it.title, key: it.keyNumber != null && it.keyPrefix ? `${it.keyPrefix}-${it.keyNumber}` : undefined, at: it.deletedAt ?? it.archivedAt, done: it.done, projectId: it.projectId ?? undefined, projectName: it.projectName ?? undefined, listName: it.listName ?? undefined })),
  ];
  const restore = (e: ArchiveEntry) => {
    if (e.kind === "project") m.restoreProject.mutate({ id: e.id });
    else updateItem.mutate(e.removed === "deleted" ? { id: e.id, deleted: false } : { id: e.id, archived: false }, { onSettled: () => m.refresh(e.projectId) });
    notify({ message: `Restored ${quote(e.title)}${e.listName ? ` to ${e.listName}` : ""}`, icon: "archive-restore", restore: () => (e.kind === "project" ? (e.removed === "deleted" ? m.deleteProject : m.archiveProject).mutate({ id: e.id }) : updateItem.mutate(e.removed === "deleted" ? { id: e.id, deleted: true } : { id: e.id, archived: true }, { onSettled: () => m.refresh(e.projectId) })) });
  };
  return (
    <ArchiveView
      entries={entries}
      project={!!projectId}
      projects={(groups.data ?? []).flatMap((g) => g.projects).map((p) => ({ id: p.id, name: p.name, icon: p.icon as IconName | null, color: projectColorVar(p.color) }))}
      onRestore={restore}
      onDelete={(e) => {
        if (e.kind === "project") m.deleteProject.mutate({ id: e.id });
        else updateItem.mutate({ id: e.id, deleted: true, archived: false }, { onSettled: () => m.refresh(e.projectId) });
        notify({ message: `Moved ${quote(e.title)} to the Trash`, icon: "trash-2" });
      }}
      onDestroy={(e) => {
        if (e.kind === "project") m.destroyProject.mutate({ id: e.id });
        else m.destroyItem.mutate({ id: e.id });
        notify({ message: `Deleted ${quote(e.title)} forever`, icon: "trash-2" });
      }}
      onEmptyTrash={(es) => {
        es.forEach((e) => (e.kind === "project" ? m.destroyProject.mutate({ id: e.id }) : m.destroyItem.mutate({ id: e.id })));
        notify({ message: `Emptied the Trash — ${es.length} ${es.length === 1 ? "entry" : "entries"} gone`, icon: "trash-2" });
      }}
      onOpen={(e) => {
        if (e.kind === "project") void navigate({ to: "/p/$projectId", params: { projectId: e.id }, search: {} });
        else if (e.projectId) void navigate({ to: "/p/$projectId", params: { projectId: e.projectId }, search: { item: e.id } });
      }}
    />
  );
}
