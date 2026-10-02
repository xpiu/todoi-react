// The Inbox as an item scope for the shared actions: its items, the move/delete/done actions with
// their undo toasts, and filing onto a project (the same move as "Move to project…"). Used by the
// Inbox screen and by the shell for drops on a sidebar project. Spec: DESIGN.md › Notifications.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { errorMessage, type Label } from "../data/api";
import { listItemsQuery } from "../data/queries";
import { quote, useFeedback } from "./feedback";
import { inboxContainer, useCurrentUser } from "./session";
import { useProjectActions } from "./useProjectActions";
import { useProjectPicker } from "./useProjectPicker";

export const INBOX_SCOPE = { listId: "inbox" } as const;
/** Inbox items carry no labels: labels belong to a project. */
export const NO_LABELS: Label[] = [];

export function useInbox(enabled = true) {
  const items = useQuery({ ...listItemsQuery(), enabled });
  const { user } = useCurrentUser();
  const container = useMemo(() => inboxContainer(user), [user]);
  const actions = useProjectActions(null, container, items.data ?? [], NO_LABELS);
  const picker = useProjectPicker("");
  const notify = useFeedback((s) => s.notify);
  /** A drop on a sidebar project: file into its first list, with the usual move toast and Undo. */
  const fileTo = async (itemId: string, projectId: string) => {
    const project = picker.projects.find((p) => p.id === projectId);
    if (!project) return;
    try {
      const [list] = await picker.loadLists(projectId);
      if (!list) notify({ message: `${quote(project.name)} has no lists yet — add one there first`, icon: "circle-alert" });
      else await actions.transfer([itemId], project, list, false);
    } catch (err) {
      notify({ message: errorMessage(err), icon: "circle-alert" });
    }
  };
  return { items, container, actions, picker, fileTo };
}
