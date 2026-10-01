// Which lifecycle dialog is open (New project / New group / Project settings), app-wide, so the
// sidebar, the top-bar create menu, the Projects and Groups pages and the SubNavbar can all open them.
import { create } from "zustand";

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
