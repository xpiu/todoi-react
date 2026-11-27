import { and, eq, isNotNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { emailsTo } from "../../../tests/integration/accounts";
import { inboxFor } from "../auth";
import { db } from "../db";
import { env } from "../env";
import { groups, items, itemWatchers, lists, members, projects, users } from "../db/schema";
import { notifyComment, notifyPeople } from "./notifications";

/** A project with an author, a teammate (@sam), a watcher who opted out, and an outsider. */
async function fixture() {
  const author = nanoid(), sam = nanoid(), quiet = nanoid(), outsider = nanoid();
  await db.insert(users).values([
    { id: author, name: "Todoi", email: `${author}@example.test` },
    { id: sam, name: "Sam Verhoeven", nickname: "sammy", email: `${sam}@example.test` },
    { id: quiet, name: "Quinn Quiet", email: `${quiet}@example.test`, prefs: { notifyWatched: false, notifyAssignments: false } },
    { id: outsider, name: "Olga Outside", email: `${outsider}@example.test` },
  ]);
  const group = nanoid(), project = nanoid(), list = nanoid(), item = nanoid();
  await db.insert(groups).values({ id: group, name: "G", keyPrefix: "NT", ownerId: author });
  const [{ slug } = { slug: "" }] = await db.insert(projects).values({ id: project, groupId: group, name: "Rotor shop" }).returning({ slug: projects.slug });
  await db.insert(lists).values({ id: list, projectId: project, name: "To do" });
  await db.insert(members).values([author, sam, quiet].map((userId) => ({ projectId: project, userId, role: "editor" as const })));
  await db.insert(items).values({ id: item, projectId: project, listId: list, title: "Order blades", keyNumber: 7 });
  const [about] = await db.select().from(items).where(eq(items.id, item));
  return { author: { userId: author, name: "Todoi" }, sam, quiet, outsider, about: about!, slug };
}
const inboxOf = async (userId: string) => db.select().from(items).where(and(eq(items.listId, await inboxFor(userId)), isNotNull(items.notification)));

describe("notifications", () => {
  it("assignments reach new assignees who can read the item and want them", async () => {
    const f = await fixture();
    const sent = await notifyPeople("assignment", [f.sam, f.quiet, f.outsider, f.author.userId], f.author, f.about);
    expect(sent).toEqual([f.sam]);
    const [n] = await inboxOf(f.sam);
    expect(n).toMatchObject({ title: "Todoi assigned NT-7 to you: Order blades", unread: true, notification: { kind: "assignment", fromUserId: f.author.userId, aboutKey: "NT-7", aboutItemId: f.about.id } });
    expect(await inboxOf(f.quiet)).toHaveLength(0);
    expect(await inboxOf(f.outsider)).toHaveLength(0);
    expect(await inboxOf(f.author.userId)).toHaveLength(0);
  });

  it("a comment notifies @mentioned members once and other watchers, honouring opt-outs", async () => {
    const f = await fixture();
    await db.insert(itemWatchers).values([f.sam, f.quiet, f.author.userId].map((userId) => ({ itemId: f.about.id, userId })));
    await notifyComment(f.author, f.about, "@sammy can you check the price? cc @olga");
    const samInbox = await inboxOf(f.sam);
    expect(samInbox.map((n) => n.notification?.kind)).toEqual(["mention"]);
    expect(samInbox[0]).toMatchObject({ title: "Todoi mentioned you on NT-7: Order blades", description: "> @sammy can you check the price? cc @olga" });
    // The watcher opted out of watched items; the outsider is not a member; the author never notifies themself.
    expect(await inboxOf(f.quiet)).toHaveLength(0);
    expect(await inboxOf(f.outsider)).toHaveLength(0);
    expect(await inboxOf(f.author.userId)).toHaveLength(0);

    await db.update(users).set({ prefs: { notifyWatched: true } }).where(eq(users.id, f.quiet));
    await notifyComment(f.author, f.about, "Ordered.");
    expect((await inboxOf(f.quiet)).map((n) => n.title)).toEqual(["Todoi commented on NT-7: Order blades"]);
    expect(await inboxOf(f.sam)).toHaveLength(2);
  });

  it("Inbox items notify nobody", async () => {
    const f = await fixture();
    expect(await notifyPeople("assignment", [f.sam], f.author, { ...f.about, projectId: null })).toEqual([]);
  });

  it("emails confirmed recipients as well, per kind, after the Inbox item (R10)", async () => {
    const f = await fixture();
    const [sam] = await db.update(users).set({ emailVerified: true }).where(eq(users.id, f.sam)).returning({ email: users.email });
    await notifyPeople("assignment", [f.sam], f.author, f.about);
    const [mail] = await emailsTo(sam!.email);
    expect(mail).toMatchObject({ subject: "Todoi assigned NT-7 to you: Order blades", link: `${env.APP_URL}/${f.slug}?item=NT-7` });
    expect(mail!.text).toContain("Todoi assigned NT-7: Order blades to you in Rotor shop.");

    // Comments on watched items are off by default; mentions are on.
    await db.insert(itemWatchers).values({ itemId: f.about.id, userId: f.sam });
    await notifyComment(f.author, f.about, "Ordered.");
    expect(await emailsTo(sam!.email)).toHaveLength(1);
    await notifyComment(f.author, f.about, "@sammy the blades shipped");
    expect((await emailsTo(sam!.email)).map((m) => m.subject)).toEqual(["Todoi assigned NT-7 to you: Order blades", "Todoi mentioned you on NT-7: Order blades"]);

    // The switch off: the Inbox item still arrives, the email doesn't.
    await db.update(users).set({ prefs: { emailAssignments: false } }).where(eq(users.id, f.sam));
    expect(await notifyPeople("assignment", [f.sam], f.author, f.about)).toEqual([f.sam]);
    expect(await emailsTo(sam!.email)).toHaveLength(2);
  });

  it("never emails an address that isn't confirmed (R4)", async () => {
    const f = await fixture();
    const [sam] = await db.select({ email: users.email }).from(users).where(eq(users.id, f.sam));
    expect(await notifyPeople("assignment", [f.sam], f.author, f.about)).toEqual([f.sam]);
    expect(await emailsTo(sam!.email)).toHaveLength(0);
  });
});
