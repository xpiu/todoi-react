// Notifications are Inbox items (DESIGN.md › Notifications): an assignment, an @mention in a comment,
// or a new comment on an item someone watches lands as an unread item in that person's Inbox, about
// the project item. Never for the actor themselves, never for someone who can no longer read the item,
// and never against the person's opt-outs (Settings › Notifications, stored in users.prefs). Each one is
// also emailed (work plan R10) while that kind's email switch is on and the address is confirmed (R4); the
// email leaves after the change commits, and a failed send is logged, never the request's failure.
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { itemKey, itemLink } from "../../shared/projectLinks";
import { prefsOf, type Prefs } from "../../shared/prefs";
import { inboxFor } from "../auth";
import { readableItemIds } from "../access";
import { afterCommit, db, inRequestTransaction, type Tx } from "../db";
import { nextPosition } from "../db/position";
import { groups, items, itemWatchers, members, projects, users, type ItemNotification } from "../db/schema";
import { notificationEmail, sendEmail } from "../email";
import { env } from "../env";

type Kind = "assignment" | "mention" | "watch";
const OPT_IN: Record<Kind, keyof Prefs> = { assignment: "notifyAssignments", mention: "notifyMentions", watch: "notifyWatched" };
const EMAIL_OPT_IN: Record<Kind, keyof Prefs> = { assignment: "emailAssignments", mention: "emailMentions", watch: "emailComments" };

interface About {
  id: string;
  title: string;
  projectId: string | null;
  listId: string;
  keyNumber: number | null;
}

/** An @handle as the comment composer writes it: the nickname, else the first name (DESIGN.md › Mentions). */
const handleOf = (u: { name: string; nickname: string | null }) => (u.nickname || u.name.split(/\s+/)[0] || u.name).toLowerCase();


export async function createInboxNotification(source: typeof db | Tx, listId: string, actorId: string, message: { id?: string; title: string; description?: string | null; notification: ItemNotification }) {
  const position = await nextPosition(source, items, eq(items.listId, listId));
  await source.insert(items).values({ ...message, id: message.id ?? nanoid(), title: message.title.slice(0, 500), listId, unread: true, position, createdBy: actorId }).onConflictDoNothing();
}

/** Deliver one notification to each recipient who may and wants to get it; returns who got one. */
export async function notifyPeople(kind: Kind, recipientIds: string[], actor: { userId: string; name: string }, about: About, opts: { excerpt?: string } = {}): Promise<string[]> {
  if (!about.projectId) return [];
  const ids = [...new Set(recipientIds)].filter((id) => id !== actor.userId);
  if (!ids.length) return [];
  const people = await db.select({ id: users.id, prefs: users.prefs, email: users.email, emailVerified: users.emailVerified, isAnonymous: users.isAnonymous }).from(users).where(inArray(users.id, ids));
  const [group] = await db.select({ keyPrefix: groups.keyPrefix, projectName: projects.name, slug: projects.slug }).from(projects).innerJoin(groups, eq(groups.id, projects.groupId)).where(eq(projects.id, about.projectId));
  const key = itemKey(group?.keyPrefix, about.keyNumber);
  const sent: string[] = [];
  for (const person of people) {
    const prefs = prefsOf(person.prefs);
    if (!prefs[OPT_IN[kind]]) continue;
    const inboxListId = await inboxFor(person.id);
    if (!(await readableItemIds({ userId: person.id, inboxListId }, [about])).has(about.id)) continue;
    const ref = key ? `${key}: ${about.title}` : about.title;
    const title = kind === "assignment" ? `${actor.name} assigned ${key ?? "an item"} to you: ${about.title}` : kind === "mention" ? `${actor.name} mentioned you on ${ref}` : `${actor.name} commented on ${ref}`;
    await createInboxNotification(db, inboxListId, actor.userId, {
      title,
      description: opts.excerpt ? `> ${opts.excerpt.slice(0, 400).replace(/\n/g, "\n> ")}` : null,
      notification: { kind, fromUserId: actor.userId, aboutKey: key, aboutItemId: about.id },
    });
    if (prefs[EMAIL_OPT_IN[kind]] && person.emailVerified && !person.isAnonymous) {
      const to = person.email;
      const message = notificationEmail({ kind, actorName: actor.name, itemKey: key, itemTitle: about.title, projectName: group?.projectName ?? "a project", excerpt: opts.excerpt, url: itemLink(env.APP_URL, about, group ?? null), settingsUrl: `${env.APP_URL}/settings?s=notifications` });
      await afterCommit(() => sendEmail({ to, ...message }).catch((error: unknown) => console.error(`The ${kind} email to ${to} wasn't sent`, error)));
    }
    sent.push(person.id);
  }
  return sent;
}

/** Queued operations must commit all side effects together; legacy delivery remains best effort. */
export const deliver = (work: Promise<unknown>) => work.then(() => undefined, (err: unknown) => {
  if (inRequestTransaction()) throw err;
  console.error("Notification delivery failed", err);
});

/** A new comment: @mentioned project members get "mentioned you", other watchers "commented on". */
export async function notifyComment(actor: { userId: string; name: string }, about: About, body: string) {
  if (!about.projectId) return;
  const handles = new Set([...body.matchAll(/(?:^|[^\w@])@([\w.-]+)/g)].map((m) => m[1]!.toLowerCase()));
  const people = await db.select({ id: users.id, name: users.name, nickname: users.nickname }).from(members).innerJoin(users, eq(users.id, members.userId)).where(eq(members.projectId, about.projectId));
  const mentioned = people.filter((p) => handles.has(handleOf(p))).map((p) => p.id);
  await notifyPeople("mention", mentioned, actor, about, { excerpt: body });
  const watchers = (await db.select({ userId: itemWatchers.userId }).from(itemWatchers).where(eq(itemWatchers.itemId, about.id))).map((w) => w.userId).filter((id) => !mentioned.includes(id));
  await notifyPeople("watch", watchers, actor, about, { excerpt: body });
}
