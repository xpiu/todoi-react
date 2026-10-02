// Attachment mutations: upload (multipart), rename, delete. Settle by refetching the item's details
// and the project's items (the card badge count).
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type ItemDetails } from "./api";
import { keys } from "./queries";

export type Attachment = ItemDetails["attachments"][number];
/** The served file (inline) and the download variant. */
export const attachmentUrl = (id: string, download = false) => `/api/attachments/${id}/file${download ? "?download" : ""}`;

export function useAttachmentMutations(itemId: string, projectId: string | null) {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: keys.itemDetails(itemId) });
    void qc.invalidateQueries({ queryKey: keys.items(projectId ? { projectId } : { listId: "inbox" }) });
    void qc.invalidateQueries({ queryKey: ["activity"] });
  };
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append("files", f, f.name);
      const res = await fetch(`/api/items/${itemId}/attachments`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`);
      return (await res.json()) as Attachment[];
    },
    onSettled: settle,
  });
  const rename = useMutation({ mutationFn: (vars: { id: string; name: string }) => api.api.attachments[":id"].$patch({ param: { id: vars.id }, json: { name: vars.name } }).then((r) => unwrap<Attachment>(r)), onSettled: settle });
  const remove = useMutation({ mutationFn: (vars: { id: string }) => api.api.attachments[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)), onSettled: settle });
  return { upload, rename, remove };
}
