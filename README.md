# Todoi (web application

## Signing in (development)

Better Auth (email + password) guards the app. The seed creates two people with the password `todoi-dev-password`:
`flo@helicopterseurope.com` and `sam@helicopterseurope.com`. Create more accounts at `/signup`; invites come from
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
- Errors and logs: DEFERRED

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

## Current state: barebones core

The data model and API now follow the design spec's vocabulary (groups, projects, lists, items with
subitems, labels, members, comments, relations, saved views, activity, an Inbox per account); the
client is still the placeholder Inbox list until the views land. See `docs/design/glossary.md`.

In place: React + Vite, Hono (typed routes + RPC client), TanStack Query, Drizzle + PostgreSQL, zod validation,
the design-system foundations (tokens, themes × modes, icons, appearance store with Zustand) per `DESIGN.md`.
Deferred until there is something to use them for: Base UI, Better Auth, Tiptap, OpenAPI,
the sync engine, background jobs, hosting. The adoption plan with its checklist lives in
`docs/features/20261001_prepare_using_claude_design_system_in_this_app.md`.

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
`npm run db:generate` (after editing `src/server/db/schema.ts`), `npm run db:studio`.

## Quality gates

`npm run check` runs the typecheck, oxlint + stylelint and the Vitest unit tests. The unit suite covers every pure
module (quick-add and import parsers, date math, repeat rules, Markdown, view-state encoding, filters, export,
shortcuts, item rows) and the **theme-parity audit** (`src/client/design/tokens/parity.test.ts`: every colour token
defined in all four theme × mode scopes, identical token sets, no raw hex or bare z-index in component CSS).

`npm run test:e2e` runs the browser gates in `tests/e2e/` with Playwright against the dev servers (started for you
when nothing listens on :5173; Postgres must be up). They sign in as the seeded dev user and, for each of the four
scopes (Standard / Minimal × Dark / Light), open the list, board, calendar, item overlay and Settings screens, assert
the scope landed on `<html>`, run **axe** (WCAG 2.1 A + AA; serious and critical violations fail), and compare a
**visual-regression** snapshot. Two more specs check the reduced-motion rule and the list keyboard model.

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
