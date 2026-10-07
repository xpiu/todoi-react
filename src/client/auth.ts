// The Better Auth client: sessions, sign-in / up / out, password changes. One instance for the app.
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { clearSyncOwner, openSyncOwner, restoreOfflineOwner, retrySync, useSyncState } from "./data/sync";

export const authClient = createAuthClient({ baseURL: `${window.location.origin}/api/auth`, plugins: [anonymousClient()] });
export const { useSession } = authClient;

let openingSession: Promise<void> | undefined;
let sessionReady = false;
/** The browser session (a guest workspace on first visit) could not be opened; the app frame's error screen says so. */
export class SessionStartError extends Error {}
/** The reason a session step failed, for the error screen's detail line ("Session check: 503 Service Unavailable"). */
const failure = (step: "session" | "guest", e: { message?: string; status?: number; statusText?: string }) =>
  `${step === "session" ? "Session check" : "Guest workspace"}: ${e.message || [e.status, e.statusText].filter(Boolean).join(" ") || "no answer"}`;
/** Route preloads and tabs share one guest session instead of creating competing workspaces. */
export function ensureBrowserSession(): Promise<void> {
  // Once per page load: in-app navigation must not need the network (offline it would fail the whole
  // route), and a session that expires later shows up as refused saves. Sign-out reloads the page.
  if (sessionReady) return Promise.resolve();
  const open = async () => {
    const session = await authClient.getSession();
    if (session.error) {
      if ((!session.error.status || session.error.status >= 500) && await restoreOfflineOwner()) return;
      throw new SessionStartError(failure("session", session.error));
    }
    if (session.data) {
      await openSyncOwner(sessionUser(session.data as unknown as { user: Record<string, unknown> })!);
      return;
    }
    const result = await authClient.signIn.anonymous();
    if (result.error) throw new SessionStartError(failure("guest", result.error));
    const ready = await authClient.getSession();
    if (!ready.data) throw new SessionStartError("Couldn't open your guest workspace.");
    await openSyncOwner(sessionUser(ready.data as unknown as { user: Record<string, unknown> })!);
  };
  openingSession ??= (async () => {
    if (navigator.locks) await navigator.locks.request("todoi-session", open);
    else await open();
  })()
    .then(() => { sessionReady = true; })
    .catch(async (e: unknown) => {
      if (!(e instanceof SessionStartError) && (e instanceof TypeError || !navigator.onLine) && await restoreOfflineOwner()) { sessionReady = true; return; }
      throw e instanceof SessionStartError ? e : new SessionStartError(failure("session", { message: e instanceof Error ? e.message : String(e) }));
    })
    .finally(() => { openingSession = undefined; });
  return openingSession;
}

/** Linking deletes the guest identity. Finish its durable queue before transferring ownership. */
export async function syncGuestBeforeAuth(): Promise<string | null> {
  const message = "Sync your saved guest changes before signing in. Reconnect or review them in Storage & sync, then try again.";
  try {
    const session = await authClient.getSession();
    const user = sessionUser(session.data as unknown as { user: Record<string, unknown> } | null);
    if (session.error) return "Couldn’t check your current session. Try again before transferring your guest changes.";
    if (!user?.isAnonymous) return null;
    await openSyncOwner(user);
    await retrySync();
    return useSyncState.getState().operations.length || useSyncState.getState().persisting ? message : null;
  } catch (error) {
    return error instanceof Error ? error.message : "Couldn't check your saved guest changes. Try again.";
  }
}

/** After a sign-out without a page reload: the next app route checks the session again. */
export const forgetBrowserSession = () => {
  sessionReady = false;
  clearSyncOwner();
};

/** The session user as the UI names people (additional fields come from the server's user model). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isAnonymous: boolean;
  nickname?: string | null;
  avatarColor?: string | null;
  image?: string | null;
}
export const sessionUser = (data: { user: Record<string, unknown> } | null | undefined): SessionUser | null => {
  if (!data?.user) return null;
  const u = data.user;
  return { id: String(u.id), name: String(u.name ?? ""), email: String(u.email ?? ""), isAnonymous: u.isAnonymous === true, nickname: (u.nickname as string | null | undefined) ?? null, avatarColor: (u.avatarColor as string | null | undefined) ?? null, image: (u.image as string | null | undefined) ?? null };
};
