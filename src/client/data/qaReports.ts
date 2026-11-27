// QA notes (shared/qa.ts): sending one (one multipart request with the text, the page's context and the
// PNG), and the stored notes as the operator console lists them.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import type { QaContext } from "../../shared/qa";
import { api, unwrap } from "./api";

export type QaNote = InferResponseType<(typeof api.api)["qa-reports"]["$get"], 200>[number];

export async function sendQaNote(note: { text: string; context: QaContext; screenshot: Blob }): Promise<{ id: string }> {
  const form = new FormData();
  form.append("text", note.text);
  form.append("context", JSON.stringify(note.context));
  form.append("screenshot", note.screenshot, "screenshot.png");
  return unwrap<{ id: string }>(await fetch("/api/qa-reports", { method: "POST", body: form }));
}

const NOTES = ["admin", "qa-notes"] as const;
/** The newest hundred, open ones first */
export const useQaNotes = () => useQuery({ queryKey: NOTES, queryFn: ({ signal }) => api.api["qa-reports"].$get(undefined, { init: { signal } }).then((r) => unwrap<QaNote[]>(r)), refetchInterval: 30_000 });

export function useResolveQaNote() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.api["qa-reports"][":id"].resolve.$post({ param: { id } }).then((r) => unwrap<void>(r)), onSettled: () => qc.invalidateQueries({ queryKey: NOTES }) });
}
