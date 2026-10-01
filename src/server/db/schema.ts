// Todoi data model (Drizzle ORM, PostgreSQL). Vocabulary and column rationale: docs/design/glossary.md.
// Conventions: app-generated text ids (nanoid), timestamptz created_at / updated_at on every table,
// soft removal as two timestamps (archived_at, deleted_at), enums mirroring the const arrays in src/shared/.
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, time, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { ACTIVITY_TYPES, ITEM_PRIORITIES, LIST_KINDS, MEMBER_ROLES, PROJECT_VIEWS, PROJECT_VISIBILITIES, RELATION_TYPES } from "../../shared/enums";
import { ITEM_STATUSES } from "../../shared/item-status";
import type { RepeatRule } from "../../shared/items";

export const itemStatusEnum = pgEnum("item_status", ITEM_STATUSES);
export const itemPriorityEnum = pgEnum("item_priority", ITEM_PRIORITIES);
export const projectVisibilityEnum = pgEnum("project_visibility", PROJECT_VISIBILITIES);
export const projectViewEnum = pgEnum("project_view", PROJECT_VIEWS);
export const listKindEnum = pgEnum("list_kind", LIST_KINDS);
export const memberRoleEnum = pgEnum("member_role", MEMBER_ROLES);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Lifecycle: archived = out of the way but kept; deleted = in the Trash for TRASH_RETENTION_DAYS. */
const lifecycle = {
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// ── Account ────────────────────────────────────────────────────────────────────
// The spec's "Account" is a person. Columns follow Better Auth's `user` model (id, name, email,
// emailVerified, image, timestamps) so the auth layer can adopt this table later; the extras are ours.
// ── Better Auth tables (session, account, verification) — column names follow its models ───────────
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);
export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

/** Personal API tokens: the secret is shown once; only its hash is stored. Bearer auth acts as the owner. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "tdi_abcd" — the visible start of the secret */
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

/** An invite link to a project: role, optional locked email, expiry; accepted or revoked once. */
export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email"),
    role: memberRoleEnum("role").notNull().default("editor"),
    invitedBy: text("invited_by").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedBy: text("accepted_by").references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("invites_project_idx").on(t.projectId)],
);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** @handle used for mentions and quick-add */
  nickname: text("nickname"),
  /** One of the eight label tokens, e.g. "teal"; null = derived from the name */
  avatarColor: text("avatar_color"),
  ...timestamps,
});

// ── Group → Project → List ─────────────────────────────────────────────────────
export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  /** Item-key prefix, 2–5 uppercase letters or digits ("MP"); keys are per group */
  keyPrefix: text("key_prefix").notNull(),
  /** Counter behind the next item key in this group */
  nextItemNumber: integer("next_item_number").notNull().default(1),
  position: integer("position").notNull().default(0),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  ...lifecycle,
  ...timestamps,
});

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    name: text("name").notNull(),
    /** Lucide glyph name, e.g. "rocket" */
    icon: text("icon"),
    /** One of the label colour names, e.g. "blue" */
    color: text("color"),
    description: text("description"),
    visibility: projectVisibilityEnum("visibility").notNull().default("private"),
    defaultView: projectViewEnum("default_view").notNull().default("list"),
    /** "Link lists with statuses": an item moved to a list with a role takes that Status */
    linkStatuses: boolean("link_statuses").notNull().default(true),
    position: integer("position").notNull().default(0),
    ...lifecycle,
    ...timestamps,
  },
  (t) => [index("projects_group_idx").on(t.groupId)],
);

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    kind: listKindEnum("kind").notNull().default("project"),
    /** Null for the account-level Inbox */
    projectId: text("project_id").references(() => projects.id),
    /** Set for the Inbox: the account it belongs to */
    userId: text("user_id").references(() => users.id),
    name: text("name").notNull(),
    /** Explicit icon override; null = automatic from the name */
    icon: text("icon"),
    /** Explicit Status role (stable id) or null */
    statusRole: itemStatusEnum("status_role"),
    position: integer("position").notNull().default(0),
    hidden: boolean("hidden").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("lists_project_idx").on(t.projectId), uniqueIndex("lists_inbox_per_user_idx").on(t.userId).where(sql`${t.kind} = 'inbox'`)],
);

// ── Item ───────────────────────────────────────────────────────────────────────
export interface ItemCover {
  color?: string;
  attachmentId?: string;
  /** One of the kit's sample covers (design/covers/*.svg) — seed data only, until attachments land */
  sample?: string;
}
export interface ItemNotification {
  kind: string;
  /** Member id, or null when Todoi itself sends it */
  fromUserId?: string | null;
  /** The key of the item it refers to */
  aboutKey?: string;
  aboutItemId?: string;
}

