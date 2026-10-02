// MissingItem — what an item link shows when the item is not among the live items on screen: archived or
// in the Trash (Restore), inside an archived project or parent (Archive & Trash), now in another project or
// the Inbox (Open it there), gone, not yours to see, or not loaded (Retry). Never an empty overlay; Close
// always works. Spec: DESIGN.md › States.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ApiError, errorMessage } from "../data/api";
import { useUpdateItem } from "../data/mutations";
import { itemLocationQuery, keys } from "../data/queries";
import { quote, useFeedback } from "./feedback";
import { StateDialog, type StateDialogProps } from "./StateDialog";

export function MissingItem({ itemId, projectId, onClose }: { itemId: string; projectId: string | null; onClose: () => void }) {
  const found = useQuery(itemLocationQuery(itemId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const scope = projectId ? { projectId } : { listId: "inbox" };
  const updateItem = useUpdateItem(scope);
  const notify = useFeedback((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const it = found.data;
  const here = !!it && (it.projectId ?? null) === projectId;
  // Live and here, but not in the list on screen yet (made or restored elsewhere a moment ago): fetch it.
  const stale = here && it.state === "live";
  useEffect(() => {
    if (stale) void qc.invalidateQueries({ queryKey: keys.items(projectId ? { projectId } : { listId: "inbox" }) });
  }, [stale, projectId, qc]);

  const restore = async (field: "archived" | "deleted") => {
    if (!it) return;
    setBusy(true);
    setError(null);
    try {
      await updateItem.mutateAsync({ id: it.id, [field]: false, quiet: true });
      notify({ message: `Restored ${quote(it.title)}`, icon: "archive-restore", restore: () => updateItem.mutateAsync({ id: it.id, [field]: true, quiet: true }).then(() => undefined) });
    } catch (err) {
      setError(`Couldn't restore it: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };
  const openThere = () => {
    if (!it) return;
    if (it.projectId) void navigate({ to: "/p/$projectId", params: { projectId: it.projectId }, search: { item: it.id } });
    else void navigate({ to: "/inbox", search: { item: it.id } });
  };

  let title: string;
  let body: StateDialogProps["body"];
  let action: { label: string; onClick: () => void } | null = null;
  const status = found.error instanceof ApiError ? found.error.status : null;
  if (found.isPending || stale) {
    title = "Opening the item…";
    body = "pending";
  } else if (status === 404) {
    title = "This item doesn't exist";
    body = "It was deleted forever, or the link is incomplete.";
  } else if (status === 403 || status === 401) {
    title = "You can't open this item";
    body = "It belongs to a project you are not a member of.";
  } else if (found.isError || !it) {
    title = "Couldn't load this item";
    body = `${errorMessage(found.error)} Check the connection and try again.`;
    action = { label: "Retry", onClick: () => void found.refetch() };
  } else if (it.state === "archived") {
    title = `${quote(it.title)} is archived`;
    body = "Restore it to see and edit it here again.";
    action = { label: "Restore", onClick: () => void restore("archived") };
  } else if (it.state === "deleted") {
    title = `${quote(it.title)} is in the Trash`;
    body = "Restore it to see and edit it here again. Items stay in the Trash for 90 days.";
    action = { label: "Restore", onClick: () => void restore("deleted") };
  } else if (it.state === "container") {
    title = `${quote(it.title)} is inside something archived`;
    body = "Its project or parent item is archived or in the Trash. Restore that to see this item again.";
    action = { label: "Open Archive & Trash", onClick: () => void navigate({ to: "/archive", search: it.projectId ? { project: it.projectId } : {} }) };
  } else {
    title = `${quote(it.title)} is ${it.projectId ? `in ${it.projectName ?? "another project"}` : "in your Inbox"}`;
    body = `It isn't in ${projectId ? "this project" : "your Inbox"}: it was moved, or the link points elsewhere.`;
    action = { label: "Open it there", onClick: openThere };
  }
  return <StateDialog title={title} body={body} action={action} busy={busy} error={error} onClose={onClose} />;
}
