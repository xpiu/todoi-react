// Attachment requests: upload (one multipart request per file, with progress), rename, delete. Settle
// by refetching the item's details and the project's items (the card badge count).
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { ApiError, api, unwrap, type ItemDetails } from "./api";
import { keys } from "./queries";

export type Attachment = ItemDetails["attachments"][number];
/** The served file (inline) and the download variant. */
export const attachmentUrl = (id: string, download = false) => `/api/attachments/${id}/file${download ? "?download" : ""}`;

/** Refetch what shows an item's files; resolves once the details include the change. */
export const settleAttachments = (qc: QueryClient, itemId: string, projectId: string | null) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.itemDetails(itemId) }),
    projectId ? qc.invalidateQueries({ queryKey: keys.items({ projectId }) }) : null,
    qc.invalidateQueries({ queryKey: ["activity"] }),
  ]);

/**
 * Upload one file. XHR rather than fetch, because only XHR reports upload progress. Rejects with an
 * ApiError (the server's reason), a TypeError when the request never arrived, or an AbortError.
 */
export function uploadAttachment(itemId: string, file: File, { onProgress, signal }: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}) {
  return new Promise<Attachment>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/items/${itemId}/attachments`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.((e.loaded / e.total) * 100);
    xhr.onload = () => {
      const body = xhr.response as Attachment[] | { error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && Array.isArray(body) && body[0]) resolve(body[0]);
      else reject(new ApiError(xhr.status, (body && !Array.isArray(body) && body.error) || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append("files", file, file.name);
    xhr.send(form);
  });
}

export function useAttachmentMutations(itemId: string, projectId: string | null) {
  const qc = useQueryClient();
  const settle = () => void settleAttachments(qc, itemId, projectId);
  const rename = useMutation({ mutationFn: (vars: { id: string; name: string }) => api.api.attachments[":id"].$patch({ param: { id: vars.id }, json: { name: vars.name } }).then((r) => unwrap<Attachment>(r)), onSettled: settle });
  const remove = useMutation({ mutationFn: (vars: { id: string }) => api.api.attachments[":id"].$delete({ param: vars }).then((r) => unwrap<void>(r)), onSettled: settle });
  return { rename, remove };
}
