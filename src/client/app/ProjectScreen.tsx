// ProjectScreen — one project in the view the URL names: List (default), Board, Calendar.
// Spec: DESIGN.md › Views.
import { getRouteApi } from "@tanstack/react-router";
import { useRef } from "react";

import type { ItemStatus } from "../../shared/item-status";
import type { Item, Label, ProjectDetail } from "../data/api";
import { newId } from "../data/mutations";
import { useLabels, useProject, useProjectItems } from "../data/queries";
import { BoardView } from "../design/board/BoardView";
import { ItemCard } from "../design/board/ItemCard";
import { ListColumn } from "../design/board/ListColumn";
import { useItemDnd, type ItemDnd } from "../design/board/useItemDnd";
import { EmptyState } from "../design/core/EmptyState";
import type { IconName } from "../design/core/Icon";
import { ViewSkeleton } from "../design/core/Skeleton";
import { useTouchDrag } from "../design/core/touchDrag";
import { ListRow } from "../design/list/ListRow";
import { ListSection } from "../design/list/ListSection";
import { ListView } from "../design/list/ListView";
import { decodeViewState } from "../design/navigation/viewState";
import { coverOf, rowsForList } from "./items";
import { PlaceholderScreen } from "./PlaceholderScreen";
import { useProjectActions, type ProjectActions } from "./useProjectActions";
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
  const props = { projectId, project: project.data, items: items.data, labels: labels.data };
  if (view === "board") return <ProjectBoard {...props} />;
  if (view === "calendar") return <PlaceholderScreen title="Calendar view" hint="The calendar lands next in this phase." icon="calendar" />;
  return <ProjectList {...props} />;
}

interface ViewProps {
  projectId: string;
  project: ProjectDetail;
  items: Item[];
  labels: Label[];
}

function NoLists({ actions }: { actions: ProjectActions }) {
  const three = () => {
    actions.createList.mutate({ id: newId(), name: "To-do", statusRole: "TODO" });
    actions.createList.mutate({ id: newId(), name: "Doing", statusRole: "DOING" });
    actions.createList.mutate({ id: newId(), name: "Done", statusRole: "DONE" });
  };
  return (
    <div className="td-screen-canvas">
      <EmptyState icon="list" title="No lists in this project yet" hint="Add a list to start collecting items, or begin with the usual three." action={{ label: "Add a list", icon: "plus", shortcut: "shift N", onClick: () => actions.createList.mutate({ id: newId(), name: "To-do", statusRole: "TODO" }) }} secondary={{ label: "To-do · Doing · Done", onClick: three }} />
    </div>
  );
}

/** Section / column header callbacks shared by both views. */
function listCallbacks(actions: ProjectActions, listId: string) {
  return {
    onRename: (name: string) => actions.updateList.mutate({ id: listId, name }),
    onIconChange: (icon: IconName | null) => actions.updateList.mutate({ id: listId, icon }),
    onStatusRoleChange: (role: ItemStatus | null) => actions.updateList.mutate({ id: listId, statusRole: role }),
    onHide: () => actions.updateList.mutate({ id: listId, hidden: true }),
  };
}

/** The touch long-press layer drives the same slot cue and drop as native drag-and-drop. */
function useTouchItemDrag(root: React.RefObject<HTMLDivElement | null>, dnd: ItemDnd, selector: string, move: ProjectActions["move"]) {
  useTouchDrag(root, {
    selector,
    onLift: (el) => (el.getAttribute("data-drag-id")?.includes("/") ? false : undefined),
    onMove: (p, d) => {
      dnd.cueAt(p.x, p.y, d.dragId);
    },
    onDrop: (p, d) => {
      const t = dnd.cueAt(p.x, p.y, d.dragId);
      dnd.end();
      if (t && d.dragId) move(d.dragId, t);
    },
    onCancel: dnd.end,
  });
}

