# Todoi (web application)

Todoi is a lightweight task manager focused on usability, legibility, speed and support for AI agents.

## 📝 About

- **Public site:** [todoi.com](https://todoi.com) currently serves a separate micro-site with a browser-only task app.
- **Infrastructure notes:** VPS 2 / Dokploy: `http://72.62.177.91/`; Hetzner hosting, Cloudflare CDN. Infrastructure is not defined in this repo.
- **Placeholder history:** v2 went live on 2026-08-21; recorded source: `archive/todoi-placeholder-20260820/` (absent from this checkout).
- **Staging:** [staging.todoi.com](https://staging.todoi.com): Dokploy builds the repo `Dockerfile` with PostgreSQL 18; CI deploys `main` after every gate passes (see [Production](#-production)).
- **Staging database:** `dbstagingtodoireact` in PostgreSQL 18 (also known as `db-staging-todoi-react` in Dokploy on VPS 2).
- **Email:** `info@todoi.com`; intended sender: `noreply@todoi.com`.
- **Documentation:** [Design spec](DESIGN.md), [glossary](docs/design/glossary.md), [data model](docs/design/data-model-impact.md), [kit notes](docs/design/kit-walkthrough.md), [changelog](CHANGELOG.md). Root `PRODUCT.md` is missing.
- **Planning:** [todo.md](todo.md)
- **Repository:** `git@github.com:xpiu/todoi-react.git`
- **Business development:** `git@github.com:xpiu/todoi-business.git`; [planning](https://github.com/xpiu/todoi-business/blob/main/todo/todo-business.md), [milestones](https://github.com/xpiu/todoi-business/blob/main/todo/milestones-business.md).
- **Native apps:** Android prototype in external repo `todoi-app`; iOS, macOS and Windows apps not initiated.

## 📖 Contents

- [📝 About](#-about)
- [⚡ Quick Start](#-quick-start)
  - [Top commands](#top-commands)
  - [Installation](#installation)
- [✨ Features and limits](#-features-and-limits)
- [👥 Visitors and accounts](#-visitors-and-accounts)
- [🧰 Tech stack](#-tech-stack)
- [🎨 Design](#-design)
  - [Limitations for design tools like claude-design-sync and Storybook](#limitations-for-design-tools-like-claude-design-sync-and-storybook)
  - [Storybook](#storybook)
  - [Claude Design sync](#claude-design-sync)
- [💻 Local development](#-local-development)
- [🚀 Production](#-production)
- [✅ Quality gates](#-quality-gates)

## ⚡ Quick Start

Requires Node 22.12+, npm and running PostgreSQL (18 used here).

```sh
cp .env.example .env       # adjust DATABASE_URL for your machine
createdb todoi_react       # once; match DATABASE_URL
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Migrations and demo data load automatically; see [Local development](#-local-development) for details.

## ✨ Features and limits

- **Workspace:** groups, projects, lists, items/subitems, labels, assignees, watchers, relations, recurrence, covers and attachments. List/Board/Calendar views with filters, sorting and saved views; item overlay with Tiptap descriptions, comments and activity.
- **Tools:** Inbox capture, filing and notifications; search, command palette, Archive/Trash with Undo, Settings and Account. Reviewed imports: Markdown task lists (Embridge), Trello JSON or CSV. Export views/items to Markdown/CSV, print/save PDF, or export account JSON.
- **Accounts:** private guest workspaces, email/password accounts, project roles and invite links, personal API tokens and account preferences stored in PostgreSQL.

Current limits:

- **Email:** no delivery; admins copy/send invite links. Password reset has a request screen, but no email sender or completed reset flow.
- **Sync:** workspace JSON edits persist in IndexedDB before sending, survive reload/close and retry in order with server deduplication. Snapshots refresh on reconnect, focus/navigation and every 30 seconds in visible tabs, preserving pending fields. Storage & sync retains submitted text for conflict review; access loss purges cached content. Unsubmitted description/comment drafts use `sessionStorage`. App-shell offline caching, binary uploads and account/session actions are outside the queue. See [sync behavior](docs/sync.md).
- **Deployment:** one API process with local attachment storage and in-process cleanup. Multiple processes would need shared persistent storage.
- **Attachments:** 25 MiB per file; storage quotas per uploader: 100 MiB for guests, 2 GiB for accounts.
- **Exports:** incomplete round-trips. Account JSON contains user details, groups, projects, lists, labels and items, excluding comments, attachments and association tables; it cannot be reimported. Back up PostgreSQL and uploads separately.
- **Deferred:** OpenAPI, a dedicated job runner, full export/import round-trips, large-project virtualization and Linux screenshot baselines. Sequence-based deltas/SSE, Yjs collaboration and Redis remain possible later options.

## 👥 Visitors and accounts

Visitors get an empty private workspace: **Projects → New project → To do**, with the same editing tools as account holders. The avatar offers **Log in** / **Create account**; `/account` opens login. Signing up or logging in transfers the guest workspace and Inbox, preserving content IDs and existing account work once pending edits have synced.

Better Auth guest cookies last seven days, renewed during use. Refreshing/reopening retains access while valid; clearing cookies or expiry loses guest access. Signing in gives content a durable owner. Passwords require at least 10 characters.

## 🧰 Tech stack

- **Client:** React 19, TypeScript, Vite, Base UI, TanStack Router, Tiptap; local Inter/Geist Mono fonts. Rounded/Minimal themes × Dark/Light modes.
- **State:** Zustand for client state; TanStack Query for server data and optimistic mutations; IndexedDB for actor-scoped snapshots and outgoing operations.
- **API:** Node.js + Hono typed routes/RPC client, Zod validation. `/api/health` returns `{ "ok": true }`.
- **Data:** PostgreSQL, Drizzle ORM/SQL migrations; integer positions order lists/items, row versions check stale edits, and transactional operation receipts deduplicate replay.
- **Authentication:** Better Auth sessions/accounts in PostgreSQL; API tokens use `Authorization: Bearer tdi_…`.
- **Jobs and logging:** API drains a transactional attachment-cleanup outbox. Shared errors: `src/shared/errors.ts`; faults/refused database writes log JSON with request IDs. No log aggregation.

## 🎨 Design

### Limitations for design tools like claude-design-sync and Storybook

**Production architecture comes first, Claude Design readability second; Storybook and `claude-design-sync` must adapt to both.**

- **React:** Typed component APIs, composition, immutable state, and side effects outside render. Keep local interaction state local. [React guidance](https://react.dev/reference/rules/components-and-hooks-must-be-pure).
- **Base UI:** Use its primitives for interaction behavior. Custom components pass through refs and behavioral props correctly when composed through `render`. [Composition guidance](https://base-ui.com/react/handbook/composition).
- **Hono:** Keep validation, authorization, and database work on the server. Preserve the typed RPC client and type-only server imports. [RPC guidance](https://hono.dev/docs/guides/rpc).
- **Zustand:** Use focused selectors for shared client state and compute derived values. Introduce scoped stores when the application needs independent instances. [Zustand guidance](https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript.html).

Keep design components, application screens, client data access and server code separate. Explicit prop types, named exports, behavioral documentation, tokens and representative stories help Claude Design read the system; readability does not guarantee interaction fidelity. [Claude Design guidance](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design).

Storybook renders application components with decorators for props, providers and API mocks; stories and configuration stay outside the production import graph. The sync tool groups implementation, CSS, stories and documentation by component and translates them for the kit's React 18 UMD format without constraining the app's React 19 or Base UI code.

Design changes must pass application checks and preserve accessibility, server boundaries and state ownership. Adapt the sync tool's discovery/export rules as needed.

### Storybook

Storybook renders `src/client/design` components with the app's CSS, fonts, appearance store and viewport hooks. It runs without the API or PostgreSQL:

```sh
npm run storybook           # http://localhost:6006
npm run build-storybook     # separate output: storybook-static/
npx playwright install chromium  # once, for browser tests
npm run test:storybook
npm run test:storybook -- --coverage  # browser tests + accessibility + V8 coverage
```

The Storybook Testing panel loads the browser project through `vitest.config.ts` and runs it with preview globals. `npm run test:storybook` runs the full four-way theme/mode matrix; `npm test` remains Node-only. Restart Storybook after changing its Vitest configuration.

UI components have colocated typed `<Name>.stories.tsx` files with Autodocs, variants and interaction tests. Keep stories exposing accessibility defects with `a11y: { test: "todo" }` and a comment naming the axe rule; `rg 'test: "todo"' src/client/design` lists outstanding exceptions. Theme/mode toolbars use the app registry; viewport resizing uses the app's media queries and hooks, but does not emulate touch hardware.

Playwright Chromium runs stories across all four Rounded/Minimal × Dark/Light scopes. Accessibility scans include body portals and block failures except documented `todo` cases; color contrast and Base UI focus guards are excluded, matching the app gate. Contrast remediation remains pending. Node unit tests, database integration tests and app browser tests run separately; CI builds/tests Storybook without the API or database.

Story metadata and component manifests provide examples for coding agents. The [sync tool](tools/claude-design-sync/README.md) translates relevant stories and documentation into the kit's format; native Claude Design ingestion is not assumed.

Update stories with component changes; add composed views and API mocks as needed. The `/dev/ds` gallery remains available. Storybook MCP integration and component screenshot baselines are deferred.

### Claude Design sync

The customizable [sync tool](tools/claude-design-sync/README.md) compares/transfers app and Claude Design changes by feature; the design kit is a creative reference, with limited app parity.

```sh
npm run claude-design-sync       # http://localhost:4477; loopback only
npm run design-sync:check        # separate tool typecheck + engine tests
```

Configure mappings/harness in `tools/claude-design-sync/config.json`. Pull/upload requires Claude Code with DesignSync access; app ports support Claude Code or Codex. The tool asks for AI-run confirmation and upload selection/approval. Its README covers import/compare/sync-point commands and GUI tests.

## 💻 Local development

Follow [Quick Start](#-quick-start). On macOS, install/start PostgreSQL and add its tools to your shell's PATH:

```sh
brew install postgresql@18
brew services start postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"  # also add to ~/.zshrc
```

The API runs on `:3000`, migrating/seeding on development boot. Vite serves `http://localhost:5173`, proxying `/api` to `:3000`; update `vite.config.ts` when changing the API port. API scripts read `.env`; Vite also reads `.env.local`.

Seeded accounts: `flo@todoi.com` and `sam@helicopterseurope.com`, verified, password `todoi-dev-password`. Flo's samples include Helicopters Europe projects, MP-115 photos, Sam's comments and a filled Inbox; seeded starts replenish missing samples. Sign up at `/signup`; copy invites in **Project settings → Members**. Component gallery: `/dev/ds`.

Common commands:

- **`npm run check`:** Typecheck, lint and unit tests.
- **`npm run typecheck` / `npm run lint`:** TypeScript; oxlint with `tools/lint/` design rules + stylelint for client CSS.
- **`npm test` / `npm run test:watch`:** Vitest once / watch mode.
- **`npm run build`:** Client → `dist/`; API → `dist-server/index.js`.
- **`npm run db:generate`:** Generate migrations after changing `src/server/db/schema.ts`; review the SQL.
- **`npm run db:migrate` / `npm run db:studio`:** Apply migrations / open Drizzle Studio.

Integration/browser/tool checks below run separately.

## 🚀 Production

One Node process serves API/client behind a TLS proxy (Dokploy, Caddy or nginx). Configure production first: **replace `.env.example` auth values and set `SEED_ON_START=false`**.

```sh
npm ci
npm run build
npm run db:migrate         # needs dev dependencies; alternatively MIGRATE_ON_START=true
npm start                 # NODE_ENV=production node loads .env if present
```

Environment variables override `.env`:

- **`DATABASE_URL`:** Required PostgreSQL connection URL.
- **`APP_URL`:** Required public HTTPS URL for cookies, trusted origins and invite links; HTTP allowed on loopback for smoke tests.
- **`BETTER_AUTH_SECRET`:** Required, 32+ random characters: `openssl rand -base64 32`. Rotation invalidates sessions.
- **`UPLOAD_DIR`:** Default `.data/uploads`; use a persistent volume and back it up with the database.
- **`PORT`:** Default `3000`.
- **`MIGRATE_ON_START`:** Default `false`; `true` applies pending migrations with the runtime migrator. Keep `drizzle/` in the deployment.
- **`SEED_ON_START`:** Must be `false` (production default); demo accounts have a published password.
- **`CLIENT_DIR`:** Default `dist`; empty serves only the API.

Production startup rejects invalid/missing configuration, development/example secrets, short secrets, non-HTTPS external URLs or enabled seeding. Development uses convenient defaults.

Non-API GET deep links serve HTML; hashed `/assets/*` cache for a year, HTML revalidates. `SIGTERM`/`SIGINT` stop new connections and close the database pool, with a 10-second shutdown limit. Fault/refused-write logs carry the client's “ref …” `requestId`.

**Docker (staging):** the `Dockerfile` builds with every dependency and ships a non-root `node:22-slim` image with production dependencies, `dist/`, `dist-server/` and `drizzle/`. It defaults `UPLOAD_DIR=/data/uploads` (mount a named volume at `/data`, one replica) and health-checks `/api/health`. On Dokploy set `DATABASE_URL`, `APP_URL`, `BETTER_AUTH_SECRET` and `MIGRATE_ON_START=true`, and keep Autodeploy off: the CI `deploy-staging` job deploys `main` through the Dokploy API once all checks pass (secrets `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_STAGING_APP_ID`).

Local production smoke test (PostgreSQL required):

```sh
npm run build
APP_URL=http://localhost:3000 BETTER_AUTH_SECRET=$(openssl rand -base64 32) SEED_ON_START=false MIGRATE_ON_START=true npm start
```

## ✅ Quality gates

- **Unit:** `npm run check` covers parsers, dates, recurrence/completion, Markdown, views, filters, export, shortcuts, item rows, mutations and server configuration/errors. The [theme-parity audit](src/client/design/tokens/parity.test.ts) checks matching token sets across four scopes, valid token references and no raw hex, bare z-index or `@media` in design component CSS.
- **Integration:** `npm run test:integration` reads `.env` and checks PostgreSQL services/routes, including lifecycle cascades, rollback, attachment cleanup/security, completion, moves, duplication, search and notifications. Each test file gets a migrated disposable database and upload directory, removed afterward. The configured database role needs `CREATEDB`; fixtures do not use the application database.
- **Browser:** `npx playwright install chromium` once, then `npm run test:e2e`. Playwright starts/reuses `:5173`; PostgreSQL and seeded accounts are required. List/Board/Calendar, overlay, Settings and saved views cover all four scopes with snapshots and axe WCAG 2.1 A/AA (serious/critical violations fail; **color contrast disabled; Base UI focus guards excluded**). Other specs cover reduced motion, keyboard interaction, guest isolation/account transfers, offline edits, drafts, uploads and editing flows. Fixtures use the development database and are cleaned up afterward.

Snapshots: `tests/e2e/__screenshots__/`, per platform. Update intentional changes with `npm run test:e2e:update` and commit baselines. [CI](.github/workflows/ci.yml) runs `check`, integration tests, Storybook build/tests, `design-sync:check` and app Chromium tests. App screenshots use `--ignore-snapshots` until Linux baselines exist. Playwright reports: `.tmp/`, uploaded on CI failure.

Archive/Trash visibility follows parent items/projects; restoring a container preserves children's own states. Permanent deletion cascades; project activity survives item deletion, but disappears with its project. Attachment cleanup runs after commit, at startup and each minute, with retries backing off to one hour. Migrate before starting an updated API.
