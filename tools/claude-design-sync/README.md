# Claude Design Sync

A local tool that compares **this repo's React 19 app** (todoi-react) with the **Claude Design project "Todoi Design System"** (a hand-written JSX kit). It shows which features moved on which side, and moves the work across with buttons: one feature at a time, or the whole plan.

```bash
npm run design-sync -- serve        # → http://localhost:4477 (127.0.0.1 only)
```

- **Needs** Claude Code (`claude`) on PATH and signed in to claude.ai: it is the only harness with DesignSync.
- **The GUI is bundled on every `serve`** (into `dist/`), so restart after pulling tool changes.
- **First run:** with no snapshot yet, the page offers **Pull the project** (through Claude Code) or **Import an export** (a zip or an unzipped folder).

## A typical loop

1. **Check for changes** in the Design column header, then **Pull now** if Design moved.
2. Read the verdict and the ledger. Pick a plan-wide direction, and override single features or subfeatures on the rail.
3. **Run plan** (or **Run this feature only**).
4. In **Activity**, **Merge** the App branch and approve the **Upload** of the staged kit files.
5. **Mark synced** when both sides look right.

## Plan page (`/`)

- **Top bar:**
  - **Since:** the sync point to compare from.
  - **Recompare:** re-reads the App and the newest snapshot.
  - **Activity:** shows a live square while a job runs.
  - **Plan · Mapping:** the two pages.
  - **Claude Design:** opens the target project.
- **Verdict:** one sentence, e.g. "Since *1 Oct export*, the App moved 12 features, Design moved 5, and 10 changed on both sides".
- **Plan-wide direction**, applied to every feature:
  - **Into the App:** Design work is ported into the app.
  - **Full sync:** both ways.
  - **Into Design:** App work is ported into the kit.
- **Column heads:**
  - **App:** the HEAD and any uncommitted changes.
  - **Design:** the snapshot, with **Check for changes**, then **Pull now** when it's behind.
  - **Design warnings:** "from another project" and "N files not pulled", each with a pull link.
- **Ledger:** one ruled line per *feature*, App work left, Design work right.
  - Each subfeature (component, tokens, spec section, screen, preview card) is listed with its evidence: commit subjects, new props, rule counts, "Minimal twin added".
  - **"N units in sync"** at the bottom lists everything that matches.
