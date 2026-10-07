# Todoi (web application)

Todoi is a lightweight task manager focused on usability, legibility, speed and support for AI agents.

## 📝 About

- **Public site:** [todoi.com](https://todoi.com) currently serves a separate micro-site with a browser-only task app.
- **Infrastructure notes:** VPS 2 / Dokploy: `http://72.62.177.91/`; Hetzner hosting, Cloudflare CDN. Infrastructure is not defined in this repo.
- **Placeholder history:** v2 went live on 2026-08-21; recorded source: `archive/todoi-placeholder-20260820/` (absent from this checkout).
- **Staging:** [staging.todoi.com](https://staging.todoi.com): Dokploy builds the repo `Dockerfile` with PostgreSQL 18; CI deploys `main` after every gate passes (see [Production](#-production)).
- **Staging database:** `dbstagingtodoireact` in PostgreSQL 18 (also known as `db-staging-todoi-react` in Dokploy on VPS 2).
- **Email:** Official: `info@todoi.com`; intended sender: `noreply@todoi.com`. The app does not send email yet.
- **Documentation:** [Design spec](DESIGN.md), [glossary](docs/design/glossary.md), [data model](docs/design/data-model-impact.md), [kit notes](docs/design/kit-walkthrough.md), [changelog](CHANGELOG.md). Root `PRODUCT.md` is missing.
- **Planning:** [todo.md](todo.md)
- **Repository:** `git@github.com:xpiu/todoi-react.git`
- **Business development:** `git@github.com:xpiu/todoi-business.git`; [planning](https://github.com/xpiu/todoi-business/blob/main/todo/todo-business.md), [milestones](https://github.com/xpiu/todoi-business/blob/main/todo/milestones-business.md).
- **Native apps:** Android prototype in external repo `todoi-app`; iOS, macOS and Windows apps not initiated.

## 📖 Contents

- [📝 About](#-about)
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

## ✨ Features and limits

- **Workspace:** groups, projects, lists, items/subitems, labels, assignees, watchers, relations, recurrence, covers and attachments. List/Board/Calendar views with filters, sorting and saved views; item overlay with Tiptap descriptions, comments and activity.
- **Tools:** Inbox capture, filing and notifications; search, command palette, Archive/Trash with Undo, Settings and Account. Reviewed imports: Markdown task lists (Embridge), Trello JSON or CSV. Export views/items to Markdown/CSV, print/save PDF, or export account JSON.
- **Accounts:** private guest workspaces, email/password accounts, project roles and invite links, personal API tokens and account preferences stored in PostgreSQL.

Current limits:

- **Email:** no delivery; admins copy/send invite links. Password reset has a request screen, but no email sender or completed reset flow.
- **Sync:** workspace JSON edits and their local projection are saved together in IndexedDB before sending. The queue survives reload/close, retries temporary failures in order and uses actor-scoped server receipts to deduplicate replay. Incoming snapshots refresh on reconnect, focus/navigation and every 30 seconds in visible tabs, with pending fields overlaid. Stale edits retain submitted text for review in Storage & sync; access loss purges private snapshots. See [sync behavior](docs/sync.md). Unsubmitted description/comment drafts use `sessionStorage`; app-shell offline caching, binary uploads and account/session actions are outside the queue.
- **Deployment:** one API process with local attachment storage and in-process cleanup. Multiple processes would need shared persistent storage.
- **Attachments:** 25 MiB per file; storage quotas per uploader: 100 MiB for guests, 2 GiB for accounts.
- **Exports:** incomplete round-trips. Account JSON contains user details, groups, projects, lists, labels and items, excluding comments, attachments and association tables; it cannot be reimported. Back up PostgreSQL and uploads separately.
- **Deferred:** OpenAPI, a dedicated job runner, full export/import round-trips, large-project virtualization and Linux screenshot baselines. Sequence-based deltas/SSE, Yjs collaboration and Redis remain possible later options.

## 👥 Visitors and accounts

Visitors get an empty private workspace: **Projects → New project → To do**, the same editing tools as account holders, and no onboarding/reminder banner. The avatar offers **Log in** / **Create account**; `/account` opens login. Signing up or logging in transfers the guest workspace and Inbox, preserving content IDs and existing account work.

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

**Production architecture comes first, Claude Design readability second. Storybook and** `claude-design-sync` **MUST adapt to both.**

- **React:** Typed component APIs, composition, immutable state, and side effects outside render. Keep local interaction state local. [React guidance](https://react.dev/reference/rules/components-and-hooks-must-be-pure).
- **Base UI:** Use its primitives for interaction behavior. Custom components pass through refs and behavioral props correctly when composed through `render`. [Composition guidance](https://base-ui.com/react/handbook/composition).
- **Hono:** Keep validation, authorization, and database work on the server. Preserve the typed RPC client and type-only server imports. [RPC guidance](https://hono.dev/docs/guides/rpc).
- **Zustand:** Use focused selectors for shared client state and compute derived values. Introduce scoped stores when the application needs independent instances. [Zustand guidance](https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript.html).

Preserve the separation between design components, application screens, client data access, and server code. Explicit prop types, named exports, concise behavioral documentation, reusable tokens, and representative stories help Claude Design read the system. Readability does not guarantee faithful reproduction of every interaction. [Claude Design guidance](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design).

Storybook renders the actual application components; its decorators supply props, providers, and API mocks as needed. Storybook configuration and examples stay outside the production import graph. The sync tool associates implementation, CSS, stories, and documentation with one component and handles compatibility translation into the Design kit's current React 18 UMD format. That format must not constrain idiomatic React 19 or Base UI code in the application.

Design-originated changes pass through application checks before acceptance. Adapt visual proposals where needed to preserve accessibility, server boundaries, and state ownership. The sync tool's file discovery and export rules are implementation details we can change to support these priorities.

### Storybook

Storybook is a separate React/Vite component workshop and browser test suite. It renders the actual components in `src/client/design` with the application's layered CSS, fonts, Zustand appearance store, and viewport hooks. Production code never imports stories, mocks, or Storybook addons. Run it independently of the API and PostgreSQL:

```sh
npm run storybook           # http://localhost:6006
npm run build-storybook     # separate output: storybook-static/
npx playwright install chromium  # once, for browser tests
npm run test:storybook
npm run test:storybook -- --coverage  # browser tests + accessibility + V8 coverage
```

The Storybook Testing panel loads the browser project through `vitest.config.ts` and runs it with preview globals. `npm run test:storybook` runs the full four-way theme/mode matrix; `npm test` remains Node-only. Restart Storybook after changing its Vitest configuration.

The first integration covers Button, TextField, Select, Dialog, and ItemCard with colocated typed `.stories.tsx` examples, Autodocs, and browser interaction tests. Theme/mode toolbars follow the existing registry. The viewport toolbar resizes the preview; the actual media queries drive `data-device`, `data-touch`, and `useViewport()`. Viewport width alone does not emulate touch hardware.

The separate Vitest configuration runs stories in all four Rounded/Minimal × Dark/Light scopes using Playwright Chromium, with accessibility failures blocking tests. Like the existing application axe gate, color contrast is excluded: current tokens produce failures on primary buttons and overdue badges and need separate remediation. Accessibility scans include body portals after interactions settle; interaction examples cover selection/search, disabled actions, keyboard activation, and nested dialog Escape behavior. Select's open listbox carries the field's name, and its `OpenList` story ends with the popup open so the scan covers it. Node unit tests, PostgreSQL integration tests, and full application Playwright tests remain separate. CI builds/tests Storybook without starting the API or database.

Story metadata and component manifests provide readable examples for coding agents. Native automatic ingestion by standalone Claude Design is not assumed. The [sync tool](tools/claude-design-sync/README.md) associates stories and colocated documentation with the owning component and translates relevant examples into the Design kit's existing format.

Add stories alongside components as they change, followed by composed views and API mocks when needed. The `/dev/ds` gallery remains available until its useful specimens/checks have migrated. Optional Storybook MCP integration and component screenshot baselines can follow after this foundation; [Storybook AI features](https://storybook.js.org/docs/ai) are currently in preview.

### Claude Design sync

The customizable [sync tool](tools/claude-design-sync/README.md) compares/transfers app and Claude Design changes by feature; the design kit is a creative reference, with limited app parity.

```sh
npm run design-sync -- serve     # http://localhost:4477; loopback only
npm run design-sync:check        # separate tool typecheck + engine tests
```

Configure mappings/harness in `tools/claude-design-sync/config.json`. Pull/upload requires Claude Code with DesignSync access; app ports support Claude Code or Codex. The tool asks for AI-run confirmation and upload selection/approval. Its README covers import/compare/sync-point commands and GUI tests.

## 💻 Local development

Requirements: **Node 22.12+**, npm and running PostgreSQL (development, CI and staging use PostgreSQL 18). On macOS: `brew install postgresql@18 && brew services start postgresql@18`; the formula is keg-only, so its `createdb`/`psql` live in `$(brew --prefix postgresql@18)/bin`.

```sh
cp .env.example .env       # set DATABASE_URL for your machine
createdb todoi_react       # once; match the database name in DATABASE_URL
npm ci
npm run dev
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

Snapshots: `tests/e2e/__screenshots__/`, per platform. Update intentional changes with `npm run test:e2e:update` and commit baselines. [CI](.github/workflows/ci.yml) runs `check`, integration and Chromium tests on Linux with `--ignore-snapshots` until Linux baselines exist. Reports: `.tmp/`, uploaded on CI failure.

Archive/Trash visibility follows parent items/projects; restoring a container preserves children's own states. Permanent deletion cascades; project activity survives item deletion, but disappears with its project. Migration `0006_lifecycle_cleanup.sql` adds the parent foreign key (promoting legacy orphans to top-level) and cleanup outbox. The API removes bytes after commit, draining up to 100 due jobs at startup, after deletion and each minute; retries back off to one hour. Migrate before starting an updated API.
