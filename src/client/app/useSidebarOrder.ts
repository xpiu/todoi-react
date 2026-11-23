// The sidebar's arrangement on real data: the account's order (prefs.sidebarOrder) applied to the groups, reordering
// written back to the account, and a project dropped into another group moved for real — its items take new keys
// there — when the viewer may: owner of the project and of the destination group (the API's rule, access.ts).
// One toast with Undo for a group move; reordering inside the sidebar is quiet. Spec: DESIGN.md › Sidebar reordering.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { GroupWithProjects } from "../data/api";
import { useProjectMutations } from "../data/projects";
import { keys } from "../data/queries";
import { quote } from "../design/core/text";
import { moveId, moveProject, orderBy } from "../design/navigation/sidebarOrder";
import { notifyFailure, useFeedback } from "./feedback";
import { usePrefs } from "./prefs";

export function useSidebarOrder(data: GroupWithProjects[] | undefined, userId: string | undefined) {
  const saved = usePrefs((s) => s.sidebarOrder);
  const setPrefs = usePrefs((s) => s.set);
  const pm = useProjectMutations();
  const qc = useQueryClient();
  const notify = useFeedback((s) => s.notify);
  const groups = useMemo(() => (data ?? []).map((g) => ({ ...g, projects: orderBy(g.projects, saved.projects[g.id]) })), [data, saved.projects]);

  /** Its own group always takes a project; another one only for the owner of the project who also owns that group */
  const canMoveProject = useCallback(
    (projectId: string, groupId: string) => {
      const p = groups.flatMap((g) => g.projects).find((x) => x.id === projectId);
      const g = groups.find((x) => x.id === groupId);
      return !!p && !!g && (p.groupId === groupId || (p.role === "owner" && !!userId && g.ownerId === userId));
    },
    [groups, userId],
  );

  const onReorder = (top: string[]) => setPrefs({ sidebarOrder: { ...saved, top } });

  const onProjectMove = (projectId: string, groupId: string, index: number) => {
    const from = groups.find((g) => g.projects.some((p) => p.id === projectId));
    const to = groups.find((g) => g.id === groupId);
    const project = from?.projects.find((p) => p.id === projectId);
    if (!from || !to || !project) return;
    const ids = (g: { projects: Array<{ id: string }> }) => g.projects.map((p) => p.id);
    if (from.id === groupId) {
      setPrefs({ sidebarOrder: { ...saved, projects: { ...saved.projects, [groupId]: moveId(ids(to), projectId, index) } } });
      return;
    }
    if (!canMoveProject(projectId, groupId)) return;
    const before = saved;
    const cached = qc.getQueryData<GroupWithProjects[]>(keys.groups);
    // At once on screen: the row sits in its new group while the server reissues the keys
    qc.setQueryData<GroupWithProjects[]>(keys.groups, (old) => old && moveProject(old, projectId, groupId, index).map((g) => (g.id === groupId ? { ...g, projects: g.projects.map((p) => (p.id === projectId ? { ...p, groupId } : p)) } : g)));
    setPrefs({ sidebarOrder: { ...saved, projects: { ...saved.projects, [from.id]: ids(from).filter((x) => x !== projectId), [groupId]: moveId(ids(to), projectId, index) } } });
    pm.moveProjectGroup.mutate(
      { id: projectId, groupId, quiet: true },
      {
        onSuccess: (r) =>
          notify({
            message: `Moved ${quote(project.name)} to ${to.name}${r.rekeyed ? ` — its item keys now start with ${to.keyPrefix}` : ""}`,
            history: `Moved ${quote(project.name)} to ${to.name}`,
            icon: "folder-input",
            restore: async () => {
              await pm.moveProjectGroup.mutateAsync({ id: projectId, groupId: r.restore.groupId, keys: r.restore.keys, quiet: true });
              usePrefs.getState().set({ sidebarOrder: before });
            },
          }),
        onError: (err) => {
          qc.setQueryData(keys.groups, cached);
          setPrefs({ sidebarOrder: before });
          notifyFailure(err, `Couldn't move ${quote(project.name)}: `);
        },
      },
    );
  };

  return { groups, order: saved.top, onReorder, onProjectMove, canMoveProject };
}
