// Who is signed in, and the people a project can name (its members).
import { sessionUser, useSession, type SessionUser } from "../auth";
import type { ProjectDetail } from "../data/api";
import type { Person } from "./items";

export type { SessionUser };

/** The signed-in person, or null while the session loads / when signed out. */
export function useCurrentUser(): { user: SessionUser | null; pending: boolean } {
  const s = useSession();
  return { user: sessionUser(s.data as { user: Record<string, unknown> } | null), pending: s.isPending };
}

export const avatarColorVar = (c: string | null | undefined) => (c ? `var(--label-${c})` : undefined);

/** A project's members as the views' Person shape. */
export function peopleOf(project: Pick<ProjectDetail, "members"> | null | undefined): Person[] {
  return (project?.members ?? []).map((m) => ({ id: m.userId, name: m.name, nickname: m.nickname, avatarColor: m.avatarColor }));
}
