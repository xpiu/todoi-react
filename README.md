# Todoi (web application

## Visitors and accounts

The app opens directly into a private visitor workspace: **Projects → New project → To do**, with no
items. Visitors can use the same editing tools as account holders. The avatar menu offers **Log in**
and **Create account**; `/account` also opens login. Registering or logging into an existing account
moves the visitor's workspace and Inbox into that account, preserving content IDs and existing account work.

Visitor access uses a Better Auth anonymous session in this browser's cookie, with the existing
seven-day session lifetime renewed during use. Refreshing or reopening the browser retains the
workspace while that session is valid. Clearing cookies or letting the session expire loses guest
access; signing in gives the content a durable account owner. No onboarding or reminder banner is shown.

## Signing in (development)

Better Auth provides browser guest sessions and email/password accounts. The seed creates two people with the password `todoi-dev-password`:
`flo@todoi.com` and `sam@helicopterseurope.com`. Flo owns the Design System examples (the Helicopters Europe projects, the helicopter photos on MP-115, Sam's comments and a filled Inbox; the seed adds whatever is missing on every start) and has a verified email. Create more accounts at `/signup`; invites come from
Project settings › Members (the link is copied to the clipboard).

## ℹ️ About

- **Project title**: Todoi (web application)
- **Project brief / Executive summary**: 
Todoi is a lightweight task manager with a focus on user-friendliness, legibility, speed, and support for AI agents.
- **Public URL**: `https://todoi.com`
- **Public server (production)**: VPS 2 with Dokploy - the app at todoi.com is temporarily a placeholder micro-site
- **Public placeholder app source files (v2 - live on 20260821)**: `archive/todoi-placeholder-20260820/`
- **Official email**: `info@todoi.com`
- **Default email for sending messages**: `noreply@todoi.com`
- **Product doc**: PRODUCT.md
- **Design doc**: DESIGN.md
- **Staging URL**: `https://st.todoi.com` (not active yet)
- **Outdated staging URL**: `https://s.todoi.com` (contains an active but out-of-date NextJS build)
- **Staging server**: `http://72.62.177.91/` (VPS 2)
- **Project planning**: available in `todo.md`
- **Git repository**: `git@github.com:xpiu/todoi-react.git`
- **Todoi Business development files**: `git@github.com:xpiu/todoi-business.git`
- **Todoi Business planning**: `https://github.com/xpiu/todoi-business/blob/main/todo/todo-business.md`
- **Todoi Business milestones**: `https://github.com/xpiu/todoi-business/blob/main/todo/milestones-business.md`
- **Android app**: prototype under development in external repo `todoi-app`
- **iOS app**: not initiated
- **MacOS app**: not initiated
- **Windows app**: not initiated


## 📚 Table of contents

- ℹ️ About
- Tech stack
-



## Tech stack

- Backend runtime: Hono
- Backend sync engine: (1) start with no custom engine, just TanStack Query with optimistic mutations - (2) later stage: Hand-rolled seq delta plus SSE
- Database: one PostgreSQL
- Ordering & conflict handling: One monotonic sync id from Postgres ( A single integer totally orders every write in the workspace; field conflicts resolve last-write-wins against it. )
- ORM and migrations: Drizzle
- Background jobs: undefined, when needed
- Errors and logs: one API error shape with a request id, and a JSON log line for each server fault or refused database write (no log aggregation service yet)

- UI library: React
- Build delivery: Vite
- UI component library: Base UI (`https://github.com/mui/base-ui`)
- State management: Zustand + TanStack Query
- Authentication: Better Auth in our own Postgres
- Rich text support: Tiptap
- Collaboration model: DEFERRED - potentially considering Yjs later
- API surface: Hono's own typed routes + OpenAPI

- Hosting: a Hetzner VPS
- CDN: Cloudflare
- More caching tools: DELAYED, potentially Redis later

## Current state

A working single-instance app on the design spec's vocabulary (see `docs/design/glossary.md` and `DESIGN.md`):

- **Workspace:** project groups, projects with lists, items with subitems, labels, assignees, watchers,
  relations, recurrence, cover images and attachments; List, Board and Calendar views with filters, sorts
  and saved views; the item overlay with a Tiptap description editor, comments and activity.
- **Around it:** the account Inbox (capture, filing, notifications as items), search and the command
  palette, Archive and Trash with Undo, import and Markdown/CSV/JSON export, Settings and Account pages.
- **Accounts:** browser guest workspaces and email/password accounts (Better Auth in our own Postgres),
  project members and roles, invite links, API tokens.
- **Stack:** React + Vite, Base UI, Zustand + TanStack Query with optimistic mutations, Hono typed routes
  with the RPC client, zod, Drizzle + PostgreSQL. API errors share one shape (`src/shared/errors.ts`).

Genuine limitations, so nobody plans around features that are not there:

- **No email is sent.** Invites are links the admin copies and sends; password reset is not finished.
- **No live sync.** Other people's changes appear when a view refetches (on focus, navigation or after an
  edit), not instantly. Edits made offline wait in this tab's memory and are lost if it closes first.
- **One instance.** Attachment bytes live on local disk (`UPLOAD_DIR`) and the upload-cleanup loop runs
  in the API process, so run one API process with a persistent volume.
- **Not yet:** OpenAPI, background job runner, complete export round-trips, large-project virtualization,
  Linux screenshot baselines in CI. Planning lives in `todo.md`.

## Local development

Requirements: Node 22+, a local PostgreSQL.

```sh
cp .env.example .env        # then set DATABASE_URL for your machine
createdb todoi_react        # once
npm install
npm run dev                 # API on :3000 (applies migrations and seeds sample data on boot in dev), Vite on :5173
```

