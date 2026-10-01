// The Better Auth client: sessions, sign-in / up / out, password changes. One instance for the app.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: `${window.location.origin}/api/auth` });
export const { useSession } = authClient;

/** The session user as the UI names people (additional fields come from the server's user model). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  nickname?: string | null;
  avatarColor?: string | null;
  image?: string | null;
}
export const sessionUser = (data: { user: Record<string, unknown> } | null | undefined): SessionUser | null => {
  if (!data?.user) return null;
  const u = data.user;
  return { id: String(u.id), name: String(u.name ?? ""), email: String(u.email ?? ""), nickname: (u.nickname as string | null | undefined) ?? null, avatarColor: (u.avatarColor as string | null | undefined) ?? null, image: (u.image as string | null | undefined) ?? null };
};
