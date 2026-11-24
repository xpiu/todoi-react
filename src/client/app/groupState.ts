// Group by's per-device state (owner decision A4: not per account): which groups are collapsed, per project and
// group key, and "Show empty groups". The toolbar's Group menu and the List view both read it, so it is one small
// persisted store (localStorage "td-list-groups"), read through focused selectors. Spec: DESIGN.md › Group by.
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { GroupKey } from "../../shared/enums";

const NONE: readonly string[] = [];
const slot = (projectId: string, key: GroupKey) => `${projectId}:${key}`;

interface GroupState {
  showEmpty: boolean;
  /** Collapsed group ids by "projectId:groupKey" */
  collapsed: Record<string, readonly string[]>;
  setShowEmpty: (showEmpty: boolean) => void;
  setCollapsed: (projectId: string, key: GroupKey, ids: readonly string[]) => void;
}

export const useGroupState = create<GroupState>()(
  persist(
    (set) => ({
      showEmpty: false,
      collapsed: {},
      setShowEmpty: (showEmpty) => set({ showEmpty }),
      setCollapsed: (projectId, key, ids) =>
        set(({ collapsed }) => {
          const { [slot(projectId, key)]: _previous, ...rest } = collapsed;
          return { collapsed: ids.length ? { ...rest, [slot(projectId, key)]: [...ids] } : rest };
        }),
    }),
    { name: "td-list-groups", partialize: (s) => ({ showEmpty: s.showEmpty, collapsed: s.collapsed }) },
  ),
);

/** The collapsed group ids of one project's grouping (a stable empty array when none) */
export const useCollapsedGroups = (projectId: string, key: GroupKey | null) => useGroupState((s) => (key ? (s.collapsed[slot(projectId, key)] ?? NONE) : NONE));
