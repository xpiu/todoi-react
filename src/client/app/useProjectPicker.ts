// The other projects as the ProjectPicker wants them (from the sidebar's groups), with lists fetched on demand.
import { useQueryClient } from "@tanstack/react-query";

import { projectQuery, useGroups } from "../data/queries";
import type { IconName } from "../design/core/Icon";
import type { PickableList, PickableProject } from "../design/core/ProjectPicker";

export function useProjectPicker(currentProjectId: string) {
  const groups = useGroups();
  const qc = useQueryClient();
  const projects: PickableProject[] = (groups.data ?? []).flatMap((g) => g.projects.filter((p) => p.id !== currentProjectId).map((p) => ({ id: p.id, name: p.name, icon: (p.icon as IconName | null) ?? "kanban", color: p.color ? `var(--label-${p.color})` : undefined, group: g.name })));
  const loadLists = async (projectId: string): Promise<PickableList[]> => {
    const detail = await qc.fetchQuery(projectQuery(projectId));
    return detail.lists.filter((l) => !l.hidden).map((l) => ({ id: l.id, name: l.name, icon: (l.icon as IconName | null) ?? null }));
  };
  return { projects, loadLists };
}