Other scripts: `npm run check` (typecheck + lint + tests), `npm run test` (Vitest), `npm run typecheck`, `npm run lint` (oxlint with
the design-adherence plugin in `tools/lint/`, stylelint for component CSS), `npm run build`,
`npm run db:generate` (after editing `src/server/db/schema.ts`), `npm run db:studio`, `npm start` (see Production).

## Production

The API serves the built client itself, so one Node process behind a TLS reverse proxy (Dokploy, Caddy,
nginx) is the whole deployment.

```sh
npm ci
npm run build                 # client → dist/, API → dist-server/index.js
npm run db:migrate            # apply migrations (needs dev dependencies), or set MIGRATE_ON_START=true
npm start                     # NODE_ENV=production node dist-server/index.js
```

Configuration comes from the environment (`.env` is read if present; real variables win):

| Variable | Production |
|---|---|
| `DATABASE_URL` | Required. A persistent PostgreSQL database. |
| `APP_URL` | Required. The public `https://` URL; cookies, trusted origins and invite links use it. |
| `BETTER_AUTH_SECRET` | Required. 32+ random characters (`openssl rand -base64 32`). Rotating it signs everyone out. |
| `UPLOAD_DIR` | Attachment bytes. Mount a **persistent volume** here and back it up with the database. |
| `PORT` | Default 3000. |
| `MIGRATE_ON_START` | Default false. `true` applies pending migrations on boot with the runtime migrator. |
| `SEED_ON_START` | Must stay false: the seed creates demo accounts with a published password. |
| `CLIENT_DIR` | Default `dist`. Empty serves the API only (when a CDN or proxy serves the client). |

With `NODE_ENV=production` the API **refuses to start** and lists what to fix when `APP_URL` or
`BETTER_AUTH_SECRET` is missing, the secret is a development or example value or shorter than 32
characters, `APP_URL` is plain http outside localhost, or the seed is on. Development keeps its defaults.

Every path outside `/api` answers with the client, so deep links such as `/p/<project>` open the app; hashed
`/assets/*` are cached for a year and `index.html` revalidates. On `SIGTERM` the API stops accepting
connections, finishes open requests (up to 10 s) and closes the database pool, so a rolling restart drops
nothing. Each server fault or refused database write is logged as one JSON line with the `requestId` the client shows as "ref …".
For a local smoke test: `npm run build && APP_URL=http://localhost:3000 BETTER_AUTH_SECRET=$(openssl rand -base64 32) npm start`.

## Quality gates

`npm run check` runs the typecheck, oxlint + stylelint and the Vitest unit tests. The unit suite covers every pure
module (quick-add and import parsers, date math, repeat rules, Markdown, view-state encoding, filters, export,
shortcuts, item rows) and the **theme-parity audit** (`src/client/design/tokens/parity.test.ts`: every colour token
defined in all four theme × mode scopes, identical token sets, no raw hex or bare z-index in component CSS).

`npm run test:integration` checks lifecycle behavior against PostgreSQL, including foreign-key cascades,
transaction rollback, and retryable file cleanup. It reads `.env`, creates a disposable database and upload
directory for each test file, applies every migration, and removes them afterward. The database role needs
`CREATEDB`; these tests never use the application database for fixtures. CI runs them before the browser tests.

Archive and Trash visibility is inherited from parent items and projects. Restoring a container preserves
each child's own archived/deleted state. Permanent deletion cascades through dependent records. Migration
`0006_lifecycle_cleanup.sql` adds the parent foreign key (promoting old orphaned children to top-level items)
and a transactional attachment-cleanup outbox. The API drains up to 100 due cleanup jobs after deletion, at
startup, and every minute; filesystem failures retry with backoff up to one hour. Run `npm run db:migrate`
before starting the updated API outside development. Database cascades enqueue cleanup; the running API
removes the bytes after commit. Project activity survives individual item deletion, but is removed with its project.

`npm run test:e2e` runs the browser gates in `tests/e2e/` with Playwright against the dev servers (started for you
when nothing listens on :5173; Postgres must be up). They sign in as the seeded dev user and, for each of the four
scopes (Standard / Minimal × Dark / Light), open the list, board, calendar, item overlay and Settings screens, assert
the scope landed on `<html>`, run **axe** (WCAG 2.1 A + AA; serious and critical violations fail), and compare a
**visual-regression** snapshot. Two more specs check the reduced-motion rule and the list keyboard model.
The guest spec checks the empty starter, browser isolation, GUI editing, concurrent tabs, avatar and
account entry, and preservation on sign-up and existing-account login. It cleans up its own test users and uploads.

Snapshots live in `tests/e2e/__screenshots__` and are recorded per platform. After an intentional visual change run
`npm run test:e2e:update` and commit the new baselines. CI (`.github/workflows/ci.yml`) runs `npm run check`, then
the browser gates on Linux with `--ignore-snapshots` until Linux baselines are committed.

## Project structure

```
src/client/          React app (Vite entry: index.html -> src/client/main.tsx)
src/client/design/   Design system: tokens/ (CSS, four theme × mode scopes + parity test), fonts/,
                     covers/, core/ (every primitive: Icon, Button … Popover/Menu/Select/Dialog on
                     Base UI, pickers, Markdown, quick-add parser, shortcuts, appearance store),
                     one co-located .css per component, index.css as the single CSS entry
src/client/dev/      /dev/ds gallery of every primitive in all theme × mode scopes
src/server/          Hono API (routes/, services/), Drizzle schema, seed, DB client (entry: src/server/index.ts)
src/shared/          Code used by both: status ids, zod request schemas
drizzle/             Generated SQL migrations
docs/design/         Glossary, data-model impact and kit notes; the spec itself is DESIGN.md
tools/lint/          oxlint plugin with the design-adherence rules
```
