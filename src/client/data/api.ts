// Typed RPC client plus the response types the views consume. One place for the "unwrap or throw"
// helper so hooks stay short. Types come from the server's route definitions (type-only import).
import { hc, type InferResponseType } from "hono/client";

import type { AppType } from "../../server/app";

// Same-origin in dev thanks to the Vite proxy; the built app is served next to the API later.
export const api = hc<AppType>("/");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Throws on a non-2xx response so TanStack Query sees an error. */
export async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* no body */
    }
    throw new ApiError(res.status, msg);
  }
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
export type MoveResult = InferResponseType<(typeof api.api.items)[":id"]["move"]["$post"], 200>;
