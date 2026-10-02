// The Better Auth client: sessions, sign-in / up / out, password changes. One instance for the app.
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

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
    if (session.error) throw new SessionStartError(failure("session", session.error));
    if (session.data) return;
    const result = await authClient.signIn.anonymous();
    if (result.error) throw new SessionStartError(failure("guest", result.error));
  };
  openingSession ??= (async () => {
    if (navigator.locks) await navigator.locks.request("todoi-session", open);
    else await open();
  })()
    .then(() => { sessionReady = true; })
    .catch((e: unknown) => { throw e instanceof SessionStartError ? e : new SessionStartError(failure("session", { message: e instanceof Error ? e.message : String(e) })); })
    .finally(() => { openingSession = undefined; });
  return openingSession;
}

/** After a sign-out without a page reload: the next app route checks the session again. */
export const forgetBrowserSession = () => {
  sessionReady = false;
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
