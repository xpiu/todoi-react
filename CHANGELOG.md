# Changelog

All notable changes to Todoi. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (pre-1.0: minor = features, patch = fixes).

## Unreleased — 2026-10-06

- Publish the API v1 contract as OpenAPI 3.1 at `/api/v1/openapi.json`, generated from the routes' own validators so it can't drift; the agent docs and `llms.txt` link it.
- Add the versioned API at `/api/v1`: a listed, stable subset of the app's routes (account, projects, lists, items, comments, labels, search, attachments). API tokens work only there, so a token can no longer reach account management such as making more tokens.
- Scope API tokens: each is read only (the default) or read and write, and reaches every project and the Inbox or only the projects picked when it is made; listings and search narrow to them.
- Throttle abuse: per-address limits on every request, log-ins, sign-ups, guest workspaces and reset or confirmation emails; per-token limits for API tokens and a limit on tokens that don't work; capped account exports; and a per-account log-in limit that a working log-in or a password reset clears. Refusals are 429 with `Retry-After`. Set `TRUST_PROXY_HOPS` behind a reverse proxy.
- Email mentions, assignments and (when switched on) comments on watched items as well as putting them in the Inbox, following the Email notifications switches. Only confirmed addresses get them.
- Require a confirmed email address before inviting people or joining through an invite sent to an address, so nobody can take a teammate's seat by signing up with their address first. The invite page sends the confirmation link, which brings the person back to the invite.
- Read and write spec-conformant Embridge v0.2.2 Markdown through the reference parser (`embridge` on npm) and a canonical writer, checked against the spec's conformance suite. Import now brings in descriptions, start dates, item Status, comment threads and attachment links, flattens anything deeper than subitems with a note, keeps repeated list names apart, and reviews warnings first; view exports write Embridge.
- Add JSON and YAML project files: one strict, deterministic shape with a JSON Schema published at `/schema/project-v1.json`, YAML restricted to a safe 1.2 subset. Import reads them as "Todoi file" and explains a refused file by path and item.
- Add Git sync: keep a project in a file in a GitHub repository (Embridge, JSON or YAML) and sync both ways — a three-way merge, a conflict dialog or policy, sync history with undo, and signed push webhooks. Connect under Settings › Storage & sync with a fine-grained token, stored encrypted.
- Add a durable job queue in PostgreSQL (retries with backoff, crash recovery, dedupe keys, recurring schedules) for Git syncs, upload cleanup and receipt pruning, replacing the in-process timer. The Trash now empties itself after 90 days, as promised.
- An operator console at `/admin` (for confirmed `ADMIN_EMAILS`): grouped server, browser, job and Git sync errors with stacks and Resolve, the job queue with Retry, failing and overdue Git sync connections, and an account search.
- Export everything as a restorable `.zip` (every project, the Inbox, comments, reactions, relations, saved views, activity and attachment files) and restore it as new copies, with a review step; other people's work keeps its attribution.
- Git sync runs on a schedule too: every auto-sync connection reconciles every 10 minutes (catching missed webhooks), a stalled connection shows as Sync overdue, quiet syncs leave no history noise, and old history is pruned.

- Save workspace edits and their local projection atomically in IndexedDB; replay them in order across reloads and tabs, with automatic retries for temporary failures.
- Deduplicate server replay with transactional actor-scoped receipts, row versions and acknowledgments for related changes. Reject stale edits while retaining submitted text.
- Reconcile incoming snapshots with pending edits and purge inaccessible content. Add Storage & sync recovery with copy, retry and confirmed conflict choices.
- Preserve newer description/comment drafts while an earlier save is pending; keep recovery controls readable across all themes and mobile layouts.
- Record `https://staging.todoi.com` as the staging target.

## [0.1.0] — 2026-10-05

The first release of the rebuilt Todoi: a Vite/React client and a Hono + Drizzle/Postgres API built on the Claude Design "Todoi Design System" (spec in `DESIGN.md`).

### Design system
- Adopted the Todoi Design System in phases 0–7: tokens, fonts, icons, the appearance store, Base UI primitives and the `/dev/ds` gallery.
- Two themes × two modes: **Rounded** (formerly Standard) and **Minimal** ("Ledger"). New users start in Minimal · light.
- Minimal now covers every surface the kit reaches. This release pulls in 208 rules from Claude Design: ink primary buttons, hairline subtle/outline buttons and icon tiles, archive, project panel, pickers, bulk bar, skeletons, connection pill, sync notice, empty states, and card label lists.
- Subnavbar rows composed like the kit (Views · Filter by · Sort by); Members dropdown; tidier toolbar menus in every theme.

### Views and items
- List, Board and Calendar views on real data: native and touch drag and drop, a full keyboard model, Undo, a command palette and shortcut hints.
- Filters and sort in the URL, chip rows, multi-select with the bulk bar, and saved views.
- Item overlay: description, subitems, relations, attachments, comments, activity, export, and move or copy to another project.
- Inbox: opening, editing and filing. Quick add honours position and the server's rules. Duplicate and copy behave the same everywhere.
- Hidden lists can be recovered from a "N hidden lists" menu. Changing a list's Status role asks before rewriting items.

### Projects, accounts and settings
- Project lifecycle: create, project settings, activity log, Archive & Trash with restore, and the Projects and Groups pages.
- Better Auth sign-in, sign-up, password reset and invites. Private guest workspaces carry their content over when you log in. Read-only viewers can't drag and are told why.
- Settings and Account pages run on a registry-driven shell, and the controls change the behaviour they describe. Import runs as one request.

### Reliability
- Honest states: loading, failure and missing-item dialogs (archived, Trash, elsewhere, gone, no access), and errors shown next to the control that failed.
- Offline and save state says what is really kept. Edits wait in the tab, refused edits are reported and rolled back, and leaving with unsaved edits asks first.
- Drafts are kept until the save is confirmed. Deletes can be undone with retry. API errors are standard, and success shows only after it is confirmed.
- Server-side rules for completion, status and recurrence. Item families stay valid across project moves. Uploads are bounded, previews constrained, and cache invalidation and freshness are tighter.
- Authentication and server configuration fail safely outside development. The mobile sidebar is an accessible modal sheet.

### Quality
- `npm run check` (typecheck, oxlint, stylelint, Vitest with the theme-parity audit) and `npm run test:e2e` (every key screen in all four theme × mode scopes with axe, reduced motion and visual regression), plus CI.

[0.1.0]: https://github.com/xpiu/todoi-react/releases/tag/v0.1.0
