// Typed RPC client plus the response types the views consume. One place for the "unwrap or throw"
// helper so hooks stay short. Types come from the server's route definitions (type-only import).
import { hc, type InferResponseType } from "hono/client";

import type { AppType } from "../../server/app";
import { codeForStatus, type ErrorBody, type ErrorCode } from "../../shared/errors";

// Same-origin in dev thanks to the Vite proxy; the built app is served next to the API later.
export const api = hc<AppType>("/");

/** A refusal or failure from the API, as the shared `ErrorBody` describes it (src/shared/errors.ts). */
export class ApiError extends Error {
  readonly code: ErrorCode;
  /** What is wrong with each input field, by path ("name", "lists.0.name") */
  readonly fields: Record<string, string>;
  /** Matches the server's log line for this request */
  readonly requestId: string | undefined;
  constructor(
    public status: number,
    message: string,
    detail: { code?: ErrorCode; fields?: Record<string, string>; requestId?: string } = {},
  ) {
    super(message);
    this.code = detail.code ?? codeForStatus(status);
    this.fields = detail.fields ?? {};
    this.requestId = detail.requestId;
  }
}

/** What a status means when the response carried no message of its own (a proxy page, an empty body). */
function statusMessage(status: number): string {
  if (status === 401) return "Your session has ended. Sign in again to continue.";
  if (status === 403) return "You don't have access to do that.";
  if (status === 404) return "That isn't there anymore. It may have been moved or deleted.";
  if (status === 409) return "That changed in the meantime. Refresh and try again.";
  if (status === 413) return "That's too large to send.";
  if (status >= 500) return "Todoi couldn't finish that. Try again in a moment.";
  return "That change isn't valid.";
}

/** The error a failed response describes; tolerates bodies that are not the API's shape. */
export async function apiError(res: Response): Promise<ApiError> {
  let body: Partial<ErrorBody> | null = null;
  try {
    body = (await res.json()) as Partial<ErrorBody>;
  } catch {
    /* not JSON: a proxy error page or an empty body */
  }
  return fromErrorBody(res.status, body, res.headers.get("x-request-id") ?? undefined);
}

/** Shared with the XHR upload path, which reads its body itself. */
export function fromErrorBody(status: number, body: Partial<ErrorBody> | null | undefined, requestId?: string): ApiError {
  const message = typeof body?.error === "string" && body.error ? body.error : statusMessage(status);
  return new ApiError(status, message, { code: body?.code, fields: body?.fields, requestId: body?.requestId || requestId });
}

/** A failed request in words for the person: the server's reason, or that it never arrived. Server faults carry a short reference to quote. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.status >= 500 && err.requestId ? `${err.message} (ref ${err.requestId.slice(0, 8)})` : err.message;
  if (err instanceof TypeError) return "Couldn't reach Todoi. Check your connection.";
  return err instanceof Error && err.message ? err.message : "Something went wrong.";
}

/** `.catch(explain)`: rethrow as the person-facing reason, for a component that shows it next to the work (InlineError). */
export function explain(err: unknown): never {
  throw new Error(errorMessage(err));
}

/** Throws on a non-2xx response so TanStack Query sees an error. */
export async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) throw await apiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type GroupWithProjects = InferResponseType<typeof api.api.groups.$get, 200>[number];
export type Project = GroupWithProjects["projects"][number];
export type ProjectDetail = InferResponseType<(typeof api.api.projects)[":id"]["$get"], 200>;
export type List = ProjectDetail["lists"][number];
export type Item = InferResponseType<typeof api.api.items.$get, 200>[number];
export type Label = InferResponseType<typeof api.api.labels.$get, 200>[number];
export type InviteDetail = InferResponseType<(typeof api.api.invites)[":code"]["$get"], 200>;
export type ActivityEntry = InferResponseType<typeof api.api.activity.$get, 200>[number];
export type ItemDetails = InferResponseType<(typeof api.api.items)[":id"]["details"]["$get"], 200>;
export type UpdatedItem = InferResponseType<(typeof api.api.items)[":id"]["$patch"], 200>;
export type MoveResult = InferResponseType<(typeof api.api.items)[":id"]["move"]["$post"], 200>;
export type ItemLocation = InferResponseType<(typeof api.api.items)[":id"]["$get"], 200>;
export type DuplicateResult = InferResponseType<(typeof api.api.items)[":id"]["duplicate"]["$post"], 201>;
export type SearchHit = InferResponseType<typeof api.api.search.$get, 200>[number];
