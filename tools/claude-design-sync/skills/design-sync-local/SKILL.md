---
name: design-sync-local
description: Run Claude Design Sync with a developer on their own machine — import the Project archive they downloaded (or pull), compare the App with Claude Design, run the agreed sync steps in the GUI, merge into their branch and upload kit files. Use when a developer asks, on their laptop or desktop, to sync the App with Claude Design or to work through claude-design-sync with them.
---

# Claude Design Sync on a developer's machine

The developer is at this machine and can see the GUI too. Follow `tools/claude-design-sync/skills/operating-loop.md`; this file fills in the local specifics. For a server checkout or the Dokploy container, use `design-sync-vps` instead.

## The checkout

The developer's own clone, at the repo root. Run step 1 of the loop, then only if they agree:

```bash
git pull --ff-only
npm ci                              # when package-lock.json changed
npx playwright install chromium     # first time only
```

Their uncommitted work is safe: runs use worktrees under `$TMPDIR/cds-runs/`, and Merge refuses to overwrite.

## Design's work

Archives they download from Claude Design land in `~/Downloads`, which the tool already reads, so `npm run design-sync -- import` finds the newest. They can also drop one on the GUI.

## The GUI

`curl -s localhost:4477/healthz` first: the developer may already have it open (`npm run claude-design-sync`). Otherwise start it in the background. It listens on `127.0.0.1` only, with no login.

The developer can click along. Before each action in the GUI, say which control you'll press, and re-read the page if they changed something. If they would rather drive it themselves, guide them step by step using the loop instead.

## Merge and push

Merge goes into their current branch (normally `main`) and stops there: the local server never pushes. Pushing is theirs to decide; offer `git push origin main` only when they ask, noting it deploys staging.

## Upload

The loop's step 6 as written: this session is the Claude Code session that runs the request, and the developer approves DesignSync's prompt in it.
