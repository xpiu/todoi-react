# Todoi web application

## ToC

- [About the Todoi web application](#about-the-todoi-web-application)
- [Tech stack](#tech-stack)
- [Current state: barebones core](#current-state-barebones-core)
- [Local development](#local-development)
- [Project structure](#project-structure)

## About the Todoi web application

Name: Todoi
Summary: A lightweight, fast task manager.
Production URL: https://todoi.com
Staging URL: st.todoi.com
Github repo: coming later

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

Only the thinnest vertical slice exists so far, on purpose: one `items` table, a Hono JSON API
for it, and a React list that adds, updates and deletes items with optimistic mutations.

In place: React + Vite, Hono (typed routes + RPC client), TanStack Query, Drizzle + PostgreSQL, zod validation.
Deferred until there is something to use them for: Base UI, Zustand, Better Auth, Tiptap, OpenAPI,
the sync engine, background jobs, hosting.

## Local development

Requirements: Node 22+, a local PostgreSQL.

```sh
cp .env.example .env        # then set DATABASE_URL for your machine
createdb todoi_react        # once
npm install
npm run db:migrate          # applies migrations from ./drizzle
npm run dev                 # API on :3000, Vite on :5173 (proxies /api to the API)
```

Other scripts: `npm run typecheck`, `npm run build`, `npm run db:generate` (after editing
`src/server/db/schema.ts`), `npm run db:studio`.

## Project structure

```
src/client/   React app (Vite entry: index.html -> src/client/main.tsx)
src/server/   Hono API, Drizzle schema and DB client (entry: src/server/index.ts)
src/shared/   Code used by both: status ids, zod request schemas
drizzle/      Generated SQL migrations
```
