// Who is signed in, and the people a project can name (its members).
import { sessionUser, useSession, type SessionUser } from "../auth";
import type { ProjectDetail } from "../data/api";
import type { Person } from "./items";
import { useSyncState } from "../data/sync";

export type { SessionUser };

/** The signed-in person, or null while the session loads / when signed out. */
export function useCurrentUser(): { user: SessionUser | null; pending: boolean } {
  const s = useSession();
  const localUser = useSyncState((state) => state.user);
  // An explicit signed-out response wins over a cached identity. Device identity is only a
  // fallback while checking the session or when the server cannot answer that check.
  const unavailable = s.isPending || !!s.error && (!s.error.status || s.error.status >= 500);
  const user = sessionUser(s.data as { user: Record<string, unknown> } | null) ?? (unavailable ? localUser : null);
  return { user, pending: s.isPending && !user };
}

export const avatarColorVar = (c: string | null | undefined) => (c ? `var(--label-${c})` : undefined);

/** Where items live, as the shared actions and the overlay need it: a project, or the Inbox (`inboxContainer`). */
export interface ItemContainer {
  keyPrefix: string;
  linkStatuses: boolean;
  lists: ProjectDetail["lists"];
  members: Array<Pick<ProjectDetail["members"][number], "userId" | "name" | "nickname" | "avatarColor">>;
}

/** The Inbox as an item container: no key prefix, no lists to pick, only its owner. */
export const inboxContainer = (user: SessionUser | null): ItemContainer => ({ keyPrefix: "", linkStatuses: false, lists: [], members: user ? [{ userId: user.id, name: user.name, nickname: user.nickname ?? null, avatarColor: user.avatarColor ?? null }] : [] });

/** A project's members as the views' Person shape. */
export function peopleOf(project: Pick<ItemContainer, "members"> | null | undefined): Person[] {
  return (project?.members ?? []).map((m) => ({ id: m.userId, name: m.name, nickname: m.nickname, avatarColor: m.avatarColor }));
}
