// Stable ids shared by the Postgres enums, the zod schemas and the client. Display names live in the UI.
// Vocabulary: docs/design/glossary.md.

export const ITEM_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];

export const PROJECT_VISIBILITIES = ["private", "shared", "public"] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

export const PROJECT_VIEWS = ["list", "board", "calendar"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

export const LIST_KINDS = ["project", "inbox"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const LABEL_COLORS = ["green", "yellow", "orange", "red", "pink", "blue", "teal", "lime"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const RELATION_TYPES = ["blocked_by", "blocks", "related"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const ACTIVITY_TYPES = ["item", "comment", "list", "member", "settings"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_KINDS = ["mention", "assignment", "comment", "watch", "invite", "sync", "news", "reminder"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Days a deleted project or item stays in the Trash before the purge removes it. */
export const TRASH_RETENTION_DAYS = 90;
