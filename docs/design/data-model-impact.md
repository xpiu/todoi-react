# Guideline cards and components that shape the data model and API

Reviewed on 2026-10-01 against the export's 70 specimen cards (`guidelines/*.html` and
`components/**/*.card.html`). Most cards are purely visual; the ones below carry rules the
database, the API or the sync engine must honour. Names refer to `docs/design/glossary.md`.

## Cards with data-model or API consequences

| Card (group) | What it fixes | Consequence for schema / API |
| --- | --- | --- |
| Hierarchy vocabulary (Brand) | `Account → Group → Project → List → Item → Subitem` | Six first-class tables plus `parent_item_id`; Inbox is a list owned by an account, not a project. |
| Lists & Status (Interaction), Status role review (Components), Status tints (Colors) | Status ids are stable; a list's role is explicit; "Link lists with statuses" is per project; a role change never silently rewrites items | `lists.status_role`, `projects.link_statuses`; a linked move updates `list_id` and `status` in one transaction and the response reports both changes; a role change exposes an explicit bulk endpoint ("Apply to existing items"). |
| Keyboard model (Interaction), List / Board (Components) | Checkbox semantics: Done remembers the prior Status | `items.prior_status`; `PATCH /items/:id {done}` restores it on uncheck. |
| Quick-add (Components) | `#label @assignee !priority due… >List`; unknown `#label` creates the label | Create-item endpoint accepts labels by name with create-on-miss, assignee by member key, priority, due, destination list. |
| Item property pickers (Components) | Dates = start + due + due time; Repeat rule shape; Labels per project with 8 colours; Assignees many | `start_date`, `due_date`, `due_time`, `repeat_rule` jsonb, `labels.color` enum, `item_assignees`. |
| Recurring item completion (Interaction) | Checking a recurring item reopens it on the next due and counts occurrences | `POST /items/:id/complete` runs `completeRecurring` server-side and returns `{next, count, ended}` plus the toast copy; `items.repeat_count`. |
| Item content editing, Item overlay (Components) | Markdown subset description; comments with mentions, reactions, reply, edit, delete; attachments with cover; relations in three types; subitems with Open / Convert / Move / Delete; Watch | `comments`, `comment_reactions`, `attachments` (+ storage), `item_relations`, `item_watchers`, `items.cover`, `items.parent_item_id`. |
| Move or copy to another project, Bulk action bar (Components) | A move takes subitems, attachments, comments and relations and re-keys across groups; a copy gets a new key and no comments or activity; bulk actions apply to many items with one undo | `POST /items/:id/move {projectId, listId}`, `POST /items/:id/copy`, bulk endpoints that return everything changed so one undo can restore it; key re-issue uses the destination group's counter. |
| Undo history, Move feedback (Interaction) | Undo is a client session stack of snapshots | Every mutating response returns the previous state of what it changed (or the API exposes idempotent "restore" with the snapshot). No server-side undo table. |
| Saved views (Navigation) | A view = view type + filters + sort per project; shared or personal; URL-encoded | `saved_views` with `definition` jsonb; `encodeViewState` / `decodeViewState` ported as pure functions with tests. |
| Notifications (Components), Inbox screen | Notifications are Inbox items with `kind`, `from`, `about`, `unread` | Inbox list per account; `items.notification` jsonb, `items.unread`; "Mark all read" endpoint; events that produce notifications: mention, assignment, comment on watched, move on watched, invite, sync conflict, reminder, news. |
| Connection status, Empty/loading/error states (Components) | Offline queue, "Syncing N", "Last synced" | Later sync engine (README: seq delta + SSE); for now the client tracks pending mutations. No schema change yet. |
| Export & print (Components) | PDF / Markdown (Embridge) / CSV per item or per view | `GET /items/:id/export?format=` and `GET /projects/:id/export?format=&view=`; CSV columns: Title, List, Status, Priority, Due, Labels, Assignee, Key. |
| New project dialog + project settings (Components) | Templates seed lists with roles; copy an existing project copies lists and settings, never items; visibility; default view; group kind with key prefix | `POST /groups {name, keyPrefix}`, `POST /projects {templateId \| copyFrom, visibility, groupId}`; `projects.default_view`, `projects.description`, `projects.icon`, `projects.color`. |
| Project activity log (Components) | One log row per change, grouped by day, filtered by kind and person | `activity` table written by the API in the same transaction as the change. |
| Archive and trash (Components) | Archive is indefinite, Trash is 90 days, Restore puts things back exactly, restoring an item restores its archived project | `archived_at` / `deleted_at` on projects and items, position preserved; a scheduled purge job; `POST /archive/:kind/:id/restore`. |
| Sign-in, Sign-up, Password reset, Invite, Guest (Components) | Providers GitHub / Google / Apple, email + password, magic link; invites with role and expiry; public projects readable without an account; Viewer role | Better Auth tables; `invites`; `members.role`; `projects.visibility = public` lets the API serve read-only data to anonymous requests. |
| Account pages: API tokens, Devices, Sign-in methods, Data | Tokens with scopes and project access, sessions per device, account export | `api_tokens`; Better Auth sessions; export endpoint producing JSON / Markdown / CSV / ICS. |
| Settings › General | Language, time zone, formats, show completed, smart dates, capture defaults are account-level and sync | `user_preferences` table (unlike Appearance, which is per device). |
| Settings › Storage & sync, Integrations | GitHub / Bitbucket file sync, email-to-inbox | Deferred (README: sync engine later). Keep a `project_storage` placeholder out of the schema until designed. |

## Cards that are visual only (no data consequence)

Colors (brand, dark, ink, labels, semantic, surface, themes, parity audit), Type (roles, scale,
stack), Spacing, Radius, Elevation, Motion, Icons, Voice, Tooltips & hints, Shortcut suggestions,
Drag and drop cues, Touch drag and drop, Drop files on items (the drop itself only calls the
attachment upload), Responsive cards, Phone sheets, Inline editing adoption map, Core controls,
Confirm dialog, Icon picker (list icon override is a single nullable column already listed above),
Command palette, Keyboard shortcuts dialog, Search dropdown, Sidebar, Top navbar, Subnavbar.

## Two things the scaffold must change before Phase 3

1. `items.status` becomes nullable with no default: the spec's default Status is **None**.
2. Items gain `list_id`, `project_id`, a key number and a position; the flat list of today's
   scaffold becomes the Inbox list of the first (local) account until auth exists.
