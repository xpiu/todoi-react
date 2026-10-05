# Todoi (web application)

Todoi is a lightweight task manager focused on usability, legibility, speed and support for AI agents.

## About

| Resource | Details |
|---|---|
| Public site | [todoi.com](https://todoi.com) currently serves a separate micro-site with a browser-only task app. |
| Infrastructure notes | VPS 2 / Dokploy: `http://72.62.177.91/`; Hetzner hosting, Cloudflare CDN. Infrastructure is not defined in this repo. |
| Placeholder history | v2 went live on 2026-08-21; recorded source: `archive/todoi-placeholder-20260820/` (absent from this checkout). |
| Staging | Intended: `https://st.todoi.com` (does not resolve). Legacy: `https://s.todoi.com` (recorded as an outdated Next.js build; returns HTTP 403). Public URL checks: 2026-10-05. |
| Email | Official: `info@todoi.com`; intended sender: `noreply@todoi.com`. The app does not send email yet. |
| Documentation | [Design spec](DESIGN.md), [glossary](docs/design/glossary.md), [data model](docs/design/data-model-impact.md), [kit notes](docs/design/kit-walkthrough.md), [changelog](CHANGELOG.md). Root `PRODUCT.md` is missing. |
| Planning | [todo.md](todo.md) |
| Repository | `git@github.com:xpiu/todoi-react.git` |
| Business development | `git@github.com:xpiu/todoi-business.git`; [planning](https://github.com/xpiu/todoi-business/blob/main/todo/todo-business.md), [milestones](https://github.com/xpiu/todoi-business/blob/main/todo/milestones-business.md). |
| Native apps | Android prototype in external repo `todoi-app`; iOS, macOS and Windows apps not initiated. |

## Contents

- [Features and limits](#features-and-limits)
- [Visitors and accounts](#visitors-and-accounts)
- [Tech stack](#tech-stack)
- [Local development](#local-development)
- [Production](#production)
- [Quality gates](#quality-gates)
- [Claude Design sync](#claude-design-sync)

## Features and limits

- **Workspace:** groups, projects, lists, items/subitems, labels, assignees, watchers, relations, recurrence, covers and attachments. List/Board/Calendar views with filters, sorting and saved views; item overlay with Tiptap descriptions, comments and activity.
- **Tools:** Inbox capture, filing and notifications; search, command palette, Archive/Trash with Undo, Settings and Account. Reviewed imports: Markdown task lists (Embridge), Trello JSON or CSV. Export views/items to Markdown/CSV, print/save PDF, or export account JSON.
- **Accounts:** private guest workspaces, email/password accounts, project roles and invite links, personal API tokens and account preferences stored in PostgreSQL.

Current limits:

- **Email:** no delivery; admins copy/send invite links. Password reset has a request screen, but no email sender or completed reset flow.
- **Freshness:** no server push. Shared data refreshes every 30 seconds in visible tabs, on focus/navigation and after edits; BroadcastChannel alerts other browser tabs. Refresh waits for pending edits. Offline mutations stay in memory and are lost on reload/close; description/comment drafts use `sessionStorage`.
- **Deployment:** one API process with local attachment storage and in-process cleanup. Multiple processes would need shared persistent storage.
- **Attachments:** 25 MiB per file; storage quotas per uploader: 100 MiB for guests, 2 GiB for accounts.
- **Exports:** incomplete round-trips. Account JSON contains user details, groups, projects, lists, labels and items, excluding comments, attachments and association tables; it cannot be reimported. Back up PostgreSQL and uploads separately.
- **Deferred:** OpenAPI, a dedicated job runner, full export/import round-trips, large-project virtualization and Linux screenshot baselines. A sequence-based delta/SSE sync engine, Yjs collaboration and Redis remain possible later options.

## Visitors and accounts

Visitors get an empty private workspace: **Projects → New project → To do**, the same editing tools as account holders, and no onboarding/reminder banner. The avatar offers **Log in** / **Create account**; `/account` opens login. Signing up or logging in transfers the guest workspace and Inbox, preserving content IDs and existing account work.

Better Auth guest cookies last seven days, renewed during use. Refreshing/reopening retains access while valid; clearing cookies or expiry loses guest access. Signing in gives content a durable owner. Passwords require at least 10 characters.

## Tech stack

| Area | Implementation |
|---|---|
| Client | React 19, TypeScript, Vite, Base UI, TanStack Router, Tiptap; local Inter/Geist Mono fonts. Rounded/Minimal themes × Dark/Light modes. |
| State | Zustand for client state; TanStack Query for server data and optimistic mutations. |
| API | Node.js + Hono typed routes/RPC client, Zod validation. `/api/health` returns `{ "ok": true }`. |
| Data | PostgreSQL, Drizzle ORM/SQL migrations; integer positions order lists/items. No global sync ID or versioned conflict-resolution engine. |
| Authentication | Better Auth sessions/accounts in PostgreSQL; API tokens use `Authorization: Bearer tdi_…`. |
| Jobs and logging | API drains a transactional attachment-cleanup outbox. Shared errors: `src/shared/errors.ts`; faults/refused database writes log JSON with request IDs. No log aggregation. |

## Local development

Requirements: **Node 22.12+**, npm and running PostgreSQL (CI uses PostgreSQL 16).

```sh
cp .env.example .env       # set DATABASE_URL for your machine
createdb todoi_react       # once; match the database name in DATABASE_URL
npm ci
npm run dev
```

The API runs on `:3000`, migrating/seeding on development boot. Vite serves `http://localhost:5173`, proxying `/api` to `:3000`; update `vite.config.ts` when changing the API port. API scripts read `.env`; Vite also reads `.env.local`.

Seeded accounts: `flo@todoi.com` and `sam@helicopterseurope.com`, verified, password `todoi-dev-password`. Flo's samples include Helicopters Europe projects, MP-115 photos, Sam's comments and a filled Inbox; seeded starts replenish missing samples. Sign up at `/signup`; copy invites in **Project settings → Members**. Component gallery: `/dev/ds`.

| Command | Purpose |
|---|---|
| `npm run check` | Typecheck, lint and unit tests. |
| `npm run typecheck` / `npm run lint` | TypeScript; oxlint with `tools/lint/` design rules + stylelint for client CSS. |
| `npm test` / `npm run test:watch` | Vitest once / watch mode. |
| `npm run build` | Client → `dist/`; API → `dist-server/index.js`. |
| `npm run db:generate` | Generate migrations after changing `src/server/db/schema.ts`; review the SQL. |
| `npm run db:migrate` / `npm run db:studio` | Apply migrations / open Drizzle Studio. |

Integration/browser/tool checks below run separately.

## Production

One Node process serves API/client behind a TLS proxy (Dokploy, Caddy or nginx). Configure production first: **replace `.env.example` auth values and set `SEED_ON_START=false`**.

```sh
npm ci
npm run build
npm run db:migrate         # needs dev dependencies; alternatively MIGRATE_ON_START=true
npm start                 # NODE_ENV=production node loads .env if present
```

Environment variables override `.env`:

| Variable | Production setting |
|---|---|
| `DATABASE_URL` | Required PostgreSQL connection URL. |
| `APP_URL` | Required public HTTPS URL for cookies, trusted origins and invite links; HTTP allowed on loopback for smoke tests. |
| `BETTER_AUTH_SECRET` | Required, 32+ random characters: `openssl rand -base64 32`. Rotation invalidates sessions. |
| `UPLOAD_DIR` | Default `.data/uploads`; use a persistent volume and back it up with the database. |
| `PORT` | Default `3000`. |
| `MIGRATE_ON_START` | Default `false`; `true` applies pending migrations with the runtime migrator. Keep `drizzle/` in the deployment. |
| `SEED_ON_START` | Must be `false` (production default); demo accounts have a published password. |
| `CLIENT_DIR` | Default `dist`; empty serves only the API. |

Production startup rejects invalid/missing configuration, development/example secrets, short secrets, non-HTTPS external URLs or enabled seeding. Development uses convenient defaults.

Non-API GET deep links serve HTML; hashed `/assets/*` cache for a year, HTML revalidates. `SIGTERM`/`SIGINT` stop new connections and close the database pool, with a 10-second shutdown limit. Fault/refused-write logs carry the client's “ref …” `requestId`.

Local production smoke test (PostgreSQL required):

```sh
npm run build
APP_URL=http://localhost:3000 BETTER_AUTH_SECRET=$(openssl rand -base64 32) SEED_ON_START=false MIGRATE_ON_START=true npm start
```

## Quality gates

- **Unit:** `npm run check` covers parsers, dates, recurrence/completion, Markdown, views, filters, export, shortcuts, item rows, mutations and server configuration/errors. The [theme-parity audit](src/client/design/tokens/parity.test.ts) checks matching token sets across four scopes, valid token references and no raw hex, bare z-index or `@media` in design component CSS.
- **Integration:** `npm run test:integration` reads `.env` and checks PostgreSQL services/routes, including lifecycle cascades, rollback, attachment cleanup/security, completion, moves, duplication, search and notifications. Each test file gets a migrated disposable database and upload directory, removed afterward. The configured database role needs `CREATEDB`; fixtures do not use the application database.
- **Browser:** `npx playwright install chromium` once, then `npm run test:e2e`. Playwright starts/reuses `:5173`; PostgreSQL and seeded accounts are required. List/Board/Calendar, overlay, Settings and saved views cover all four scopes with snapshots and axe WCAG 2.1 A/AA (serious/critical violations fail; **color contrast disabled**). Other specs cover reduced motion, keyboard interaction, guest isolation/account transfers, offline edits, drafts, uploads and editing flows. Fixtures use the development database and are cleaned up afterward.

Snapshots: `tests/e2e/__screenshots__/`, per platform. Update intentional changes with `npm run test:e2e:update` and commit baselines. [CI](.github/workflows/ci.yml) runs `check`, integration and Chromium tests on Linux with `--ignore-snapshots` until Linux baselines exist. Reports: `.tmp/`, uploaded on CI failure.

Archive/Trash visibility follows parent items/projects; restoring a container preserves children's own states. Permanent deletion cascades; project activity survives item deletion, but disappears with its project. Migration `0006_lifecycle_cleanup.sql` adds the parent foreign key (promoting legacy orphans to top-level) and cleanup outbox. The API removes bytes after commit, draining up to 100 due jobs at startup, after deletion and each minute; retries back off to one hour. Migrate before starting an updated API.

## Claude Design sync

The customizable [sync tool](tools/claude-design-sync/README.md) compares/transfers app and Claude Design changes by feature; the design kit is a creative reference, with limited app parity.

```sh
npm run design-sync -- serve     # http://localhost:4477; loopback only
npm run design-sync:check        # separate tool typecheck + engine tests
```

Configure mappings/harness in `tools/claude-design-sync/config.json`. Pull/upload requires Claude Code with DesignSync access; app ports support Claude Code or Codex. The tool asks for AI-run confirmation and upload selection/approval. Its README covers import/compare/sync-point commands and GUI tests.