function ProjectList({ projectId, project, items, labels }: ViewProps) {
  const actions = useProjectActions(projectId, project, items, labels);
  const root = useRef<HTMLDivElement | null>(null);
  const dnd = useItemDnd(root, { listSelector: ".td-lsec", itemSelector: ".td-lrow[data-drag-id]", cardsSelector: ".td-lsec-body", onDrop: actions.move });
  useTouchItemDrag(root, dnd, ".td-lrow[data-drag-id]", actions.move);
  if (!actions.lists.length) return <NoLists actions={actions} />;
  return (
    <ListView ref={root} onAddList={() => actions.addList()} onItemKey={actions.onItemKey} onMoveItem={actions.onMoveItemKey} rootProps={dnd.rootProps}>
      {actions.lists.map((list) => {
        const rows = rowsForList(items, list.id, { prefix: project.keyPrefix, labels, people: actions.people });
        return (
          <ListSection key={list.id} listId={list.id} name={list.name} count={rows.length} icon={(list.icon as IconName | null) ?? null} statusRole={list.statusRole} quickAdd={actions.quickAdd} onAddItem={(title, parsed, position) => actions.addItem(list.id, title, parsed, position)} {...listCallbacks(actions, list.id)}>
            {rows.map((r) => (
              <ListRow
                key={r.id}
                dragId={r.id}
                title={r.title}
                itemId={r.itemId}
                done={r.done}
                onDone={(done) => actions.setDone(r.id, done)}
                labels={r.labels}
                due={r.due}
                dueState={r.dueState}
                repeat={r.repeat}
                priority={r.priority}
                assignees={r.assignees}
                subitems={r.subitems.map((s) => ({ title: s.title, itemId: s.itemId, done: s.done, dragId: `${r.id}/${s.id}`, onDone: (done: boolean) => actions.setDone(s.id, done) }))}
              />
            ))}
          </ListSection>
        );
      })}
    </ListView>
  );
}

function ProjectBoard({ projectId, project, items, labels }: ViewProps) {
  const actions = useProjectActions(projectId, project, items, labels);
  const root = useRef<HTMLDivElement | null>(null);
  const dnd = useItemDnd(root, { listSelector: ".td-list", itemSelector: ".td-card[data-drag-id]", cardsSelector: ".td-list-cards", onDrop: actions.move });
  useTouchItemDrag(root, dnd, ".td-card[data-drag-id]", actions.move);
  if (!actions.lists.length) return <NoLists actions={actions} />;
  return (
    <BoardView ref={root} onAddList={() => actions.addList()} onItemKey={actions.onItemKey} onMoveItem={actions.onMoveItemKey} rootProps={dnd.rootProps}>
      {actions.lists.map((list) => {
        const rows = rowsForList(items, list.id, { prefix: project.keyPrefix, labels, people: actions.people });
        return (
          <ListColumn key={list.id} listId={list.id} name={list.name} count={rows.length} icon={(list.icon as IconName | null) ?? null} statusRole={list.statusRole} quickAdd={actions.quickAdd} onAddItem={(title, parsed) => actions.addItem(list.id, title, parsed)} {...listCallbacks(actions, list.id)}>
            {rows.map((r) => {
              const it = items.find((x) => x.id === r.id);
              return (
                <ItemCard
                  key={r.id}
                  dragId={r.id}
                  title={r.title}
                  itemId={r.itemId}
                  done={r.done}
                  labels={r.labels}
                  due={r.due}
                  dueState={r.dueState}
                  repeat={r.repeat}
                  priority={r.priority}
                  assignees={r.assignees}
                  cover={coverOf(it)}
                  badges={{ description: !!it?.description, checklist: r.subitems.length ? { done: r.subitems.filter((s) => s.done).length, total: r.subitems.length } : undefined }}
                  onMenuAction={(action) => {
                    if (action === "Delete") actions.remove(r.id);
                  }}
                />
              );
            })}
          </ListColumn>
        );
      })}
    </BoardView>
  );
}
