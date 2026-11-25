// The Todoi archive: everything an account can see, in one zip that Todoi can restore — every field of
// every group, project, list, item and subitem (archived and in the Trash too), labels, assignees,
// watchers, relations, comment threads with reactions, attachment files, saved views and activity.
//
//   todoi-archive.json        the manifest (this file's archiveManifestSchema)
//   projects/<id>.json        one project (archiveProjectSchema)
//   inbox.json                the account's Inbox items (archiveProjectSchema with project: null)
//   attachments/<id>          the bytes of each attachment
//
// Ids are the exporting server's; a restore gives everything new ids. People are listed once in the
// manifest and referred to by id elsewhere. The server validates every file with these schemas.
import { z } from "zod";

import { ACTIVITY_TYPES, ITEM_PRIORITIES, MEMBER_ROLES, PROJECT_VIEWS, PROJECT_VISIBILITIES, RELATION_TYPES } from "./enums";
import { ITEM_STATUSES } from "./item-status";

export const ARCHIVE_FORMAT = "todoi.archive";
export const ARCHIVE_VERSION = 1;
export const ARCHIVE_MANIFEST = "todoi-archive.json";
/** What a restore accepts in one upload (the zip, attachments included). */
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const id = z.string().min(1).max(64);
const when = z.iso.datetime({ offset: true });
const day = z.iso.date();

export const archivePersonSchema = z.object({ id, name: z.string(), email: z.string().nullable(), nickname: z.string().nullable() });
export const archiveManifestSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  version: z.literal(ARCHIVE_VERSION),
  exportedAt: when,
  /** Who exported it */
  account: z.object({ id, name: z.string(), email: z.string() }),
  people: z.array(archivePersonSchema),
  groups: z.array(z.object({ id, name: z.string().min(1), icon: z.string().nullable(), keyPrefix: z.string().min(1).max(8), position: z.number().int(), archivedAt: when.nullable(), deletedAt: when.nullable() })),
  projects: z.array(z.object({ id, groupId: id, name: z.string(), file: z.string() })),
  inbox: z.string().nullable(),
});

