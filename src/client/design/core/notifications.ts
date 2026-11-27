// Notification kinds (Design: components/core/Notifications › NOTIFICATION_KINDS). A notification is an Inbox item;
// its row shows who it came from: the sender's avatar, or for one todoi sends itself the kind's glyph.
import type { IconName } from "./Icon";

export interface NotificationKind {
  label: string;
  icon: IconName;
}

export const NOTIFICATION_KINDS: Readonly<Record<string, NotificationKind>> = {
  mention: { label: "Mention", icon: "at-sign" },
  assignment: { label: "Assignment", icon: "user-plus" },
  comment: { label: "Comment", icon: "message-square" },
  watch: { label: "Watched item", icon: "eye" },
  invite: { label: "Invite", icon: "mail" },
  sync: { label: "Sync conflict", icon: "git-branch" },
  news: { label: "todoi news", icon: "megaphone" },
  reminder: { label: "Reminder", icon: "clock" },
};

export const notificationKind = (kind: string | null | undefined): NotificationKind => NOTIFICATION_KINDS[kind ?? ""] ?? { label: "todoi", icon: "bell" };
