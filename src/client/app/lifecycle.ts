// Which lifecycle dialog is open (New project / New group / Project settings), app-wide, so the
// sidebar, the top-bar create menu, the Projects and Groups pages and the SubNavbar can all open them.
import { create } from "zustand";

import { useProjectMutations } from "../data/projects";
import { quote, useFeedback } from "./feedback";

interface LifecycleStore {
  dialog: { kind: "project"; groupId?: string } | { kind: "group" } | { kind: "settings"; projectId: string; section?: "members" | "activity" } | null;
  openNewProject: (groupId?: string) => void;
  openNewGroup: () => void;
  openSettings: (projectId: string, section?: "members" | "activity") => void;
  close: () => void;
}

export const useLifecycle = create<LifecycleStore>()((set) => ({
  dialog: null,
  openNewProject: (groupId) => set({ dialog: { kind: "project", groupId } }),
  openNewGroup: () => set({ dialog: { kind: "group" } }),
  openSettings: (projectId, section) => set({ dialog: { kind: "settings", projectId, section } }),
  close: () => set({ dialog: null }),
}));

/**
 * Archive a project or move it to the Trash, and say so (with Undo) only once the server has done it;
 * a refusal is explained by the query client instead. `then` runs after success (leave the project's page).
 */
export function useRemoveProject() {
  const m = useProjectMutations();
  return (p: { id: string; name: string }, how: "archive" | "delete", then?: () => void) =>
    (how === "archive" ? m.archiveProject : m.deleteProject).mutate(
      { id: p.id },
      {
        onSuccess: () => {
          useFeedback.getState().notify({ message: `${how === "archive" ? "Archived" : "Deleted"} ${quote(p.name)}`, icon: how === "archive" ? "archive" : "trash-2", restore: () => m.restoreProject.mutateAsync({ id: p.id, quiet: true }) });
          then?.();
        },
      },
    );
}
