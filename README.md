# todoi (web application)

todoi is a lightweight task manager focused on usability, legibility, speed and support for AI agents.

## 📝 About

- **Public site:** [todoi.com](https://todoi.com) currently serves a separate micro-site with a browser-only task app.
- **Infrastructure notes:** VPS 2 / Dokploy: `http://72.62.177.91/`; Hetzner hosting, Cloudflare CDN. Infrastructure is not defined in this repo.
- **Placeholder history:** v2 went live on 2026-08-21; recorded source: `archive/todoi-placeholder-20260820/` (absent from this checkout).
- **Staging:** [staging.todoi.com](https://staging.todoi.com): Dokploy builds the repo `Dockerfile` with PostgreSQL 18; CI deploys `main` after every gate passes (see [Production](#-production)).
- **Staging database:** `dbstagingtodoireact` in PostgreSQL 18 (also known as `db-staging-todoi-react` in Dokploy on VPS 2).
- **Name:** in our own branding (visual work: the app, emails, the site, marketing) the name is lower case, `todoi`, also at the start of a sentence. Other companies and people may write `todoi` or `Todoi` as they like.
- **Email:** any `@todoi.com` address that fits its purpose: `info@todoi.com` for contact, `no-reply@todoi.com` as the sender (`EMAIL_FROM`).
- **Domains:** we own todoi.com and todoi.org. todoi.com is the default in links, emails, IDs and examples. Some core features will be reused at todoi.org, so a variant built for it may use todoi.org addresses instead (`info@todoi.org`). The development seed's sign-ins (`info@todoi.org`, `gates@todoi.org`) are local fixtures, not mailboxes. We don't own todoi.app, so never use it in links, emails, IDs or examples.
- **Documentation:** [Design spec](DESIGN.md), [glossary](docs/design/glossary.md), [data model](docs/design/data-model-impact.md), [kit notes](docs/design/kit-walkthrough.md), [changelog](CHANGELOG.md). Root `PRODUCT.md` is missing.
- **Planning:** [todo.md](todo.md)
- **Repository:** `git@github.com:xpiu/todoi-react.git`
- **Business development:** `git@github.com:xpiu/todoi-business.git`; [planning](https://github.com/xpiu/todoi-business/blob/main/todo/todo-business.md), [milestones](https://github.com/xpiu/todoi-business/blob/main/todo/milestones-business.md).
- **Native apps:** Android prototype in external repo `todoi-app`; iOS, macOS and Windows apps not initiated.

## 📖 Contents

- [📝 About](#-about)
- [💎 Unique selling propositions](#-unique-selling-propositions)
- [⚡ Quick Start](#-quick-start)
  - [Top commands](#top-commands)
  - [Installation](#installation)
- [✨ Features and limits](#-features-and-limits)
- [🧭 User flow, UI and UX](#-user-flow-ui-and-ux)
  - [Status follows List](#status-follows-list)
  - [Links](#links)
- [👥 Visitors and accounts](#-visitors-and-accounts)
- [🧰 Tech stack](#-tech-stack)
- [🎨 Design](#-design)
  - [Limitations for design tools like claude-design-sync and Storybook](#limitations-for-design-tools-like-claude-design-sync-and-storybook)
  - [Storybook](#storybook)
  - [Claude Design sync](#claude-design-sync)
- [💻 Local development](#-local-development)
- [🚀 Production](#-production)
- [✅ Quality gates](#-quality-gates)
- [QA notes](#qa-notes)

## 💎 Unique selling propositions

These six USPs define the intended commercial positioning of todoi at todoi.com. They describe the product direction; current implementation status is noted below.

1. **Freedom of data storage.** Choose where task data lives, including todoi-hosted storage and external repositories or other supported storage providers, so users retain control of their data and can keep it outside the SaaS.
2. **Freedom of storage format.** Keep tasks in portable, accessible formats, with YAML, JSON and Embridge. Users should be able to choose supported formats, export their work and continue using it with other tools.
3. **Open agent access in the codebase.** Store task files alongside source code so your preferred AI agent can read and update them using its existing file and Git tools, without a separate task-management API integration.
4. **Bidirectional synchronization.** Keep changes made in todoi and changes made directly in external task files synchronized, supporting an ongoing workflow for humans, agents and other tools.
5. **Tasks versioned alongside the work.** Keep task files under Git version control with the code they describe. Developers and agents can commit task updates with code changes, review diffs and trace the history and authorship of task changes using Git.
6. **Substantially lower pricing.** Aim to offer the key task-management workflows our customers need at roughly one-fifth of the price of a major competitor such as Linear. This is a pricing goal, subject to sustainable operating costs and final plan design.

**React implementation status:** Git sync keeps a project in a file in a GitHub repository — Embridge Markdown, JSON or YAML — and syncs both ways with a three-way merge, conflict resolution, undo and push webhooks (see [DESIGN.md › Git sync](DESIGN.md)). It connects with a fine-grained personal access token; a GitHub App install, other storage providers and scheduled syncs are still to come. The client/server synchronization described under [Features and limits](#-features-and-limits) is separate from it. The pricing target is not a published subscription price.

## ⚡ Quick Start

### Top commands

```
npm run dev                   # run local dev environment
npm run claude-design-sync    # run claude-design-sync tool
npm run storybook             # run storybook
```

### Installation

Requires Node 22.22.2+ (22.x), 24.15+ (24.x), or 26+, npm and running PostgreSQL (18 used here). CI (`.nvmrc`) and the production image (`Dockerfile`) pin the same Node 22 release.

```sh
cp .env.example .env       # adjust DATABASE_URL for your machine
createdb todoi_react       # once; match DATABASE_URL
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Migrations and demo data load automatically; see [Local development](#-local-development) for details.

## ✨ Features and limits

- **Workspace:** Project groups, Projects, Lists, Items, Subitems, labels, assignees, watchers, relations, recurrence, covers and attachments. List/Board/Calendar views with filters, sorting and saved views; item overlay with Tiptap descriptions, comments and activity.
- **Status follows List** (was "Link Lists with Status"): a per-project switch on the Projects page (also in Project settings; default on). See [User flow, UI and UX](#-user-flow-ui-and-ux) and [DESIGN.md](DESIGN.md) (Project automation setting).
- **Git sync:** a project kept in a file (Embridge Markdown, JSON or YAML) in a GitHub repository, synced both ways: three-way merge, a conflict dialog or a conflict policy, sync history with undo, and push webhooks. Connect under Settings › Storage & sync with a fine-grained token.
- **Tools:** Inbox capture, filing and notifications; search, command palette, Archive/Trash with Undo, Settings and Account. Reviewed imports: Markdown task lists (Embridge), todoi JSON/YAML project files, Trello JSON or CSV. Export views/items to Markdown/CSV, print/save PDF, or export everything as a restorable `.zip`.
- **QA notes.** With a confirmed `@todoi.com` account, press Ctrl+Shift+F (⌃⇧F on macOS) on any screen to report an issue with an annotated screenshot. See [QA notes](#qa-notes).
- **Accounts:** private guest workspaces, email/password accounts, project roles and invite links, personal API tokens and account preferences stored in PostgreSQL.

Current limits:

- **Email:** account emails (password reset, email confirmation, change of address) and invites to an address go out through Resend when `RESEND_API_KEY` is set; without it they are written to `EMAIL_DIR` (see Production). Mention, assignment and (when switched on) watched-item comment notifications are emailed as well as put in the Inbox, to confirmed addresses only. Inviting people and joining through an invite sent to an address need a confirmed address.
- **Sync:** workspace JSON edits persist in IndexedDB before sending, survive reload/close and retry in order with server deduplication. Snapshots refresh on reconnect, focus/navigation and every 30 seconds in visible tabs, preserving pending fields. Storage &amp; sync retains submitted text for conflict review; access loss purges cached content. Unsubmitted description/comment drafts use `sessionStorage`. App-shell offline caching, binary uploads and account/session actions are outside the queue. See [sync behavior](docs/sync.md).
- **Deployment:** one API process with local attachment storage. Background work runs on a Postgres job queue that several processes can share; multiple processes would still need shared persistent storage for uploads.
- **Attachments:** 25 MiB per file; storage quotas per uploader: 100 MiB for guests, 2 GiB for accounts.
- **Exports:** Export everything writes a `.zip` todoi archive — every project you're a member of (archived and trashed content too), your Inbox, comments with reactions, relations, saved views, activity and the attachment files — and Restore from an export brings it back as new copies (other people's work keeps its attribution in text; other members aren't re-added). Git sync connections, tokens and sign-in methods aren't exported. Up to 512 MB per restore; back up PostgreSQL and uploads for whole-server recovery.
- **Deferred:** OpenAPI, large-project virtualization and Linux screenshot baselines. Sequence-based deltas/SSE, Yjs collaboration and Redis remain possible later options.

## 🧭 User flow, UI and UX

How the app behaves for users.

### Status follows List

**Principle:** the list is an item's location, and Status is a property that follows it. The direction is one-way: the list sets the Status, and a Status pick never moves an item.

The per-project setting was renamed from "Link Lists with Status"; the stored field (`linkStatuses`) is unchanged.

**On:**

- **List field:** always shown in the item window. It is the only control that moves an item, and a move sets the Status from the list's role.
- **Status, list has a role:** locked, reads "Doing · set by list". It opens, but the other options are disabled, a note says to move the item, and "Change list…" opens the List field. A Board card's Status picker locks the same way.
- **Status, every visible list has a role:** hidden; the List field stands for both. It returns, locked, as soon as one list has no role.
- **Status, list without a role, hidden list or Inbox:** editable, and the item stays put.
- **Status differs from the list's role** (a checked item, or a role changed with "Future moves only"): shown and editable.
- **Two lists share a role, or a status has no list:** no special handling.
- **Group by Status:** dropping an item into another Status group, or adding inside one, is a move to the list with that role.

**Off:** List and Status are both shown, both editable and independent.

### Links

A project opens at its short public id (the slug) at the root, and an open item is named by its key:

```text
https://todoi.com/epd5vjxy38?v=board&item=MP-102
                  └ project   └ view  └ open item
```

| Part | Form | Notes |
| --- | --- | --- |
| Project | `/<slug>` | 10 characters, see below. Separate from the database id. |
| View | `v=` | `view=` is taken: it names a saved view. |
| Open item | `item=<key>` | The item's id while it has no key (Inbox items). Upper or lower case, and an old key prefix, still open the item. |

Every link the app writes has this form: address bar, Copy link, the share menu, emails and the calendar feed. Links from before 2026-11-27 (`/p/<id>`, `?item=<id>`) still open, and the address is rewritten to the new form. The rules live in `src/shared/projectLinks.ts`.

#### The slug

- **Form:** 10 characters from 32: lowercase letters and digits without `o`, `0`, `1` and `l` (easy to read aloud and retype), always with at least one digit from 2 to 9.
- **Made by:** the database, when a project is created (`project_slug()`, migration `0025`). The client never makes one.
- **Random source:** PostgreSQL's `gen_random_uuid()`, which draws from the operating system's cryptographic generator. Each byte picks one of 32 characters, and 256 divides evenly by 32, so no character is favoured.
- **Entropy:** 10 × 5 bits = 50 bits. Requiring a digit removes 5.6%, which leaves about 1.06 × 10¹⁵ slugs (2^49.9).
- **Unique:** a unique index, and the function retries on a slug already in use.
- **Not encrypted, not derived:** the slug is random, so it reveals neither the database id nor the project's name, and there is nothing to decode.

#### Access

The slug is an address, not a secret. What protects a project is its read rule, checked on the server for every request (`src/server/access.ts`):

- **A private project stays closed** to someone who has its link.
- **Guessing:** an unknown slug answers 404 and a private project 403, so a correct guess shows only that a project exists. With a million projects, one guess in a billion hits, and one address gets 1,200 requests a minute.
- **Links that are secrets** carry their own token: the private calendar feed uses 256 random bits.

#### Rule for new routes

No top-level route of exactly 10 characters that contains a digit from 2 to 9, so a route can never be mistaken for a project.

#### Decisions (2026-11-27)

- **Project path:** the slug at the root, not `/p/<id>` or a readable name.
- **Host:** the React app has its host to itself. The Next.js build at s.todoi.com is an older prototype without public data, so none of its links are carried over.
- **Timing:** done before the first testing round, so no shared link needs a redirect later.
- **Resetting a project's link:** not built. The separate slug makes it possible later.

## 👥 Visitors and accounts

Visitors get an empty private workspace: **Projects → New project → To do**, with the same editing tools as account holders. The avatar offers **Log in** / **Create account**; `/account` opens login. Signing up or logging in transfers the guest workspace and Inbox, preserving content IDs and existing account work once pending edits have synced.

Better Auth guest cookies last seven days, renewed during use. Refreshing/reopening retains access while valid; clearing cookies or expiry loses guest access. Signing in gives content a durable owner. Passwords require at least 10 characters.

## 🧰 Tech stack

- **Client:** React 19, TypeScript, Vite, Base UI, TanStack Router, Tiptap for some fields, Multiple themes: \`Minimal\` and \`Rounded\`, each theme has a Dark and Light mode.
- **State:** Zustand for client state; TanStack Query for server data and optimistic mutations; IndexedDB for actor-scoped snapshots and outgoing operations.
- **API:** Node.js + Hono typed routes/RPC client, Zod validation. `/api/health` returns `{ "ok": true }`.
- **Data:** PostgreSQL, Drizzle ORM/SQL migrations; integer positions order lists/items, row versions check stale edits, and transactional operation receipts deduplicate replay and are pruned after 30 days.
- **Authentication:** Better Auth sessions/accounts in PostgreSQL; API tokens use `Authorization: Bearer tdi_…`, each read only or read and write, for every project or only picked ones (`src/shared/apiTokens.ts`, enforced in `src/server/access.ts`). Tokens work only on the versioned API `/api/v1` (`src/server/apiV1.ts`: a listed subset of the app's routes, the same handlers); the unversioned `/api` is the app's own. Its OpenAPI 3.1 contract is served at `/api/v1/openapi.json`, generated from the routes' own Zod validators (`src/server/openapi.ts`).
- **Jobs and logging:** a durable job queue in PostgreSQL (`src/server/jobs.ts`, kinds and schedules in `jobKinds.ts`): due jobs are claimed with `SKIP LOCKED`, expired claims are taken over, failures retry with backoff, keys dedupe queued work. It runs Git syncs (webhooks, a reconcile every 10 minutes), the Trash purge after 90 days, the attachment-cleanup outbox and receipt pruning. Shared errors: `src/shared/errors.ts`; faults/refused database writes log JSON with request IDs. Error tracking (`src/server/services/errorTracking.ts`) groups server faults, browser errors (`POST /api/errors`), jobs that gave up and unexpected Git sync failures in `error_groups` by fingerprint; the operator console at `/admin` (confirmed `ADMIN_EMAILS` only) shows them with accounts, the job queue and Git sync health. Resolved errors are forgotten after 30 days quiet. No external log aggregation.

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

The development seed creates verified accounts for `info@todoi.com`, `flo@todoi.com`, `info@todoi.org` and `sam@helicopterseurope.com` with the password `todoi-dev-password`. The `info@todoi.org` sample workspace includes Helicopters Europe projects, MP-115 photos, Sam's comments and a filled Inbox. Seeded starts replenish missing samples. Sign up at `/signup`. Copy invites in **Project settings → Members**. The component gallery is at `/dev/ds`.

Common commands:

- **`npm run check`:** Typecheck, lint and unit tests.
- **`npm run typecheck` / `npm run lint`:** TypeScript; oxlint with `tools/lint/` design rules + stylelint for client CSS. Lint warnings fail the run.
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
- **`RESEND_API_KEY`:** Resend API key for the account and invite emails (sent with `fetch`, no SDK). Unset, every email is written to `EMAIL_DIR` as `.html`, `.txt` and `.json` and logged instead; production warns at start. Until it is set, an operator can mark a person's address confirmed in `/admin` › Accounts, which unlocks what R4 waits for (inviting, joining by address).
- **`EMAIL_FROM`:** Default `todoi <no-reply@todoi.com>`; its domain must be verified at Resend.
- **`EMAIL_REPLY_TO`:** Default `info@todoi.com`; sent as the Reply-To header so replies to the no-reply sender reach the Hostinger inbox.
- **`npm run email:test -- <address>`:** Sends one test email through the same mailer (`src/server/email/sendTest.ts`) with the key and `EMAIL_FROM` from `.env`, and prints Resend's reason if it refuses. Before todoi.com is verified at Resend, add `--from onboarding@resend.dev` (Resend only delivers that sender to the account owner's own address).
- **`QA_REPORT_TO`:** Default `info@todoi.com`; where QA notes are emailed (see [QA notes](#qa-notes)), with Reply-To set to the person who wrote the note.
- **`EMAIL_DIR`:** Default `.data/emails` (`/data/emails` in the Docker image, on the volume); the development transport's folder. Operators see its newest emails, with their links, under Outbox in `/admin`.
- **`SYNC_SECRET_KEY`:** 32+ characters; encrypts the GitHub tokens and webhook secrets Git sync stores. Unset, a key is derived from `BETTER_AUTH_SECRET`, so rotating that secret disconnects every repository.
- **`RATE_LIMIT`:** Default `true` in production, `false` in development. Throttles every request per client address (1200/min), log-ins (30 per 10 min per address), sign-ups (10/h), guest workspaces (30/h), reset and confirmation emails (10/h per address, 5/h per recipient), each API token (600 per 10 min), tokens that don't work (20 per 10 min per address) and account exports (10/h per person), browser error reports (60 per 10 min per person) and GitHub webhooks (120/min per address); a refusal is 429 with `Retry-After`. Counts live in memory, per instance. Wrong passwords are also throttled per account (10 log-ins per 15 min, cleared by a log-in that works or a password reset; 5 wrong ones at "Confirm it's you"), in Postgres and always on. Limits are in `src/server/rateLimit.ts`.
- **`ADMIN_EMAILS`:** Comma-separated sign-in addresses that may open the operator console at `/admin` (errors, QA notes, the job queue, Git sync health, accounts), once the address is confirmed. Default: none in production, the seeded `info@todoi.org` in development.
- **`TRUST_PROXY_HOPS`:** Default `0` (the socket's address). Behind a reverse proxy that appends to `X-Forwarded-For`, set the number of such proxies (usually `1`), or every visitor shares the proxy's address and one budget.
- **`SIGN_UP`:** Default `open` (staging.todoi.com since 2026-11-27, so a visitor lands in the app): anyone may create an account, and every visitor first gets a guest workspace. `invite` (staging.todoi.com while the first testers tried todoi) makes no guest workspaces (a visitor without a session is sent to the log-in page) and creates an account only for an address in `SIGN_UP_EMAILS` or `ADMIN_EMAILS`, an address with an open project invite, or whoever signs up from an open invite link (`/i/:code`) that isn't locked to another address. Existing accounts log in as usual, and `NOINDEX` defaults to on. Social sign-in isn't gated yet: keep it switched off while `invite` is on.
- **`SIGN_UP_EMAILS`:** With `SIGN_UP=invite`, comma-separated addresses that may sign up without a project invite (the testers).
- **`NOINDEX`:** Keeps search engines out: every response carries `X-Robots-Tag: noindex, nofollow` and `/robots.txt` disallows everything. Default `true` with `SIGN_UP=invite`, `false` otherwise; staging.todoi.com sets `true`. Production (todoi.com) leaves it unset so it is indexed.
- **`CSP`:** Default `enforce`. `report-only` sends the same policy as `Content-Security-Policy-Report-Only`: browsers report what it would block (in `/admin`) but block nothing, the way back if a page breaks under it.
- **`TRUST_CLOUDFLARE`:** Default `false`. Behind Cloudflare, `true` counts a request whose address (after `TRUST_PROXY_HOPS`) is one of Cloudflare's edge ranges as its `CF-Connecting-IP`; without it every visitor routed through the same Cloudflare data centre shares one budget. A request that reaches the origin directly can't claim an address this way.
- **`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`:** The OAuth apps behind social sign-in, callback `<APP_URL>/api/auth/callback/github` or `/google`. **Unused for now:** both providers are switched off in `src/shared/socialSignIn.ts` until the lead developer has set up their OAuth apps, so the log-in and sign-up pages show "GitHub login temporarily unavailable" and "Google login temporarily unavailable" under disabled buttons. A provider works once it is switched on there and both of its variables are set.
- **`GITHUB_API_URL`:** Default `https://api.github.com`; GitHub Enterprise, or the fake GitHub the tests run (`tests/fakes/fakeGithub.ts`).

Production startup rejects invalid/missing configuration, development/example secrets, short secrets, non-HTTPS external URLs or enabled seeding. Development uses convenient defaults.

Non-API GET deep links serve HTML; hashed `/assets/*` cache for a year, HTML revalidates. Every response carries baseline security headers (no MIME sniffing, same-origin framing and embedding, no referrer, HSTS for this host), and every page the client serves carries a Content-Security-Policy (`src/server/csp.ts`: scripts from this origin plus the pre-paint script by hash, no eval, `object-src 'none'`, `frame-ancestors 'self'`). What it blocks is reported to `/api/csp-reports` and grouped in `/admin` as CSP errors. `SIGTERM`/`SIGINT` stop new connections and close the database pool, with a 10-second shutdown limit. Fault/refused-write logs carry the client's “ref …” `requestId`.

**Docker (staging):** the `Dockerfile` builds with every dependency and ships a non-root `node:22-slim` image with production dependencies, `dist/`, `dist-server/` and `drizzle/`. It defaults `UPLOAD_DIR=/data/uploads` (mount a named volume at `/data`, one replica) and health-checks `/api/health`, which also names the build (`{ ok, build: { sha, builtAt } }`, shown in Settings › Help › About).

**Deploys (staging.todoi.com):** CI's `deploy-staging` job fast-forwards the `staging` branch to a `main` commit once every gate has passed, and Dokploy (GitHub provider, branch `staging`, Autodeploy on push) builds that branch; a push to `main` alone never deploys. Rules once testers hold real data: never reseed or wipe staging; `src/server/db/migrations.test.ts` (in `npm run check`) refuses a new migration that drops, renames or tightens a column without a `-- reviewed: …` line saying why it's safe; take a dump before deploying such a migration (`docker exec <db container> pg_dump -U <user> -Fc <db> > before-<sha>.dump` on the VPS; the VPS backup job also dumps every Postgres daily); and a migration must accept edits that older clients replay from their offline outbox. To roll back, point `staging` at the previous good commit (`git push --force origin <sha>:staging`); a migration that already ran stays, so roll back code only past additive migrations.

Staging environment (Dokploy › Environment), names only. Saving a change there doesn't touch the running container: it takes effect on the next deploy (CI's, or Deploy in Dokploy), and `/api/health`'s `build.builtAt` tells you whether that has happened yet.

| Key | Staging value |
| --- | --- |
| `NODE_ENV`, `PORT`, `CLIENT_DIR`, `UPLOAD_DIR` | `production`, `3000`, `dist`, `/data/uploads` |
| `APP_URL` | `https://staging.todoi.com` |
| `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SYNC_SECRET_KEY` | secrets; `SYNC_SECRET_KEY` separate from the auth secret |
| `MIGRATE_ON_START`, `SEED_ON_START` | `true`, `false` |
| `TRUST_PROXY_HOPS`, `TRUST_CLOUDFLARE` | `1` (Traefik), `true` |
| `ADMIN_EMAILS` | the operators' sign-in addresses |
| `SIGN_UP`, `NOINDEX` | `open`, `true` (a public guest app, kept out of search engines) |
| `RESEND_API_KEY`, `EMAIL_FROM` | once todoi.com is verified at Resend |

Local production smoke test (PostgreSQL required):

```sh
npm run build
APP_URL=http://localhost:3000 BETTER_AUTH_SECRET=$(openssl rand -base64 32) SEED_ON_START=false MIGRATE_ON_START=true npm start
```

## ✅ Quality gates

- **Unit:** `npm run check` covers parsers, dates, recurrence/completion, Markdown, views, filters, export, shortcuts, item rows, mutations and server configuration/errors. The [theme-parity audit](src/client/design/tokens/parity.test.ts) checks matching token sets across four scopes, valid token references and no raw hex, bare z-index or `@media` in design component CSS.
- **Integration:** `npm run test:integration` reads `.env` and checks PostgreSQL services/routes, including lifecycle cascades, rollback, attachment cleanup/security, completion, moves, duplication, search and notifications. Each test file gets a migrated disposable database and upload directory, removed afterward. The configured database role needs `CREATEDB`; fixtures do not use the application database.
- **Browser:** `npx playwright install chromium` once, then `npm run test:e2e`. Playwright starts/reuses `:5173`; PostgreSQL and seeded accounts are required. List/Board/Calendar, overlay, Settings and saved views cover all four scopes with snapshots and axe WCAG 2.1 A/AA (serious/critical violations fail; **color contrast disabled; Base UI focus guards excluded**). Those snapshots sign in as `gates@todoi.org`, a copy of todoi's samples that every run first resets to the seed, so hand edits to `info@todoi.org` never move a baseline; don't use it by hand. Other specs cover reduced motion, keyboard interaction, guest isolation/account transfers, offline edits, drafts, uploads and editing flows. Fixtures use the development database and are cleaned up afterward.

Snapshots: `tests/e2e/__screenshots__/`, per platform. Update intentional changes with `npm run test:e2e:update` and commit baselines. [CI](.github/workflows/ci.yml) runs `check`, integration tests, Storybook build/tests, `design-sync:check` and app Chromium tests. App screenshots compare against Linux baselines, recorded on CI's runner image by the `linux-baselines` workflow (Actions › Run workflow, then commit its artifact). Playwright reports: `.tmp/`, uploaded on CI failure.

Archive/Trash visibility follows parent items/projects; restoring a container preserves children's own states. Permanent deletion cascades; project activity survives item deletion, but disappears with its project. Attachment cleanup runs after commit and as a job each minute, with retries backing off to one hour. What has been in the Trash for 90 days is deleted for good by the `trash-purge` job. Migrate before starting an updated API.

## QA notes

For todoi's own people, on local, staging and live: an account whose confirmed sign-in address ends in `@todoi.com` (`src/shared/qa.ts`; the seed makes `flo@todoi.com` and `info@todoi.com` in development). An `@todoi.com` account that hasn't confirmed its address yet can open the tool, but Submit answers "Confirm your email address first" and sends the confirmation link again (once); the note and the drawing wait, and Submit works as soon as the link is opened.

- **Summon:** Ctrl+Shift+F (⌃⇧F, the real Control key on macOS) on any screen, also while typing or over a dialog. The same keys hide it; the draft is kept. Esc in the note hides it too.
- **Draw:** the screen freezes as it is (an open menu stays in the picture) and the cursor becomes a pencil: bright red, 3px, anti-aliased. The pencil does not show over the panel. Undo stroke and Clear drawing are in the panel; drag the panel by its title bar.
- **Use the app:** the other half of the Draw switch lets clicks and scrolling through, to bring the app into the state you want to show; the drawing stays on top. Switching back to Draw freezes the new state.
- **Exact capture:** the frozen picture is the page re-rendered from its DOM, because a page cannot read its own pixels silently. Where it looks wrong, the camera button swaps it for the tab's real pixels through the browser's screen-sharing prompt (choose this tab). That picture is a real screenshot: hover states are in it, and so is the mouse pointer where it rests. While the tab is shared Chrome shows its sharing bar, so the picture is that bar shorter than the window.
- **Submit** (or ⌘↵ / Ctrl+↵): the PNG is put together then, the frozen picture with the drawing on top, and sent with the text and the page's context: URL, title, browser, viewport, theme, build, errors the page reported, and the elements under each stroke by tag and `td-*` class.
- **Where it goes:** stored first (`qa_reports`, the PNG under `UPLOAD_DIR`), then emailed to `QA_REPORT_TO` by the `qa-report-email` job (retried while the mail service refuses), subject `[QA local|staging|live] …`, the PNG attached, facts as labelled lines and again as JSON. The operator console (`/admin`) lists the notes, open ones first, with the screenshot and Resolve. `GET /api/qa-reports`, `/api/qa-reports/:id` and `/api/qa-reports/:id/screenshot` serve the stored copy to staff and operators.
- **Local sends are real** when `.env` has a `RESEND_API_KEY`; without one the email and its PNG land in `EMAIL_DIR`.
- **Limits:** the picture is the viewport, not the whole page; hover states are not in the re-rendered still; images from other sites that forbid cross-origin reads come out as placeholders (Exact capture shows them).

## Email

This webapp leans on email for a number of features. We pay for an email provider at Hostinger.

Email provider: Hostinger
Email web browser URL access: https://mail.hostinger.com/
Package subscription for the inbox: "Starter Business Email"
Billing date: 2030-05-01
Auto-renewal of package at Hostinger: on
API access to email for AI agents: yes, via Hostinger
API access token: stored where we normally store keys

## Licence

project by Floris Zuallaert (Github user xpiu) 
