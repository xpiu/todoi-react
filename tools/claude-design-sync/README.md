# Claude Design Sync

A local tool that compares **this repo's React 19 app** (todoi-react) with the **Claude Design project "Todoi Design System"** (a hand-written JSX kit). It shows which features moved on which side, and moves the work across with buttons: one feature at a time, or the whole plan.

```bash
npm run design-sync -- serve        # → http://localhost:4477
```

Then open http://localhost:4477. The tool binds to 127.0.0.1 only.

## What you see

- **The verdict:** one sentence, such as "Since *1 Oct export*, the App moved 12 features, Design moved 5, and 10 changed on both sides".
- **The plan-wide direction**, applied to every feature:
  - **Into the App:** one way, from Design. Kit work is ported into the app.
  - **Full sync:** both ways. App work goes to Design, Design work comes to the App.
  - **Into Design:** one way, from the App. App work is ported into the kit.
- **The ledger:** one ruled line per *feature*, with the App's work on the left and Design's on the right. Each subfeature (component, tokens, spec section, screen, preview card) is listed with its evidence: commit subjects, new props, rule counts, "Minimal twin added".
- **The rail:** the keys between the two columns set the direction for *that* feature: **←** Into the App · **⇄** Full sync · **→** Into Design · **⊘** Skip.
  - Arrows point at the side that receives the work.
  - A key that makes no sense is struck through, and its tooltip says why (for example, there's nothing to pull when Design didn't change the feature).
  - The rail stays quiet: a note appears only where a feature does something other than the plan. Overriding the plan direction shows "· reset".
  - With a key focused, the arrow keys move along the rail.
  - **Subfeatures have their own rail** once a feature is open. A subfeature follows its feature as far as it can (a component that's new in the App has nothing to pull), unless you set it. A set subfeature runs even when its feature is skipped.
  - Preview cards, guidelines and explorations exist only in Design. They're listed as Design work so you see them, but they're reference-only, never ported, so their keys stay on Skip.
- **Opening a feature** (click its title) shows:
  - every subfeature with its file mapping (App paths ↔ kit paths);
  - App and Design diffs since the sync point;
  - live previews of Design cards (rendered with a locally built bundle);
  - the exact steps that will run, each AI step with its full brief (*Read brief*, *Copy brief*), and **Run this feature only**.
- **The plan bar** (bottom): what the decisions add up to and how many steps (merges, AI ports, upload). **Run plan** opens a confirmation that says exactly what will be written where. **Mark synced** records a new sync point and lists every feature. Features the plan moves start ticked. Unticked features, and the skipped parts of ticked ones, **stay open**: they keep their old starting point and show up in the next comparison as "Kept open since …".
- **The footer** names the Claude Design project every pull and upload targets, with its link (`claude.ai/design/p/<id>`). **Edit** takes a project link or id, checks it against your Claude Design projects, and saves it to `config.json`. It refuses while a job is running or waiting to upload. A snapshot remembers the project it was pulled from, and the Design header warns "from another project" until you pull. The top bar's **Claude Design** link opens the same project.
- **Activity** (top right): jobs with a live log, step states and cost. A run that changed kit files stops here at **Upload to Claude Design**: every staged file is listed with a checkbox, cards show whether they render, with previews, and nothing is uploaded until you press Upload. **Discard run…** gives the run up instead. A run's staging copy of the project (`.state/stage/<run>`) is deleted once it is uploaded, discarded, stopped or failed; a failed upload attempt keeps it so you can try again.

## How it works

| Concept | What it is |
|---|---|
| **Sync point** | The App git rev and the Design snapshot taken at the same moment. Comparisons are three-way against it. Optionally tagged `design-sync/<date>` in git. Units kept open when it was recorded (`held`) keep their older baseline. |
| **Design snapshot** | A local copy of the Claude Design project's text files in `.state/snapshots/<id>/files/`. Comes from a **pull** (Claude Code headless + DesignSync), an **import** (a project export, zip or folder), or an **upload** (the previous snapshot plus what you just uploaded). |
| **Unit** | One comparable thing: a component (`components/<area>/X.jsx` + `.d.ts` + `.prompt.md` ↔ `src/client/design/<area>/X.tsx` + `.css`), a token file, a spec section (`readme.md` ↔ `DESIGN.md`, by `##` heading), a screen (`ui_kits/todoi/*` ↔ `src/client/app/*`), or a preview card with its Minimal twin. Mapping rules and renames live in `config.json`. |
| **Feature** | Changed units grouped into work: App commits since the sync point, plus Design preview cards (with the components they render). A card merges with the commit that shares the most units, and hub components (Button, Menu…) don't glue unrelated features together. Cards whose only change is a new Minimal twin become one feature. |
| **Step** | What a direction turns into. **Deterministic merge** for token CSS (a rule-level three-way merge, no AI). **AI port → App** (React 19, repo conventions, `npm run check`, one commit per feature). **AI port → Design** (into a staging copy of the kit, with the twin, readme and Minimal rules). **Upload** (after your approval). |

Statuses, in the tool's words: *changed on both* (both sides moved; red, the one colour), *App ahead*, *Design ahead*, *new in App*, *new in Design*, *in sync*, and *not dated* (no baseline yet for one side).

## Safety

- **AI runs need a confirmation step.**
  - App-side ports run Claude Code (`claude -p`) with permission to edit and to run commands in this repo. Codex (`codex exec`) can be set with `harness.implement` in `config.json`, but it is untested (its output parser is a best guess), so the GUI never offers it.
  - Design-side ports edit only `.state/stage/<run>/`.
- **Uploads go through DesignSync with a locked plan.** Only files you ticked are written, and nothing is ever deleted.
- **An upload never overwrites newer Design work.** First it checks whether the project's `updatedAt` moved since the run's snapshot. If it did, it reads the live copy of every file about to go up and three-way merges Design's edits into the staged copy. A file that doesn't merge (the same lines edited, or deleted in Design) stops the upload, is unticked with the reason, and stays out until you pull and run the feature again.
- **Every upload is read back.** Each written file is fetched again and compared with the staged copy (line endings and trailing whitespace aside). A file that doesn't match, or can't be read back, fails the upload step by name.
- **After an upload, the new snapshot is marked current** (it takes Design's `updatedAt`) only when Design hadn't changed anything else. Otherwise "Check for changes" asks for a pull.
- **POST endpoints require an `x-cds: 1` header**, so other websites in your browser can't trigger runs.
- **The kit is changed file by file on top of the live Design version**, never regenerated wholesale.

## CLI

```bash
npm run design-sync -- status                      # Design project's updatedAt (via Claude Code)
npm run design-sync -- pull [--force]              # pull into a new snapshot (~3 min, ~$2 with Sonnet); stops early when Design hasn't changed
npm run design-sync -- import ~/Downloads/x.zip    # or an unzipped export folder
npm run design-sync -- compare [--base <id>]       # print features per status
npm run design-sync -- sync-point "label" [--tag]  # record App HEAD + newest snapshot (marks everything synced; keep features open from the GUI)
npm run design-sync -- twin components/x/y.card.html          # write the Minimal twin of a card
npm run design-sync -- bundle <projectDir>                    # local stand-in for _ds_bundle.js
npm run design-sync -- check-cards <projectDir> <cards…>      # render cards in Chromium, report errors
```

The last three are what the AI harness uses to check kit work before you upload it.

## Configuration

`config.json` holds:
- the Design project id;
- where each side keeps components, tokens, spec and screens;
- ignore globs, renames (`SavedViews.jsx` ↔ `SavedViewTabs.tsx` …) and screen mappings;
- the harness (`implement`: `claude`, or the untested `codex`; binaries, `pullModel`, `implementModel`).

Environment overrides (used by the tests): `CDS_REPO`, `CDS_STATE`, `CDS_CONFIG`, `CDS_PORT`, `CDS_FAKE_HARNESS=1` + `CDS_FAKE_DESIGN=<folder>` (a stand-in harness that serves a local folder as the Design project; both are required, and `design-sync:demo` sets them up).

## Tests

```bash
npm run design-sync:check   # typecheck + engine tests
npm run design-sync:e2e     # GUI flows (Playwright, against a throwaway fixture on :4478)
npm run design-sync:demo    # the same fixture world, to click through by hand at http://localhost:4478
```

The engine tests build a throwaway git repo and two Design folders. The GUI tests run the full loop against that fixture with the fake harness:
- compare;
- the three directions, globally and per feature;
- rail overrides and keyboard;
- diffs and briefs;
- axe and phone width;
- run → upload approval → upload → mark synced.

## Limits worth knowing

- **A pull that misses files says so.** A file still failing after a retry is kept as it was in the previous snapshot, so it never reads as deleted in Design. Its units say "Not pulled", the Design header shows "N files not pulled" with **Pull again**, and the snapshot never passes as current.
- **A pull first asks whether Design changed.** If the project's `updatedAt` matches the newest complete snapshot from the same project, it stops there ("Already up to date") and reads no files.
- **Pulls are content pulls.** DesignSync has no per-file timestamps, so "Check for changes" compares the project's `updatedAt` with the snapshot's, and a pull reads every text file again. Binaries, uploads and Claude Design's generated `_ds_bundle.js` are skipped. Previews use a locally built bundle.
- **Only Claude Code can talk to Claude Design** (DesignSync). Codex could do App-side ports only, and is untested.
- **Feature grouping is heuristic.** Commit subjects make the best feature titles, so conventional, one-feature commits make this tool read like a changelog.
