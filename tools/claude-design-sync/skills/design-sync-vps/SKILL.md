---
name: design-sync-vps
description: Run Claude Design Sync on a VPS for a remote developer, in a server checkout (/srv/todoi-react) or the Dokploy container (/data/repo) — import Project archives dropped into tools/claude-design-sync/uploads/ (or pull), compare, run the agreed sync steps in the GUI with Playwright, merge, upload to Claude Design and push. Use when asked on a server to sync the App with Claude Design or to process a dropped Project archive.
---

# Claude Design Sync on a VPS

The developer is remote: they talk to you in this Claude Code session (over SSH, or Dokploy's container terminal) and approve DesignSync prompts here. They can't see the server's screen, so describe what the GUI shows. Follow `tools/claude-design-sync/skills/operating-loop.md`; this file fills in the server specifics. On a developer's own machine, use `design-sync-local` instead.

## Which setup

`echo "$CDS_HOST"` and `pwd -P`:

| | VPS checkout | Dokploy container |
|---|---|---|
| Recognise it by | `CDS_HOST` unset, normally `/srv/todoi-react` | `CDS_HOST` set, `/data/repo` |
| The GUI | not running: start `npm run claude-design-sync` in the background (`127.0.0.1:4477`, no login) | already serving on port 4477 (started by `deploy/entrypoint.sh`): never start a second one; open `http://127.0.0.1:4477` with `CDS_BASIC_AUTH_USER`/`CDS_BASIC_AUTH_PASS` as HTTP credentials |
| Up to date | run `git pull --ff-only`, then `npm ci` when the lockfile changed, and `npx playwright install chromium` the first time | the entrypoint pulled and installed at start; `git pull --ff-only` only if the developer pushed since (restarting the app does the rest) |
| Merge | stays in the checkout; push with `git push origin main` after the developer's "push" | also pushes (`CDS_PUSH_AFTER_MERGE=1`): ask for merge and push together, then check the summary for "pushed" or "not pushed" |

If neither fits, ask the developer where the checkout is before doing anything.

## Design's work

The developer copies Claude Design's Project archive into `tools/claude-design-sync/uploads/` (with `scp`, rsync or similar), or drops it on the GUI through the domain in the container. Check `ls -lt tools/claude-design-sync/uploads/`, then `npm run design-sync -- import`. Nothing on the server reads their `~/Downloads`.

## Upload

The loop's step 6: you are the Claude Code session that runs the request. Tell the developer when DesignSync's approval prompt is waiting for them in this session.

## Pushing

Pushing `main` deploys staging through GitHub → CI → Dokploy. After a push, tell the developer the commit range so they can pull it on their machine.
