---
name: design-sync-operator
description: Operate Claude Design Sync for a developer, on their machine, a VPS checkout or the Dokploy container — import the newest Project archive from tools/claude-design-sync/uploads/ or pull through DesignSync, compare, run the agreed sync steps in the GUI with Playwright, merge, upload to Claude Design, and push. Use when asked to sync the App with Claude Design, process a dropped Project archive, or run claude-design-sync on the server.
---

# Operate Claude Design Sync

You are the developer's hands on a checkout of todoi-react. The developer may be remote: they talk to you in this Claude Code session and approve DesignSync prompts here. The tool's [README](../../../README.md) is the reference for what every control does; this skill only says how to drive it from here.

## Where you are

Check `echo "$CDS_HOST"` and `pwd -P` first:

| Environment | Checkout | The GUI |
|---|---|---|
| **Dev machine** | the developer's clone | not running: start it (step 4) |
| **VPS checkout** | normally `/srv/todoi-react` | not running: start it (step 4) |
| **Dokploy container** (`CDS_HOST` set, opened from Dokploy's container terminal) | `/data/repo` | already serving on port 4477 behind a login: don't start a second one; use `http://127.0.0.1:4477` with `CDS_BASIC_AUTH_USER`/`CDS_BASIC_AUTH_PASS` as HTTP credentials |

In the container, `CDS_PUSH_AFTER_MERGE=1` makes **Merge** also push, so treat pressing Merge as a push and ask for both at once. The entrypoint already pulled and installed dependencies at start; repeat step 1 only if the developer pushed since.

## Ground rules

- **Ask before anything that writes outside the tool's own state:** starting a run (it spends tokens), merging, uploading to Claude Design, marking features synced, pushing.
- **Never push without an explicit "push".** Pushing `main` deploys staging (GitHub → CI → Dokploy).
- **Never bypass the tool's guards:** run confirmations, the draft review, upload conflict checks, the `x-cds` header. Do not edit `.state/` by hand.
- **Prefer free paths.** A Project archive import costs nothing; `status`, `pull` and "Check for changes" each cost Claude tokens. Say so before using them.
- Stop and report when a check fails, a merge conflicts, or an upload doesn't check out. Don't work around it.

## 1. Prepare the checkout

From the repo root:

```bash
git status --short && git branch --show-current   # must be main (or the branch the developer named), not detached
git pull --ff-only
npm ci
npx playwright install chromium                    # first time only
```

Report uncommitted changes rather than discarding them; runs work in their own worktrees and leave them alone.

## 2. Bring Design's work in

1. **Archive (preferred, no tokens).** The developer drops Claude Design's **Share → Project HTML → Project archive** `.zip` into `tools/claude-design-sync/uploads/`.

   ```bash
   ls -lt tools/claude-design-sync/uploads/
   npm run design-sync -- import          # newest archive of this project from uploads/ (or ~/Downloads)
   ```

   The import refuses archives of another project. Pass a path to import a specific one.
2. **Pull (costs tokens),** only when there is no fresh archive and the developer agrees: `npm run design-sync -- pull`. It stops early when Design hasn't changed.

## 3. Compare and agree the plan

```bash
npm run design-sync -- compare
```

Summarise for the developer: features changed on both sides first, then App-ahead and Design-ahead, with the units each touches. Propose a direction per feature (Into the App, Into Design, Full sync, Skip) and wait for their decision. Screens, preview cards and guidelines are reference only and never ported.

## 4. Run it in the GUI

Outside the container, start the server in the background and keep it on localhost (it binds `127.0.0.1` unless `CDS_HOST` says otherwise):

```bash
npm run claude-design-sync     # http://localhost:4477
```

Drive the page with Playwright (the Playwright MCP tools if available, otherwise a short script with `@playwright/test`'s `chromium`). Use the labels the README names:

1. Set the plan-wide direction and per-feature rail overrides the developer agreed.
2. **Review selected sync steps** → read the confirmation back to the developer (what gets written where, which snapshot) → start only after their yes.
3. Follow **Activity** until the run stops. Relay failures with the log lines that matter.

## 5. Merge App work

- **Token-only runs:** show the verified commits, then press **Merge** on the developer's yes.
- **Drafts (kit code ported into the App):** the run shows **Review the draft**. Read each finding's diff yourself, summarise every finding for the developer, and tick **I reviewed this draft against these points** only after they confirm. Then Merge.

Merge lands on the checkout's branch. Show `git log --oneline -5` and ask before `git push origin main` (in the container, Merge already pushed; check its summary for "pushed" or "not pushed").

## 6. Upload kit work to Claude Design

In Activity, press **Upload n files from Claude Code**, then **Copy request** (or read the request text from the page). Carry out that request yourself in this session: you have DesignSync. The developer approves DesignSync's plan prompt here. Then press **Check the upload** in the GUI and report its result; files that don't match keep the upload waiting.

## 7. Close the loop

When both sides look right, press **Mark selected features synced** with the features the developer confirms. Unticked features stay open on their old baseline. Stop the server when done, and report: what was imported, what moved each way, what was merged and pushed, what was uploaded, and anything left open.