const itemRecord = z.object({
  id,
  listId: id,
  parentItemId: id.nullable(),
  keyNumber: z.number().int().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(ITEM_STATUSES).nullable(),
  priorStatus: z.enum(ITEM_STATUSES).nullable(),
  done: z.boolean(),
  priority: z.enum(ITEM_PRIORITIES).nullable(),
  startDate: day.nullable(),
  dueDate: day.nullable(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  repeatRule: z.record(z.string(), z.unknown()).nullable(),
  repeatCount: z.number().int(),
  cover: z.record(z.string(), z.unknown()).nullable(),
  notification: z.record(z.string(), z.unknown()).nullable(),
  unread: z.boolean(),
  position: z.number().int(),
  createdBy: id.nullable(),
  externalId: z.string().nullable(),
  syncExtra: z.record(z.string(), z.unknown()).nullable(),
  archivedAt: when.nullable(),
  deletedAt: when.nullable(),
  createdAt: when,
  labelIds: z.array(id),
  assigneeIds: z.array(id),
  watcherIds: z.array(id),
});
export const archiveProjectSchema = z.object({
  project: z
    .object({
      id,
      groupId: id,
      name: z.string().min(1),
      icon: z.string().nullable(),
      color: z.string().nullable(),
      description: z.string().nullable(),
      visibility: z.enum(PROJECT_VISIBILITIES),
      defaultView: z.enum(PROJECT_VIEWS),
      linkStatuses: z.boolean(),
      checkedMove: z.boolean().nullable(),
      position: z.number().int(),
      archivedAt: when.nullable(),
      deletedAt: when.nullable(),
      createdAt: when,
    })
    .nullable(),
  members: z.array(z.object({ userId: id, role: z.enum(MEMBER_ROLES) })),
  lists: z.array(z.object({ id, name: z.string().min(1), icon: z.string().nullable(), statusRole: z.enum(ITEM_STATUSES).nullable(), position: z.number().int(), hidden: z.boolean(), externalId: z.string().nullable() })),
  labels: z.array(z.object({ id, name: z.string().min(1), color: z.string(), position: z.number().int() })),
  items: z.array(itemRecord),
  relations: z.array(z.object({ itemId: id, targetId: id, type: z.enum(RELATION_TYPES) })),
  comments: z.array(z.object({ id, itemId: id, authorId: id, body: z.string(), replyToId: id.nullable(), editedAt: when.nullable(), createdAt: when, fileOrigin: z.record(z.string(), z.unknown()).nullable(), reactions: z.array(z.object({ userId: id, emoji: z.string().min(1).max(16) })) })),
  attachments: z.array(z.object({ id, itemId: id, name: z.string().min(1), size: z.number().int().min(0), mime: z.string().nullable(), uploadedBy: id.nullable(), createdAt: when, file: z.string() })),
  savedViews: z.array(z.object({ id, ownerId: id, name: z.string().min(1), shared: z.boolean(), definition: z.record(z.string(), z.unknown()), position: z.number().int() })),
  activity: z.array(z.object({ itemId: z.string().nullable(), actorId: id.nullable(), type: z.enum(ACTIVITY_TYPES), text: z.string(), itemKey: z.string().nullable(), createdAt: when })),
});
export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;
export type ArchiveProject = z.infer<typeof archiveProjectSchema>;
export type ArchivePerson = z.infer<typeof archivePersonSchema>;

/** What a restore will create and what it can't carry over, for the review step and the answer. */
export interface ArchiveSummary {
  groups: number;
  projects: number;
  /** Items in projects and in the Inbox */
  items: number;
  /** Of those, Inbox items (they go to the restorer's Inbox) */
  inboxItems: number;
  comments: number;
  attachments: number;
  attachmentBytes: number;
  /** Things that come back differently, in words */
  notes: string[];
  /** The archive is the restorer's own (its account has their address) */
  yours: boolean;
}

/**
 * Who in the archive is the person restoring: whoever has their email address. Restoring your own export
 * (into the same account, or a new one with the same address) keeps your work yours; anyone else's —
 * including an export someone handed you — keeps their name and date in the text.
 */
export function restoringAs(manifest: ArchiveManifest, viewer: { email: string }): Set<string> {
  const email = viewer.email.toLowerCase();
  const mine = new Set<string>();
  if (manifest.account.email.toLowerCase() === email) mine.add(manifest.account.id);
  for (const p of manifest.people) if (p.email && p.email.toLowerCase() === email) mine.add(p.id);
  return mine;
}

/** What a restore of these files creates and what comes back differently — the same sentences on the review step and in the answer. */
export function summarizeArchive(manifest: ArchiveManifest, files: ReadonlyArray<ArchiveProject>, viewer: { email: string }): ArchiveSummary {
  const mine = restoringAs(manifest, viewer);
  const projects = files.filter((f) => f.project);
  const others = new Set<string>();
  let comments = 0, attachments = 0, attachmentBytes = 0, items = 0, othersComments = 0, othersAssigned = 0, othersActivity = 0;
  for (const f of files) {
    items += f.items.length;
    comments += f.comments.length;
    attachments += f.attachments.length;
    attachmentBytes += f.attachments.reduce((n, a) => n + a.size, 0);
    for (const m of f.members) if (!mine.has(m.userId)) others.add(m.userId);
    othersComments += f.comments.filter((c) => !mine.has(c.authorId)).length;
    othersAssigned += f.items.filter((i) => i.assigneeIds.some((a) => !mine.has(a))).length;
    othersActivity += f.activity.filter((a) => a.actorId && !mine.has(a.actorId)).length;
  }
  const notes: string[] = [];
  if (others.size) notes.push(others.size === 1 ? "1 other member isn't added to the restored projects. Invite them again." : `${others.size} other members aren't added to the restored projects. Invite them again.`);
  if (othersComments) notes.push(othersComments === 1 ? "1 comment by someone else comes back under your name, starting with their name and the original date." : `${othersComments} comments by other people come back under your name, starting with their name and the original date.`);
  if (othersAssigned) notes.push(othersAssigned === 1 ? "1 item was assigned to someone else. Their name stays on it, but it's no longer assigned to them." : `${othersAssigned} items were assigned to someone else. Their names stay on them, but they're no longer assigned to them.`);
  if (othersActivity) notes.push(othersActivity === 1 ? "1 history entry by someone else (like “Sam completed this”) is left out." : `${othersActivity} history entries by other people (like “Sam completed this”) are left out.`);
  const inboxItems = files.filter((f) => !f.project).reduce((n, f) => n + f.items.length, 0);
  return { groups: manifest.groups.length, projects: projects.length, items, inboxItems, comments, attachments, attachmentBytes, notes, yours: mine.has(manifest.account.id) };
}

/** A file that isn't an export at all (not a zip, or a zip Todoi didn't write). */
export const NOT_AN_EXPORT = "This file isn't a Todoi export. Choose the .zip file that Export everything downloaded.";

/** A refused archive, in words the person can act on. */
export class ArchiveRejected extends Error {
  constructor(message: string, readonly status: 403 | 413 | 422 = 422) {
    super(message);
    this.name = "ArchiveRejected";
  }
}

/**
 * Validate an archive's JSON files: `text(name)` is a file's contents (undefined when missing), `has(name)`
 * whether a file is in the zip at all (attachment bytes needn't be read). The server and the browser's
 * review step refuse the same things with the same words.
 */
export function checkArchive(text: (name: string) => string | undefined, has: (name: string) => boolean): { manifest: ArchiveManifest; files: ArchiveProject[] } {
  const json = (name: string): unknown => {
    const raw = text(name);
    if (raw === undefined) throw new ArchiveRejected(`This export is incomplete (${name} is missing). Run Export everything again and restore the new file.`);
    try {
      return JSON.parse(raw);
    } catch {
      throw new ArchiveRejected(`This export is damaged (${name} can't be read). Run Export everything again and restore the new file.`);
    }
  };
  if (!has(ARCHIVE_MANIFEST)) throw new ArchiveRejected(NOT_AN_EXPORT);
  const raw = json(ARCHIVE_MANIFEST);
  const m = archiveManifestSchema.safeParse(raw);
  if (!m.success) {
    const version = (raw as { format?: unknown; version?: unknown } | null)?.version;
    throw new ArchiveRejected((raw as { format?: unknown } | null)?.format === ARCHIVE_FORMAT && typeof version === "number" && version > ARCHIVE_VERSION ? `This export is from a newer version of Todoi (format ${version}; this one reads ${ARCHIVE_VERSION}). Reload the page to update, then try again.` : NOT_AN_EXPORT);
  }
  const names = [...m.data.projects.map((p) => p.file), ...(m.data.inbox ? [m.data.inbox] : [])];
  const files = names.map((name) => {
    const r = archiveProjectSchema.safeParse(json(name));
    if (!r.success) throw new ArchiveRejected(`This export is damaged (${name} can't be read). Run Export everything again and restore the new file.`);
    for (const a of r.data.attachments) if (!has(a.file)) throw new ArchiveRejected(`This export is incomplete (the file for “${a.name}” is missing). Run Export everything again and restore the new file.`);
    return r.data;
  });
  return { manifest: m.data, files };
}
