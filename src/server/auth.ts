// The one place the API learns who is calling. Until Better Auth lands (plan: Phase 6) every request
// acts as the local account created by migration 0001; swap this module for the session lookup then.
import type { Context } from "hono";

export const LOCAL_USER_ID = "local_user_000000000a";
export const LOCAL_INBOX_ID = "local_inbox_00000000a";

export interface Viewer {
  userId: string;
  inboxListId: string;
}

export function viewerOf(_c: Context): Viewer {
  return { userId: LOCAL_USER_ID, inboxListId: LOCAL_INBOX_ID };
}
