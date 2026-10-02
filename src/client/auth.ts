// The Better Auth client: sessions, sign-in / up / out, password changes. One instance for the app.
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ baseURL: `${window.location.origin}/api/auth`, plugins: [anonymousClient()] });
export const { useSession } = authClient;

let openingSession: Promise<void> | undefined;
/** Route preloads and tabs share one guest session instead of creating competing workspaces. */
export function ensureBrowserSession(): Promise<void> {
  const open = async () => {
    const session = await authClient.getSession();
    if (session.error) throw new Error(session.error.message ?? "Could not open your workspace");
    if (session.data) return;
    const result = await authClient.signIn.anonymous();
    if (result.error) throw new Error(result.error.message ?? "Could not open your workspace");
  };
  openingSession ??= (async () => {
    if (navigator.locks) await navigator.locks.request("todoi-session", open);
    else await open();
  })().finally(() => { openingSession = undefined; });
  return openingSession;
}

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
