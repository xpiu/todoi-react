// ProjectScreen — one project in the view the URL names. List view first (the default); Board and
// Calendar follow in this phase. Spec: DESIGN.md › Views.
import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";

import type { ItemStatus } from "../../shared/item-status";
import { useLabels, useProject, useProjectItems } from "../data/queries";
import { useCreateItem, useCreateList, useMoveItem, useUpdateItem, useUpdateList } from "../data/mutations";
import { newId } from "../data/mutations";
import { EmptyState } from "../design/core/EmptyState";
import type { QuickAddResult } from "../design/core/quickAdd";
import { ViewSkeleton } from "../design/core/Skeleton";
import { ListRow } from "../design/list/ListRow";
import { ListSection } from "../design/list/ListSection";
import { ListView } from "../design/list/ListView";
import { decodeViewState } from "../design/navigation/viewState";
import { rowsForList, type Person } from "./items";
import { SEED_PEOPLE } from "./session";
import { PlaceholderScreen } from "./PlaceholderScreen";
import "./screens.css";

const projectRoute = getRouteApi("/app/p/$projectId");

export function ProjectScreen() {
  const { projectId } = projectRoute.useParams();
  const search = projectRoute.useSearch();
  const state = decodeViewState(search);
  const project = useProject(projectId);
  const items = useProjectItems(projectId);
  const labels = useLabels(projectId);
  const view = state.view ?? project.data?.defaultView ?? "list";

  if (project.isError) return <PlaceholderScreen title="Couldn't load this project" hint={project.error.message} icon="cloud-off" />;
  if (!project.data || !items.data || !labels.data) return <ViewSkeleton view={view === "board" ? "board" : "list"} lists={project.data?.lists.length ?? 3} />;
  if (view !== "list") return <PlaceholderScreen title={view === "board" ? "Board view" : "Calendar view"} hint="This view lands next in the current phase." icon={view === "board" ? "kanban" : "calendar"} />;
  return <ProjectList projectId={projectId} project={project.data} items={items.data} labels={labels.data} />;
}

function ProjectList({ projectId, project, items, labels }: { projectId: string; project: NonNullable<ReturnType<typeof useProject>["data"]>; items: NonNullable<ReturnType<typeof useProjectItems>["data"]>; labels: NonNullable<ReturnType<typeof useLabels>["data"]> }) {
  const scope = useMemo(() => ({ projectId }), [projectId]);
  const createItem = useCreateItem(scope);
  const updateItem = useUpdateItem(scope);
  const moveItem = useMoveItem(scope);
  const createList = useCreateList(projectId);
  const updateList = useUpdateList(projectId);
  // Members with names: the seed's two people until the members endpoint carries user details.
  const people: Person[] = SEED_PEOPLE;
  const quickAdd = useMemo(
    () => ({ labels: labels.map((l) => ({ text: l.name, color: l.color })), members: SEED_PEOPLE.map((p) => ({ name: p.name, nickname: p.nickname ?? undefined })), lists: project.lists.map((l) => ({ name: l.name, value: l.id })) }),
    [labels, project.lists],
  );
  const visibleLists = project.lists.filter((l) => !l.hidden);

  const addItem = (listId: string, title: string, parsed: QuickAddResult, position: "top" | "bottom") => {
    const destination = parsed.list ? (project.lists.find((l) => l.name === parsed.list)?.id ?? listId) : listId;
    const labelIds = parsed.labels.map((pl) => labels.find((l) => l.name.toLowerCase() === pl.text.toLowerCase())?.id).filter((id): id is string => !!id);
    const assigneeIds = parsed.assignee ? people.filter((p) => p.name === parsed.assignee).map((p) => p.id) : [];
    createItem.mutate({ id: newId(), title, listId: destination, priority: parsed.priority ? (parsed.priority.toUpperCase() as "URGENT" | "HIGH" | "MEDIUM" | "LOW") : undefined, dueDate: parsed.due ?? undefined, labelIds, assigneeIds, position });
  };

  if (!visibleLists.length) {
    return (
      <div className="td-screen-canvas">
        <EmptyState icon="list" title="No lists in this project yet" hint="Add a list to start collecting items, or begin with the usual three." action={{ label: "Add a list", icon: "plus", shortcut: "shift N", onClick: () => createList.mutate({ id: newId(), name: "To-do", statusRole: "TODO" }) }} secondary={{ label: "To-do · Doing · Done", onClick: () => { createList.mutate({ id: newId(), name: "To-do", statusRole: "TODO" }); createList.mutate({ id: newId(), name: "Doing", statusRole: "DOING" }); createList.mutate({ id: newId(), name: "Done", statusRole: "DONE" }); } }} />
      </div>
    );
  }

  return (
    <ListView
      onAddList={() => createList.mutate({ id: newId(), name: `List ${project.lists.length + 1}` })}
      onItemKey={(id, action) => {
        const it = items.find((x) => x.id === id);
        if (!it) return;
        if (action === "done") updateItem.mutate({ id, done: !it.done });
        else if (action.startsWith("priority-")) {
          const n = Number(action.slice(9));
          updateItem.mutate({ id, priority: n === 0 ? null : (["URGENT", "HIGH", "MEDIUM", "LOW"] as const)[n - 1]! });
        }
      }}
      onMoveItem={(id, dir) => {
        const it = items.find((x) => x.id === id);
        if (!it) return;
        const order = visibleLists.map((l) => l.id);
        const li = order.indexOf(it.listId);
        if (dir === "left" || dir === "right") {
          const target = order[li + (dir === "left" ? -1 : 1)];
          if (target) moveItem.mutate({ id, listId: target, position: it.position });
        } else {
          const next = Math.max(0, it.position + (dir === "up" ? -1 : 1));
          moveItem.mutate({ id, listId: it.listId, position: next });
        }
      }}
    >
      {visibleLists.map((list) => {
        const rows = rowsForList(items, list.id, { prefix: project.keyPrefix, labels, people });
        return (
          <ListSection
            key={list.id}
            name={list.name}
            count={rows.length}
            icon={(list.icon as "circle" | null) ?? null}
            statusRole={list.statusRole}
            quickAdd={quickAdd}
            onAddItem={(title, parsed, position) => addItem(list.id, title, parsed, position)}
            onRename={(name) => updateList.mutate({ id: list.id, name })}
            onIconChange={(icon) => updateList.mutate({ id: list.id, icon })}
            onStatusRoleChange={(role: ItemStatus | null) => updateList.mutate({ id: list.id, statusRole: role })}
            onHide={() => updateList.mutate({ id: list.id, hidden: true })}
          >
            {rows.map((r) => (
              <ListRow
                key={r.id}
                dragId={r.id}
                title={r.title}
                itemId={r.itemId}
                done={r.done}
                onDone={(done) => updateItem.mutate({ id: r.id, done })}
                labels={r.labels}
                due={r.due}
                dueState={r.dueState}
                repeat={r.repeat}
                priority={r.priority}
                assignees={r.assignees}
                subitems={r.subitems.map((s) => ({ title: s.title, itemId: s.itemId, done: s.done, dragId: `${r.id}/${s.id}`, onDone: (done: boolean) => updateItem.mutate({ id: s.id, done }) }))}
              />
            ))}
          </ListSection>
        );
      })}
    </ListView>
  );
}