- **Rail** (between the columns): **←** Into the App · **⇄** Full sync · **→** Into Design · **⊘** Skip, set per feature.
  - Arrows point at the side that receives the work.
  - **Unavailable keys** are struck through, and their tooltip says why (nothing to pull when Design didn't change the feature).
  - **Notes** appear only where a feature differs from the plan; an override offers "· reset".
  - **Keyboard:** arrow keys move along a focused rail.
  - **Subfeatures** get their own rail once a feature is open. They follow their feature as far as they can (a component new in the App has nothing to pull), unless set. A set subfeature runs even when its feature is skipped.
  - **Preview cards, guidelines and explorations** exist only in Design. They are listed as Design work but are reference-only and never ported, so their keys stay on Skip.
- **An open feature** (click its title) shows:
  - each subfeature's file mapping, with App and Design diffs since the sync point;
  - live card previews, rendered with a locally built bundle;
  - the exact steps that will run, each AI step with its brief (*Read brief*, *Copy brief*), and **Run this feature only**.
- **Plan bar** (bottom): what the decisions add up to (merges, AI ports, upload).
  - **Run plan** confirms first, saying what will be written where.
  - **Mark synced** records a new sync point and lists every feature. Features the plan moves start ticked. Unticked features, and the skipped parts of ticked ones, **stay open**: they keep their old baseline and reappear as "Kept open since …".
- **Activity** (right panel): jobs with a live log, step states, cost, and **Stop**.
  - **Merge into the App:** a run with App work stops here, listing the verified commits.
  - **Upload to Claude Design:** a run that changed kit files stops here. Every staged file has a checkbox, a render check for cards, and a preview. Nothing goes up until you press Upload.
  - **Discard run…** gives up whatever still waits: the staged files and the App branch.
- **Footer:** the Claude Design project every pull and upload targets, with its `claude.ai/design/p/<id>` link.
  - **Edit** takes a link or an id, checks it against your projects, and saves it to `config.json`.
  - It is refused while a job runs or an upload waits.
  - Snapshots remember their project, which is what triggers the "from another project" warning.

## Mapping page (`/mapping`)

How this repo and the Claude Design project pair up, on one page.

- **Top:**
  - the project, the App (branch, HEAD), the Design snapshot and the sync point (with App commits since);
  - each side's freshness ("Up to date when asked", "HEAD moved", "Not asked yet", "N files not pulled"), with the action that fixes it: Check for changes, Pull now or Recompare;
  - **Bring the mapping up to date**, which asks Claude Design, pulls if the snapshot is behind or incomplete, and recompares;
  - the six steps of the mapping technique.
- **Diagram:** one row per lane: tokens, components, spec, screens, preview cards, guidelines, left out. App is on the left, Design on the right, the tool in the middle.
  - **The middle** names each lane's technique: CSS merge, AI port, reference only.
  - **Tracks:** the top track carries App work into Design, the bottom one Design work into the App. A track animates while work waits, with the count.
  - **An open lane** shows how files pair up, how each direction moves, the pairs pinned in `config.json`, its units (filters: changed, all, in sync, one side only), and its recent moves.
- **Recent imports and exports:** newest first, each with its files per lane. It lists pulls, imports, uploads, App merges, runs still waiting, and sync points.
  - **Show on the diagram** replays a move on its lanes and dims the rest.
  - **Log** opens the job in the plan's Activity panel (`/?job=<id>`).

## How it works

| Concept | What it is |
|---|---|
| **Sync point** | The App git rev plus the Design snapshot taken with it. Comparisons are three-way against it.<br>Optionally tagged `design-sync/<date>` in git.<br>Units kept open (`held`) keep their older baseline. |
| **Design snapshot** | A copy of the project's text files in `.state/snapshots/<id>/files/`, from one of three sources:<br>a **pull** (headless Claude Code + DesignSync);<br>an **import** (a project export);<br>an **upload** (the previous snapshot plus what went up). |
| **Unit** | One comparable thing:<br>a component (`components/<area>/X.jsx` + `.d.ts` + `.prompt.md` ↔ `src/client/design/<area>/X.tsx` + `.css`);<br>a token file;<br>a spec section (`readme.md` ↔ `DESIGN.md`, by `##` heading);<br>a screen (`ui_kits/todoi/*` ↔ `src/client/app/*`);<br>a preview card with its Minimal twin.<br>Pairing rules and renames live in `config.json`. |
| **Feature** | Changed units grouped into work: App commits since the sync point, plus Design preview cards (with the components they render).<br>A card joins the commit that shares the most units.<br>Hub components (Button, Menu…) don't glue features together.<br>Cards whose only change is a new Minimal twin become one feature. |
| **Step** | What a direction turns into:<br>a **CSS merge** for token CSS (rule-level three-way, no AI);<br>an **AI port → App** (React 19 and the repo's conventions, one commit per port, on the run's branch);<br>an **AI port → Design** (into a staging copy of the kit, with the twin, readme and Minimal rules);<br>an **Upload** (after approval). |

Statuses: *changed on both* (red, the tool's one colour), *App ahead*, *Design ahead*, *new in App*, *new in Design*, *in sync*, *not dated* (no baseline yet on one side).

## Safety

- **AI runs need a confirmation.**
- **App work never touches your checkout.**
  - Ports and token merges run in a git worktree at `$TMPDIR/cds-runs/<repo>-<hash>/<run>`, with `node_modules` linked in.
  - That worktree is on a new branch `design-sync/run-<id>` from HEAD, so uncommitted changes are safe.
  - Claude Code (`claude -p`) may edit and run commands there, and reads the Design snapshot.
  - A detached HEAD is refused.
- **The tool checks the work itself.**
  - Each port must commit and leave nothing uncommitted, or the run stops.
  - Then `app.check` (`npm run check`) must pass on the branch.
  - A failed run keeps its branch for a look; **Discard** removes it.
- **Nothing reaches your branch until you press Merge.**
  - It fast-forwards when it can and makes a merge commit when you committed meanwhile.
  - A conflict changes nothing and says so.
  - It refuses when your checkout moved to another branch.
  - After a merge, the branch and worktree are removed.
- **Design ports** edit only `.state/stage/<run>/`.
  - The stage is deleted once the run is uploaded, discarded, stopped or failed.
  - A failed upload keeps it for a retry.
- **Uploads go through DesignSync with a locked plan:** only the ticked files are written, nothing is deleted, and the kit is changed file by file on top of the live version, never regenerated.
- **An upload never overwrites newer Design work.**
  - If the project's `updatedAt` moved since the run's snapshot, the live copy of each file is three-way merged into the staged copy first.
  - A file that won't merge (same lines edited, or deleted in Design) stops the upload. It is unticked with the reason, and stays out until you pull and rerun the feature.
- **Every upload is read back** and compared with the staged copy, ignoring line endings and trailing whitespace. A file that doesn't match, or can't be read, fails the step by name.
- **The post-upload snapshot is marked current** (it takes Design's `updatedAt`) only when Design changed nothing else. Otherwise "Check for changes" asks for a pull.
- **POST endpoints require an `x-cds: 1` header**, so other sites in your browser can't trigger runs.
- **Codex** (`codex exec`, via `harness.implement`) is untested, with a best-guess output parser, so the GUI never offers it. It could only do App ports anyway.

## Limits

- **Pulls are content pulls.**
  - DesignSync has no per-file timestamps, so "Check for changes" compares the project's `updatedAt` with the snapshot's.
  - A pull first makes the same check, and stops with "Already up to date" when the newest complete snapshot from the same project matches. Otherwise it reads every text file (~3 min, ~$2 with Sonnet).
  - Binaries, uploads and the generated `_ds_bundle.js` are skipped. Previews use a locally built bundle, and borrow the App's fonts and covers (`assetFallbacks`).
- **A pull that misses files says so.**
  - A file still failing after a retry keeps its previous snapshot's content, so it never reads as deleted in Design.
  - Its units say "Not pulled", the header offers **Pull again**, and the snapshot never passes as current.
- **Feature grouping is heuristic.** Commit subjects make the titles, so one-feature conventional commits make the tool read like a changelog.
- **Jobs survive a restart, but a running job doesn't.** Waiting runs persist in `.state/jobs/`. A job that was running when the server stopped is marked failed, and its App branch is kept for a look.
- **The Mapping history** knows only what the tool recorded (snapshots, sync points, its jobs). Whether Design changed is known only after asking since the server started.

## CLI

```bash
npm run design-sync -- serve                       # the GUI (CDS_PORT to move it)
npm run design-sync -- status                      # Design project's updatedAt (via Claude Code)
npm run design-sync -- pull [--force]              # new snapshot; stops early when Design hasn't changed
npm run design-sync -- import ~/Downloads/x.zip    # or an unzipped export folder
npm run design-sync -- compare [--base <id>]       # print features per status
npm run design-sync -- sync-point "label" [--tag]  # App HEAD + newest snapshot (marks all synced; keep features open from the GUI)
npm run design-sync -- twin components/x/y.card.html          # write a card's Minimal twin
npm run design-sync -- bundle <projectDir>                    # local stand-in for _ds_bundle.js
npm run design-sync -- check-cards <projectDir> <cards…>      # render cards in Chromium, report errors
```

The last three are how the AI harness checks kit work before you upload it.

## Configuration

`config.json` holds:

- **`design`:**
  - the project id and name (the footer's Edit writes these);
  - where the kit keeps components, tokens, spec and screens;
  - ignore globs;
  - `assetFallbacks`: kit asset folders that previews read from the App instead.
- **`app`:**
  - the same roots in the repo;
  - ignore globs;
  - `check`: the command a run's branch must pass before it can merge.
- **`renames`** (`SavedViews.jsx` ↔ `SavedViewTabs.tsx` …) and **`screens`:** pairs that path rules can't find.
- **`syncTagPrefix`:** `design-sync/`.
- **`harness`:**
  - `implement`: `claude`, or the untested `codex`;
  - the binaries;
  - `pullModel` and `implementModel`.

Environment overrides, used by the tests:

- `CDS_REPO`, `CDS_STATE`, `CDS_CONFIG`, `CDS_PORT`.
- `CDS_FAKE_HARNESS=1` plus `CDS_FAKE_DESIGN=<folder>`: a stand-in harness that serves a local folder as the Design project. Both are required; `design-sync:demo` sets them up.

## State on disk

`.state/` is gitignored and holds:

- `snapshots/<id>/` (meta plus files);
- `sync-points.json`;
- `jobs/<id>.json` (logs and approvals);
- `stage/<run>/` (Design staging copies, pruned on start);
- `cdn/` (cached unpkg scripts for card renders).

Run worktrees live outside the repo, under `$TMPDIR/cds-runs/`.

## Code and tests

- **`src/engine`:** comparison, plan, merges, snapshots, DesignSync, worktrees, lanes.
- **`src/server`:** the Hono API, jobs, mapping history.
- **`src/ui`:** React 19, plain CSS on the App's tokens.
- **Design docs:** [DESIGN.md](DESIGN.md) (the GUI's design system) and [PRODUCT.md](PRODUCT.md) (who it's for and why).

```bash
npm run design-sync:check   # typecheck + engine tests
npm run design-sync:e2e     # GUI flows (Playwright, throwaway fixture on :4478)
npm run design-sync:demo    # the same fixture world to click through, at http://localhost:4478
```

The engine tests build a throwaway git repo and two Design folders.

The GUI tests run the full loop against that fixture with the fake harness:

- comparison and the three directions (globally, per feature and per subfeature, by keyboard);
- diffs and briefs;
- axe and phone width;
- a run that stops for merge and upload, the upload conflict guard, discard, merge, upload and mark synced;
- switching the target project in the footer;
- check, pull, and up to date;
- the Mapping page: lanes, replaying a move, bringing the data up to date.
