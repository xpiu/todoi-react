# Design-system vocabulary → database and API names

The spec (`DESIGN.md`) uses one hierarchy: `Account → Group → Project → List → Item → Subitem`.
This page fixes the name every layer uses for each concept so the schema, the Hono routes, the
zod schemas in `src/shared/` and the React props never drift. UI copy always uses the spec word
in sentence case ("item", "list", "project"); code uses the snake_case table/column names in
Postgres and camelCase in TypeScript, which Drizzle maps for us.

| Spec term | UI copy | Postgres table / column | TypeScript / API | Notes |
| --- | --- | --- | --- | --- |
| Account | "your account" | `users` (owned by Better Auth as `user`) | `User`, `userId` | The spec's Account is a person's account. Better Auth's own `account` table means a *sign-in method* (a provider link); never use it for the spec's Account. |
| Group | "project group" | `groups` (`id`, `name`, `icon`, `key_prefix`, `next_item_number`, `owner_id`) | `Group`, `groupId`, `keyPrefix` | `key_prefix` is the 2–5 character "Item ID prefix" (`suggestAbbr`: "Sales" → `SAL`). The item-key counter lives here because keys are per group. |
| Project | "project" | `projects` (`group_id`, `name`, `icon`, `color`, `description`, `visibility`, `default_view`, `link_statuses`, `position`, `archived_at`, `deleted_at`) | `Project` | `visibility`: `private \| shared \| public`. `default_view`: `list \| board \| calendar` (List is the default). `link_statuses` is "Link lists with statuses", default on. |
| List | "list" | `lists` (`project_id` nullable, `user_id` nullable, `kind`, `name`, `icon`, `status_role`, `position`, `hidden`) | `List`, `listId`, `statusRole` | Never "column" in copy. `status_role` is a stable status id or null. `icon` is only the explicit override; the automatic icon comes from the name (`listIconFor`). |
| Inbox | "Inbox" | a `lists` row with `kind = 'inbox'`, `user_id` set, `project_id` null | `inboxListId` | One app-managed list per account. Inbox items carry no key until they are filed into a project. |
| Item | "item" | `items` (`project_id` nullable, `list_id`, `parent_item_id` nullable, `key_number`, `title`, `description`, `status`, `prior_status`, `done`, `priority`, `start_date`, `due_date`, `due_time`, `repeat_rule`, `repeat_count`, `cover`, `position`, `created_by`, `archived_at`, `deleted_at`) | `Item`, `itemKey` | Never "card" in copy. The displayed key is `<group.key_prefix>-<key_number>` (e.g. `MP-112`), computed in the API, stable across list moves, re-issued only when the item changes group. `status` is nullable: **None is the default** (the current scaffold's `NOT NULL DEFAULT 'TODO'` changes in Phase 3). `prior_status` remembers the Status before a checkbox set it to Done. |
| Subitem | "subitem" | `items.parent_item_id` (one level only) | `parentItemId`, `subitems` | Subitems are items: own key, own overlay. "Convert to item" clears the parent; "Make subitem of…" sets it. Parent/child is not a relation. |
| Status | "Status" (capitalised in the spec's copy) | enum `item_status` = `NEW \| BACKLOG \| TODO \| DOING \| DONE` (`src/shared/item-status.ts`) | `ItemStatus` | Ids are stored and linked; display names ("To-do", "Doing") are client copy and may be renamed. Glyphs: `circle-dashed`, `archive`, `circle-todo` (custom), `circle-dot`, `circle-check`. |
| Status role | "Status role" | `lists.status_role` | `statusRole` | Explicit per list, never inferred from the list title at run time. Title matching is only a prefill suggestion in the picker. |
| Priority | "Priority" | enum `item_priority` = `URGENT \| HIGH \| MEDIUM \| LOW`, nullable | `ItemPriority` | Quick-add `!1`–`!4` map to Urgent…Low; `0` clears. |
| Label | "label" | `labels` (`project_id`, `name`, `color`) + `item_labels` (`item_id`, `label_id`) | `Label`, `labelIds` | `color` is one of the 8 palette names (`green yellow orange red pink blue teal lime`), never a hex. Per project. |
| Member | "member" | `members` (`project_id`, `user_id`, `role`) | `Member`, `role` | `role`: `owner \| admin \| editor \| viewer`. Owner is exactly one per project. |
| Assignee | "assignee" | `item_assignees` (`item_id`, `user_id`) | `assigneeIds` | Many per item. Quick-add `@name` resolves against project members. |
| Invite | "invite" | `invites` (`project_id`, `email`, `role`, `code`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at`) | `Invite` | Landing page `/i/CODE`. |
| Watcher | "Watch" / "Watching" | `item_watchers` (`item_id`, `user_id`) | `watching` | Drives "watch" notifications. |
| Comment | "comment" | `comments` (`item_id`, `author_id`, `body`, `edited_at`, `reply_to_id`) + `comment_reactions` (`comment_id`, `user_id`, `emoji`) | `Comment` | Body is the Markdown subset with `@mentions` and item keys. |
| Attachment | "attachment" / "file" | `attachments` (`item_id`, `name`, `size`, `mime`, `storage_key`, `is_cover`, `uploaded_by`) | `Attachment` | Cover is either an attachment (`items.cover = {attachmentId}`) or a colour (`{color}`). |
| Relation | "Blocked by" / "Blocks" / "Related to" | `item_relations` (`item_id`, `target_id`, `type`) | `Relation`, `type: blocked_by \| blocks \| related` | Stored once; the API returns both directions by applying the inverse (`blocked_by ↔ blocks`, `related ↔ related`). |
| Repeat rule | "Repeat" | `items.repeat_rule` (jsonb) + `items.repeat_count` | `RepeatRule` `{freq, interval?, byWeekday?, ends?}` | Shape from the spec's `RepeatPicker`. Completing a recurring item is an API action (`completeRecurring`), not a client-side date edit. |
| Dates | "Dates" | `items.start_date`, `items.due_date` (date), `items.due_time` (time, nullable) | `start`, `due`, `time` as ISO strings | `due_state` (`overdue`/`complete`) is derived, never stored. |
| Saved view | "view" / "saved view" | `saved_views` (`project_id`, `owner_id`, `name`, `shared`, `definition`) | `SavedView`, `ViewDefinition` `{view, filters[], sort}` | "All items" is the implicit default (id null). The URL mirrors the definition (`encodeViewState`). |
| Notification | an Inbox item | `items` in the Inbox list with `items.notification` (jsonb `{kind, from, about}`) and `items.unread` | `NotificationKind` = `mention \| assignment \| comment \| watch \| invite \| sync \| news \| reminder` | No bell, no notification table. `about` is the key of the item it refers to. |
| Activity | "activity" | `activity` (`project_id`, `item_id` nullable, `actor_id` nullable, `type`, `text`, `item_key`, `created_at`) | `ActivityEntry` | `type`: `item \| comment \| list \| member \| settings`. The API writes it wherever it mutates a project. |
| Archive | "Archive" / "Archived" | `archived_at` on `projects` and `items` | `archivedAt` | Hidden from views, search and counts; kept indefinitely. |
| Trash | "Trash" / "Delete" | `deleted_at` on `projects` and `items` | `deletedAt` | Kept 90 days (`ARCHIVE_RETENTION_DAYS`), then removed by a job. "Delete forever" removes the row. |
| Appearance | "Appearance" | not in the database | localStorage `td-*` keys via the appearance store | Per device, never shared. Theme × mode, Background/Foreground per slot, show ids/labels/status, sidebar side, colorize columns, suggest shortcuts. |
| General settings | "Settings › General" | `user_preferences` (`user_id`, `language`, `time_zone`, `time_format`, `week_starts_on`, `date_format`, `show_completed`, `smart_dates`, `default_priority`, `default_list_id`) | `UserPreferences` | Account-level, synced across devices (unlike Appearance). |
| API token | "API token" | `api_tokens` (`user_id`, `name`, `prefix`, `hash`, `scopes`, `project_access`, `expires_at`, `last_used_at`, `revoked_at`) | `ApiToken` | Secret shown once. |
| Item key | "key" / "item ID" | computed from `groups.key_prefix` + `items.key_number` | `key` | Mono in the UI; "Show item IDs" hides it per device. |
| Done | checkbox checked | `items.done` + `items.status = 'DONE'` | `done` | Checking sets Status to Done and stores the prior Status; unchecking restores it. |

## Naming conventions

- Tables are plural snake_case; join tables are `<a>_<b>s` (`item_labels`, `item_assignees`).
- Ids are app-generated nanoids (as `items.id` is today) so optimistic inserts know their id.
- Every table carries `created_at` / `updated_at` (the shared `timestamps` helper in `src/server/db/schema.ts`).
- Soft removal is two timestamps, `archived_at` and `deleted_at`; never a boolean pair.
- Enums mirror a `const` array in `src/shared/` (pattern: `ITEM_STATUSES` → `itemStatusEnum`).
- Route paths use the spec nouns: `/api/groups`, `/api/projects`, `/api/lists`, `/api/items`, `/api/labels`, `/api/saved-views`, `/api/inbox`.
