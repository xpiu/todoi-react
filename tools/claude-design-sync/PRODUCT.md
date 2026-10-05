# Claude Design Sync — product

Scope: this tool only (`tools/claude-design-sync/`). Todoi's own product truth lives in the repo root (`DESIGN.md`, `README.md`).

## User and job

- **Who:** the Todoi web developer, working solo (confirmed 2026-10-05).
- **When:** every few days, on a local machine, after either side has moved. Some days the React app in this repo (`todoi-react`) is ahead; other days the Claude Design project "Todoi Design System" is ahead.
- **Job:** see what is new on which side, decide per feature, and move work across — one feature (or a small batch) at a time — without losing the other side's changes.

## What it makes possible

- **A three-way comparison:** this repo now, Claude Design now, and the last sync point (a `design-sync/<date>` git tag plus the Design snapshot taken then).
- **Readable drift:** which components, tokens, spec sections, screens and preview cards are new or changed on each side, backed by evidence (commit subjects, prop changes, rule counts, spec text).
- **Concrete proposals with buttons:** deterministic merges where both sides speak the same language (token CSS), and AI briefs where they don't (React 19 TSX in the repo ↔ the kit's hand-written React-18 UMD JSX, `.d.ts` contracts, `.prompt.md` usage notes, `*.card.html` previews with Minimal twins).
- **Local AI execution:** each brief can be copied, or run on click (after a confirmation step) with the local coding harness — Claude Code (`claude -p`) — with the log streamed into the tool (confirmed 2026-10-05). Codex (`codex exec`) stays a config-only option until it can be tested (2026-10-05: no working install).
- **Design data in two ways:** a harness pull through Claude Code's DesignSync tool into a local snapshot, or a project export (zip or folder) dropped in (confirmed 2026-10-05).

## Constraints

- Uploads to Claude Design go only through DesignSync (Claude Code with a claude.ai login). An upload always shows the exact file list first, and the developer approves it.
- Never delete on either side without an explicit, separate confirmation.
- The kit is hand-authored; never replace it wholesale (no `/design-sync` style regeneration). Change it file by file, on top of the live Design version.
- Repo conventions from `CLAUDE.md` and `DESIGN.md` apply to anything the tool writes into `src/`: avoid duplication, use tokens only, and commit after each feature.
- The tool runs locally and binds to localhost only. No accounts.

## Platform and stack

- **Platform:** web, desktop-first (a developer's laptop). A narrow window must still work.
- **Stack:** chosen to match the repo, since the user delegated it. React 19 + TypeScript UI built with esbuild, a Hono server on Node (run with `tsx`), Vitest for the engine, Playwright for the GUI.

## Terminology

Use the repo's canonical words: Account → Group → Project → List → Item → Subitem. "Kit" means the Claude Design project's files; "app" means this repo. Sides are named **App** (this repo) and **Design** (Claude Design).
