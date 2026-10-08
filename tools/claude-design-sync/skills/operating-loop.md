# Claude Design Sync: the operating loop

Shared by the `design-sync-local` and `design-sync-vps` skills, which say where the checkout is, how archives arrive and who pushes. Paths are from the repo root. `tools/claude-design-sync/README.md` is the reference for what every control does; this file only says how to drive the tool.

## Ground rules

- **Ask before anything that writes outside the tool's own state:** starting a run (it spends tokens), merging, uploading to Claude Design, marking features synced, pushing.
- **Never push without an explicit "push".** Pushing `main` deploys staging (GitHub → CI → Dokploy).
- **Never bypass the tool's guards:** run confirmations, the draft review, upload conflict checks, the `x-cds` header. Do not edit `tools/claude-design-sync/.state/` by hand.
- **Prefer free paths.** A Project archive import costs nothing; `status`, `pull` and "Check for changes" each cost Claude tokens. Say so before using them.
- Stop and report when a check fails, a merge conflicts, or an upload doesn't check out. Don't work around it.

## 1. Prepare the checkout

```bash
git status --short && git branch --show-current   # a branch (normally main), not a detached HEAD
```

Report uncommitted changes rather than discarding them; runs work in their own worktrees and leave them alone. Pull and install as your environment's skill says.

## 2. Bring Design's work in

1. **Archive (preferred, no tokens):** Claude Design's **Share → Project HTML → Project archive** `.zip`.

   ```bash
   npm run design-sync -- import          # newest archive of this project in the export folders
   ```

   It looks in `~/Downloads` and `tools/claude-design-sync/uploads/` (or the `CDS_EXPORTS` folders), refuses archives of another project, and takes a path to import a specific one. An archive dropped on the GUI imports there instead.
2. **Pull (costs tokens),** only when there is no fresh archive and the developer agrees: `npm run design-sync -- pull`. It stops early when Design hasn't changed.

## 3. Compare and agree the plan

```bash
npm run design-sync -- compare
```

Summarise for the developer: features changed on both sides first, then App-ahead and Design-ahead, with the units each touches. Propose a direction per feature (Into the App, Into Design, Full sync, Skip) and wait for their decision. Screens, preview cards and guidelines are reference only and never ported.

## 4. Run it in the GUI

Use the server your environment's skill names; start one only if `/healthz` doesn't answer on its port. Drive the page with Playwright (the Playwright MCP tools if available, otherwise a short script with `@playwright/test`'s `chromium`), using the labels the README names:

1. Set the plan-wide direction and the per-feature rail overrides the developer agreed.
2. **Review selected sync steps** → read the confirmation back to the developer (what gets written where, which snapshot) → start only after their yes.
3. Follow **Activity** until the run stops. Relay failures with the log lines that matter.

## 5. Merge App work

- **Token-only runs:** show the verified commits, then press **Merge** on the developer's yes.
- **Drafts (kit code ported into the App):** the run shows **Review the draft**. Read each finding's diff yourself, summarise every finding for the developer, and tick **I reviewed this draft against these points** only after they confirm. Then Merge.

Merge lands on the checkout's branch. Show `git log --oneline -5`. Whether and how it reaches `origin` is your environment's skill's call.

## 6. Upload kit work to Claude Design

In Activity, press **Upload n files from Claude Code**, then **Copy request** (or read the request text from the page). Carry out that request yourself in this session: you have DesignSync. The developer approves DesignSync's plan prompt here. Then press **Check the upload** and report its result; files that don't match keep the upload waiting.

## 7. Close the loop

When both sides look right, press **Mark selected features synced** with the features the developer confirms. Unticked features stay open on their old baseline. Report: what was imported, what moved each way, what was merged and pushed, what was uploaded, and anything left open.
