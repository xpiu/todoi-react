# Changelog

All notable changes to Todoi. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (pre-1.0: minor = features, patch = fixes).

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
