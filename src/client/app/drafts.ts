// Unsent comment and unsaved description drafts, per item, for this tab: closing the overlay or opening
// another item keeps them, reopening the item brings them back, and only a confirmed save or an
// explicit discard (Cancel, an emptied composer) removes them. Spec: DESIGN.md › Item overlay.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { OverlayDrafts as ItemDrafts } from "../design/overlay/ItemOverlay";

const empty = (d: ItemDrafts) => !d.comment?.trim() && d.description == null;

export const useDrafts = create<{ byItem: Record<string, ItemDrafts>; set: (itemId: string, drafts: ItemDrafts) => void }>()(
  persist(
    (set) => ({
      byItem: {},
      set: (itemId, drafts) =>
        set(({ byItem }) => {
          const { [itemId]: _previous, ...rest } = byItem;
          return { byItem: empty(drafts) ? rest : { ...rest, [itemId]: drafts } };
        }),
    }),
    { name: "td-drafts", storage: createJSONStorage(() => sessionStorage), partialize: (s) => ({ byItem: s.byItem }) },
  ),
);
