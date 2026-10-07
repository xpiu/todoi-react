// Attachment uploads in flight or failed, for this tab. Each file is its own request, so one failure never
// hides or undoes another: finished files show as attachments, failed ones stay in the item's list with
// their reason and a Retry until dismissed. Uploads continue when the overlay closes; drops on a card
// show their progress when the item is opened. Spec: DESIGN.md › Attachments.
import { create } from "zustand";

import { ApiError, errorMessage } from "../data/api";
import { settleAttachments, uploadAttachment, type Attachment } from "../data/attachments";
import { queryClient } from "../queryClient";
import { MAX_ATTACHMENT_BYTES, tooLargeMessage } from "../../shared/uploads";
import { quote, useFeedback } from "./feedback";

export interface PendingUpload {
  key: string;
  itemId: string;
  projectId: string | null;
  file: File;
  /** 0–100 while sending */
  progress: number;
  /** Set once the server stores the file, while its attachment list refreshes. */
  attachmentId?: string;
  error?: string;
  /** False when sending the same file again cannot succeed (too large, over quota, no access) */
  retriable?: boolean;
}

export const useUploads = create<{ byKey: Record<string, PendingUpload> }>()(() => ({ byKey: {} }));

const controllers = new Map<string, AbortController>();
const update = (key: string, patch: Partial<PendingUpload>) =>
  useUploads.setState(({ byKey }) => (byKey[key] ? { byKey: { ...byKey, [key]: { ...byKey[key], ...patch } } } : { byKey }));
const drop = (key: string) =>
  useUploads.setState(({ byKey }) => {
    const { [key]: _gone, ...rest } = byKey;
    return { byKey: rest };
  });
let seq = 0;

/** Send one queued file; resolves with the attachment, or null when it failed or was cancelled. */
async function send(key: string): Promise<Attachment | null> {
  const entry = useUploads.getState().byKey[key];
  if (!entry) return null;
  const controller = new AbortController();
  controllers.set(key, controller);
  update(key, { progress: 0, error: undefined, retriable: undefined });
  try {
    // The bar stops short of 100 until the server has stored the file and the list shows it.
    const made = await uploadAttachment(entry.itemId, entry.file, { signal: controller.signal, onProgress: (p) => update(key, { progress: Math.min(p, 99) }) });
    update(key, { attachmentId: made.id });
    await settleAttachments(queryClient, entry.itemId, entry.projectId);
    drop(key);
    return made;
  } catch (error) {
    if (controller.signal.aborted) drop(key);
    else update(key, { error: errorMessage(error), retriable: !(error instanceof ApiError && error.status >= 400 && error.status < 500) });
    return null;
  } finally {
    controllers.delete(key);
  }
}

/** “huge.bin is larger than 25 MB”, or “Couldn't attach “a.pdf”. Couldn't reach Todoi…” when the reason does not name the file. */
const reason = (u: PendingUpload) => (u.error!.includes(u.file.name) ? u.error! : `Couldn't attach ${quote(u.file.name)}. ${u.error}`);

/** One toast for a batch: what was attached, or what failed with a Retry for the files that can be retried. */
function report(made: Attachment[], keys: string[]) {
  const failed = keys.map((k) => useUploads.getState().byKey[k]).filter((u): u is PendingUpload => !!u?.error);
  const { notify } = useFeedback.getState();
  if (!failed.length) {
    if (made.length) notify({ message: made.length === 1 ? `Attached ${quote(made[0]!.name)}` : `Attached ${made.length} files`, icon: "paperclip" });
    return;
  }
  const retriable = failed.filter((u) => u.retriable);
  notify({
    message: failed.length === 1 ? reason(failed[0]!) : `Couldn't attach ${failed.length} files`,
    meta: failed.length > 1 && made.length ? `${made.length} attached` : undefined,
    icon: "circle-alert",
    actionLabel: retriable.length ? "Retry" : undefined,
    standalone: true,
    undo: retriable.length ? () => void retryUploads(retriable.map((u) => u.key)) : undefined,
  });
}

/** Send `keys`, then report on the whole batch (`batch` also holds files refused before sending). */
async function run(keys: string[], batch = keys) {
  const made: Attachment[] = [];
  // One at a time: progress fills row by row and a slow connection is not split across files.
  for (const key of keys) {
    const m = await send(key);
    if (m) made.push(m);
  }
  report(made, batch);
  return made;
}

/** Queue files for an item. Files over the size limit fail at once, without being sent. */
export function attachFiles(itemId: string, projectId: string | null, files: File[]): Promise<Attachment[]> {
  const entries = files.map((file): PendingUpload => {
    const tooLarge = file.size > MAX_ATTACHMENT_BYTES;
    return { key: `upload-${++seq}`, itemId, projectId, file, progress: 0, error: tooLarge ? tooLargeMessage(file.name) : undefined, retriable: tooLarge ? false : undefined };
  });
  useUploads.setState(({ byKey }) => ({ byKey: { ...byKey, ...Object.fromEntries(entries.map((e) => [e.key, e])) } }));
  return run(entries.filter((e) => !e.error).map((e) => e.key), entries.map((e) => e.key));
}

/** Send failed files again; only these, never the ones that already succeeded. */
export const retryUploads = (keys: string[]) => run(keys.filter((k) => useUploads.getState().byKey[k]?.retriable));

/** Cancel an upload in flight, or dismiss a failed one. */
export function dismissUpload(key: string) {
  controllers.get(key)?.abort();
  drop(key);
}

/** The item's queued and failed uploads, oldest first. */
export const usePendingUploads = (itemId: string) => {
  const byKey = useUploads((s) => s.byKey);
  return Object.values(byKey).filter((u) => u.itemId === itemId);
};