export const items = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    /** Null for Inbox items (they get a project when filed) */
    projectId: text("project_id").references(() => projects.id),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id),
    /** Subitems are items with a parent, one level deep */
    parentItemId: text("parent_item_id"),
    /** Number behind the key "<group.key_prefix>-<key_number>"; null until the item lands in a project */
    keyNumber: integer("key_number"),
    title: text("title").notNull(),
    /** Markdown subset */
    description: text("description"),
    /** None is the default Status */
    status: itemStatusEnum("status"),
    /** Remembered when the checkbox sets Done; restored on uncheck */
    priorStatus: itemStatusEnum("prior_status"),
    done: boolean("done").notNull().default(false),
    priority: itemPriorityEnum("priority"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    dueTime: time("due_time"),
    repeatRule: jsonb("repeat_rule").$type<RepeatRule>(),
    repeatCount: integer("repeat_count").notNull().default(0),
    cover: jsonb("cover").$type<ItemCover>(),
    /** Inbox notifications: who it came from and what it is about */
    notification: jsonb("notification").$type<ItemNotification>(),
    unread: boolean("unread").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by").references(() => users.id),
    ...lifecycle,
    ...timestamps,
  },
  (t) => [
    index("items_list_idx").on(t.listId, t.position),
    index("items_project_idx").on(t.projectId),
    index("items_parent_idx").on(t.parentItemId),
    uniqueIndex("items_key_per_project_idx").on(t.projectId, t.keyNumber),
  ],
);

// ── Members ────────────────────────────────────────────────────────────────────
export const members = pgTable(
  "members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRoleEnum("role").notNull().default("editor"),
    ...timestamps,
  },
  (t) => [uniqueIndex("members_pk_idx").on(t.projectId, t.userId)],
);

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type List = typeof lists.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Member = typeof members.$inferSelect;

// ── Labels, people on items ────────────────────────────────────────────────────
export const labels = pgTable(
  "labels",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    /** One of the eight palette names */
    color: text("color").notNull(),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("labels_name_per_project_idx").on(t.projectId, t.name)],
);

export const itemLabels = pgTable(
  "item_labels",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("item_labels_pk_idx").on(t.itemId, t.labelId)],
);

export const itemAssignees = pgTable(
  "item_assignees",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [uniqueIndex("item_assignees_pk_idx").on(t.itemId, t.userId)],
);

export const itemWatchers = pgTable(
  "item_watchers",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [uniqueIndex("item_watchers_pk_idx").on(t.itemId, t.userId)],
);

// ── Content on items ───────────────────────────────────────────────────────────
export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    /** Markdown subset with @mentions and item keys */
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    replyToId: text("reply_to_id"),
    ...timestamps,
  },
  (t) => [index("comments_item_idx").on(t.itemId, t.createdAt)],
);

export const commentReactions = pgTable(
  "comment_reactions",
  {
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    emoji: text("emoji").notNull(),
  },
  (t) => [uniqueIndex("comment_reactions_pk_idx").on(t.commentId, t.userId, t.emoji)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    size: integer("size").notNull().default(0),
    mime: text("mime"),
    /** Where the bytes live (object key or URL); the storage backend is a later decision */
    storageKey: text("storage_key").notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("attachments_item_idx").on(t.itemId)],
);

export const relationTypeEnum = pgEnum("relation_type", RELATION_TYPES);

/** Stored once per pair; the API returns both directions by applying the inverse. */
export const itemRelations = pgTable(
  "item_relations",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    type: relationTypeEnum("type").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("item_relations_pk_idx").on(t.itemId, t.targetId, t.type), index("item_relations_target_idx").on(t.targetId)],
);

// ── Activity and saved views ───────────────────────────────────────────────────
export const activityTypeEnum = pgEnum("activity_type", ACTIVITY_TYPES);

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    itemId: text("item_id"),
    /** Null when Todoi itself acted */
    actorId: text("actor_id").references(() => users.id),
    type: activityTypeEnum("type").notNull(),
    /** The sentence after the actor: 'moved “Pricing page” from To-do to Doing' */
    text: text("text").notNull(),
    /** Item key at the time, e.g. "MP-112" */
    itemKey: text("item_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_project_idx").on(t.projectId, t.createdAt)],
);

export interface ViewDefinition {
  view?: "list" | "board" | "calendar";
  filters?: Array<{ type: string; value: string }>;
  sort?: { lists?: { key: string; dir: "asc" | "desc" } | null; items?: { key: string; dir: "asc" | "desc" } | null };
}

export const savedViews = pgTable(
  "saved_views",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    /** Visible to every member, or only the owner */
    shared: boolean("shared").notNull().default(false),
    definition: jsonb("definition").$type<ViewDefinition>().notNull(),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("saved_views_project_idx").on(t.projectId)],
);

export type Label = typeof labels.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type ItemRelation = typeof itemRelations.$inferSelect;
export type ActivityEntry = typeof activity.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
