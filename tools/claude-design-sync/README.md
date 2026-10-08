# Claude Design Sync

A local tool that compares **this repo's React 19 app** (todoi-react) with the **Claude Design project "Todoi Design System"** (a hand-written JSX kit). It shows which features moved on which side, and moves the work across with buttons: one feature at a time, or the whole plan.

## Contents

- [Architecture and design-tool priorities](#architecture-and-design-tool-priorities)
  - [Storybook examples in sync](#storybook-examples-in-sync)
- [Start the tool](#start-the-tool)
  - [Run it on a server](#run-it-on-a-server)
- [A typical loop](#a-typical-loop)
- [Plan page (`/`)](#plan-page-)
- [Mapping page (`/mapping`)](#mapping-page-mapping)
  - [Kit drafts from Storybook](#kit-drafts-from-storybook)
- [How it works](#how-it-works)
- [Safety](#safety)
- [Limits](#limits)
- [CLI](#cli)
- [Configuration](#configuration)
- [State on disk](#state-on-disk)
- [Code and tests](#code-and-tests)

## Architecture and design-tool priorities

**Production architecture comes first, Claude Design readability second. Storybook and this sync tool must adapt to both.** See the application's [architecture policy](../../README.md#limitations-for-design-tools-like-claude-design-sync-and-storybook).

- **React:** typed component APIs, composition, immutable state, and side effects outside render. Keep local interaction state local. [React guidance](https://react.dev/reference/rules/components-and-hooks-must-be-pure).
- **Base UI:** retain its interaction primitives and pass refs and behavioral props through composition correctly. [Composition guidance](https://base-ui.com/react/handbook/composition).
- **Hono:** validation, authorization, and database work stay on the server; preserve the typed RPC client and type-only server imports. [RPC guidance](https://hono.dev/docs/guides/rpc).
- **Zustand:** use focused selectors, compute derived values, and introduce scoped stores when the application needs independent instances. [Zustand guidance](https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript.html).

Clear prop types, named exports, behavioral documentation, tokens, and real examples help Claude Design read the application. Readability does not guarantee faithful reproduction of every interaction. [Claude Design guidance](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design).

Storybook renders the application's actual components; decorators supply their environment. The sync tool must associate implementation, CSS, stories, and documentation with the same component rather than interpreting every `.tsx` file as a component. Its discovery and export rules are flexible implementation details.

Compatibility translation belongs here: export suitable examples into the kit's `.prompt.md` notes and preview cards, adapting React 19/Base UI code to the kit's current React 18 UMD runtime as needed. Never reshape the production architecture to match the kit runtime. Design-originated changes must pass application checks before acceptance, including accessibility, server boundaries, and state ownership.

### Storybook examples in sync

The inventory groups `<Name>.stories.ts`, `<Name>.stories.tsx`, and colocated `<Name>.mdx`, `<Name>.md`, or `<Name>.prompt.md` with `<Name>.tsx`/`.ts` and its CSS. These examples are never discovered as separate components. Changes to examples count as changes to their owner, so story-only edits can enter a sync plan. Configured `app.ignore` rules still apply to companions.

Port briefs list the current examples (untracked new stories included) as files to read whole. Claude Code translates useful variants and compositions into the kit's usage notes and preview cards. Storybook imports, spies, decorators, and test code must stay out of the kit runtime. This uses the existing AI port and staged-upload workflow; it does not assume a native Storybook connector in Claude Design or automatically upload examples.

See the application's [Storybook guide](../../README.md#storybook) for commands and coverage. When a port changes a component's behavior, maintain its stories and run `npm run test:storybook` as well as the application checks before accepting the port.

## Start the tool

```bash
npm run claude-design-sync          # → http://localhost:4477 (127.0.0.1 only, unless hosted)
```

- **Needs** Claude Code (`claude`) on PATH and signed in to claude.ai: it is the only harness with DesignSync.
- **The GUI is bundled on every `serve`** (into `dist/`), so restart after pulling tool changes.
- **First run:** with no snapshot yet, the page offers the two ways in (below).

### Run it on a server

The tool runs in two environments. Nothing below changes the local default (`127.0.0.1`, no login, no push).

**A Claude Code operator, anywhere.** Run Claude Code (signed in to claude.ai, with Playwright) in a checkout, such as `/srv/todoi-react` on a VPS, and ask it to follow the [design-sync-operator skill](.claude/skills/design-sync-operator/SKILL.md). Start Claude Code in `tools/claude-design-sync/` so it finds the skill, or name the file. Claude drives the GUI on localhost with Playwright and carries out the upload request itself; you approve DesignSync's prompt in that session. Drop Project archives into `uploads/` (gitignored); `npm run design-sync -- import` takes the newest.

**Hosted in Dokploy, e.g. at design.todoi.com.** [`deploy/`](deploy/) holds a toolchain image (Node, git, Claude Code, Chromium's libraries). On start it clones the repo onto the `/data` volume, pulls, runs `npm ci` when the lockfile changed, and serves the tool from that clone, so the tool always matches the pushed repo and redeploys keep snapshots, jobs and the Claude login.

1. Create a Dockerfile application from this repo: Dockerfile `tools/claude-design-sync/deploy/Dockerfile`, build context `tools/claude-design-sync/deploy`.
2. Paste [`deploy/dokploy.env.example`](deploy/dokploy.env.example) into Environment and fill it in. Use the same Basic Auth pair under **Advanced → Security**: the proxy and the server both check it, so the port is never open even if it gets published.
3. Mount a volume at `/data`. Add the domain on port 4477, and publish no ports.
4. After the first start, sign Claude Code in once from Dokploy's container terminal (`claude`, then `/login`); the login lives on the volume. `CLAUDE_CODE_OAUTH_TOKEN` is the alternative.

Then use the GUI at the domain. Archives arrive by drag and drop. **Merge** also pushes the branch to `origin` (`CDS_PUSH_AFTER_MERGE=1`), which deploys staging through CI; a failed push leaves the merge in place and says so in Activity. Uploads hand over to Claude Code as usual: run the request in the container terminal. Restart the application to pick up new commits, or run `git pull` in `/data/repo`.

| Variable | Default | Hosted |
|---|---|---|
| `CDS_HOST` | `127.0.0.1` | `0.0.0.0`; anything beyond loopback refuses to start without a login |
| `CDS_BASIC_AUTH_USER`, `CDS_BASIC_AUTH_PASS` | unset | required; `/healthz` stays open for the health check |
| `CDS_PUSH_AFTER_MERGE` | off | `1` |

## Bringing Design's work in: import or pull

**Import project archive** is always visible on Plan and Mapping; it opens the download-and-import guide without a Claude Code status check. First run shows the guide immediately. **Bring the changes in** and **Bring the mapping up to date** also open it when Design is behind.

The archive entry always shows the current archive or snapshot, its import time and file count, where its extracted files are stored, and whether the active comparison loaded it successfully. The last three successful archive imports remain visible, including while the guide is open. Their history survives reloads. New imports preserve the original filename (and source path for local path imports); older imports use their existing labels. The app compares the stored extracted files; browser-picked ZIPs are removed after extraction.

- **Import an export (no tokens).** In Claude Design, choose **Share → Project HTML → Project archive → Export** to download the project as a .zip. The tool lists this project's exports from `~/Downloads` and the tool's `uploads/` drop folder (newest first, last 30 days) and looks again whenever its window regains focus. Each export says whether it was downloaded after Design's last change, as far as the last check knows. You can also drop a .zip on that side, choose one, or import an unzipped folder by its path.
  - An export's project is read from its manifest: Claude Design names the bundle namespace `<Name>_<first six characters of the project id>`. Exports of other projects never show up, and importing one is refused.
  - An import downloaded at least 2 minutes after Design's last change reads as current in the GUI. It never claims Design's `updatedAt`, so an upload built on it still reads Design's live copies and merges newer edits first, and a later pull still reads everything.
- **Pull with Claude Code (costs tokens).** Expand **Alternative: pull with Claude Code** beneath the archive guide. It shows what the last complete pull cost and how long it took.

The guide labels Project archive **Recommended · No tokens**, always shows the exact download steps, and highlights **Project archive** and **Export**. Its primary action opens Claude Design when a fresh archive is needed, or imports the selected archive when it covers the last known change (or no check is available). The paid pull stays secondary.

Choose **Project archive**, which the export dialog labels instant and free. **Standalone HTML** uses Claude and counts toward usage limits. The [archive investigation](../../docs/features/20261008_claude_design_project_archive_investigation.md) verifies source fidelity, existing import support, and savings against recorded full pulls.

## A typical loop

1. **Check for changes** in the Design column header, then **Bring the changes in** if Design moved: import a fresh export, or pull.
2. Read the verdict and the ledger. Pick a plan-wide direction, and override single features or subfeatures on the rail.
3. **Review selected sync steps** (or **Run this feature only**).
4. **Merge** the App branch: the button appears in the navbar, above the verdict, in the plan bar and in Activity as soon as the run's check passes. Upload the staged kit files from **Activity**: **Upload n files from Claude Code** gives you a request to paste into Claude Code, where you approve DesignSync's prompt; then **Check the upload**.
5. **Mark selected features synced** when both sides look right.

## Plan page (`/`)

- **Top bar:**
  - **Token meter:** a flame beside the light/dark toggle, lit while the server runs Claude Code (a pull, Check for changes, an AI port, an upload's checks). Hover it for what's burning, what costs nothing, and what the calls cost since the server started.
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
  - **Preview cards, screens, guidelines and explorations** are Design references. They are listed as Design work, marked **Reference only** on the rail and "changed in Design, not ported" in the head, and never ported; the plan bar counts them apart from skips.
  - **Screens** are references in both directions. Kit screens are flat mockups, and several can stand for one App screen (Board, List and Calendar are all `ProjectScreen.tsx`), so porting one would rewrite the code behind the others. A screen names its App screen under *Compare with (never written)* and opens the kit's interactive app from the snapshot; port the components it shows instead.
- **An open feature** (click its title) shows:
  - each subfeature's file mapping, with App and Design diffs since the sync point; diffs longer than 1,500 lines show their total and **Show more lines** reveals the rest;
  - live card previews, rendered with a locally built bundle; copy actions expose selectable text when clipboard access fails;
  - **Compare visually** (components with stories): the App's component as its Storybook stories render it, in the App column, beside the kit's preview cards that render it most (each captioned with how often, e.g. "Button × 3"), in the Design column, one theme at a time (Rounded pairs a story at Rounded dark with a card; Minimal pairs Minimal light with the card's Minimal twin). Both sides are shot at 2× and shown at actual size, so heights, padding and type compare; a wide card scrolls in its frame. Story shots are cropped to what the story drew, popups in portals (dialogs, menus) included. The theme switch sticks under the column heads and is remembered. Render errors open as a list. Pictures are cached per Storybook build, snapshot and component under `.state/visual/`, so only the first look waits (it may build Storybook, up to half a minute);
  - the exact steps that will run, each AI step with its brief (*Read brief*, *Copy brief*). A brief never pastes diffs, so nothing in it is ever cut short: it lists, per subfeature, an `sh` block of the exact `git diff` commands (each ending with its +/− line counts), the files to read in full, unchanged files for context on one line, the receiving side's current files, and the examples to read, and tells the agent to read them all before editing. A push brief says what `STAGE` is and how to make one to run the brief by hand. Its size grows with the number of parts, not with the change (41 briefs on real data run 6k–14k characters, every command producing output). A spec section, which no command can cut out of its long file, is written before and after to content-addressed files under `.state/sections/`, and the brief gives a `git diff --no-index --word-diff` of them: the kit's spec writes a paragraph per line, so a word diff stays short. Runs give the agent read access to every snapshot, so the commands work there too; and **Run this feature only**, which reviews this feature’s steps before starting and stays disabled while another job is running or waiting for approval;
  - **Mark this feature synced** opens the sync-point dialog with only this feature selected. Other features keep their old baseline.
- **Merge, wherever you look:** while a run's verified App branch waits, Merge is offered in the navbar (on both pages), as a banner above the verdict (with its commits and *Review in Activity*), in the plan bar (where it takes the primary slot from Review selected sync steps), and pinned at the top of Activity when another job is shown. All of them merge the same run. While a run is still porting into the App, the navbar and plan-bar buttons show greyed out; otherwise there is no Merge button.
- **Drafts are reviewed before they merge:** a run that ported kit code into the App (*Draft “…” from the kit for your review*) holds a draft. `npm run check` proves it builds, not that it kept the App's architecture, so the tool also scans the branch (`src/engine/fidelity.ts`) for Base UI primitives it no longer imports, fewer forwarded refs and render props, fewer roles and ARIA attributes, Zustand hooks that read a whole store, click handlers on non-interactive elements, and components whose stories weren't updated. Every Merge offer then reads **Review the draft** and opens the run's review in Activity. There, each finding is ticked once looked at (with a *Copy its diff* command per file), then *I reviewed this draft against these points*, and only then does Merge unlock. The server refuses a draft's merge without that confirmation. Token-only runs are deterministic and merge as before.
- **Plan bar** (bottom): what the decisions add up to (merges, AI ports, upload).
  - **Review selected sync steps** confirms first, saying what will be written where. When steps update the App, the review names the latest imported Project archive, its recorded download timestamp and import time (with year and timezone), and the snapshot these steps use. **Import a newer project archive** closes the review and opens the existing download/import guide; importing refreshes the comparison before you review again. Download timestamps come from file metadata, and older snapshots show when that time was not recorded.
  - **Mark selected features synced** records a new sync point and lists every feature. After a run, only that run’s covered features start ticked, even after a page reload. Otherwise, features the plan moves start ticked. Preparing kit files is not a completed sync: upload and check them first. Verified runs automatically record their own sync point. Unticked features, and the skipped parts of ticked ones, **stay open**: they keep their old baseline and reappear as "Kept open since …".
- **Activity** (right panel): jobs with a live log, step states, cost, and **Stop**. One sidebar scrollbar reaches the job list, steps and approvals. The header stays visible with **Jobs**, **Jump to log**, a **Widen activity** toggle on desktop, and Close. Unfinished jobs always remain in the list; **Show older jobs** reveals more completed history.
  - **Expand log** gives the log the panel's full remaining height; **Back to run** restores the steps and approvals, preserving your selections. **First entry** and **Latest entry** move through the log. Scrolling upward pauses **Follow live log** so arriving entries keep your reading position; Latest entry or turning following back on resumes it. **Copy log** copies every displayed entry with its timestamp and level. Long paths wrap, and multiline output keeps its line breaks.
  - **Merge into the App:** a run with App work stops here, listing the verified commits. A draft shows **Review the draft, then merge** instead, with the scan's findings and review points.
  - **Upload to Claude Design:** a run that changed kit files stops here. A summary line counts who wrote what (Claude Code, drafted from Storybook, Minimal twins), and every staged file has a checkbox, its origin, a render check for cards, and a preview; a Minimal twin hangs under its card. Files that need a look start unticked with the reason under them: a card that renders with errors (and its twin), and drafts for a component whose `.jsx` was never written. A twin that couldn't follow its card says so under the card. **Upload n files from Claude Code** checks Design for newer edits, then shows three steps: copy the request (or a terminal command that starts `claude` in this repo with it), approve DesignSync's prompt in Claude Code, and **Check the upload**, which reads the files back and closes the step once all match. Nothing goes up until you approve it in Claude Code.
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
  - **Bring the mapping up to date**, which asks Claude Design and recompares, and when the snapshot is behind or incomplete opens the import-or-pull choice;
  - the six steps of the mapping technique.
- **Diagram:** one row per lane: tokens, components, spec, screens, preview cards, guidelines, left out. App is on the left, Design on the right, the tool in the middle.
  - **The middle** names each lane's technique: CSS merge, AI port, reference only.
  - **Tracks:** the top track carries App work into Design, the bottom one Design work into the App. A track animates while work waits, with the count.
  - **An open lane** shows how files pair up, how each direction moves, the pairs pinned in `config.json`, its units (filters: changed, all, in sync, one side only), and its recent moves.
- **Recent imports and exports:** newest first, each with its files per lane. It lists pulls, imports, uploads, App merges, runs still waiting, and sync points.
  - **Show on the diagram** replays a move on its lanes and dims the rest.
  - **Log** opens the job in the plan's Activity panel (`/?job=<id>`).

### Kit drafts from Storybook

A push no longer asks the AI to author every kit file. The mechanical ones come from the App's own Storybook (`app.storybook.build` in `config.json`, a static build with Storybook's components manifest, cached under `.state/storybook/` by the content of the files Storybook reads):

- **A component the kit doesn't have yet**, whose App side has stories, gets a drafted `<Name>.d.ts` (react-docgen's props and their docs), `<Name>.prompt.md` (the stories as JSX examples) and `<name>.card.html` (one labelled figure per story, two columns, each story in its own error boundary; a component the bundle lacks shows one line saying so). They are written into the stage before the AI step, never over an existing file, and the brief lists them under *Drafted for you from Storybook* to refine. Once the AI has changed one, Activity calls it "drafted from Storybook, refined by Claude Code".
- **Minimal twins are the tool's.** After the AI step, each changed card's edit is replayed onto its existing twin by a three-way merge (base: the card before; ours: the twin; theirs: the card now), so the twin's own Minimal tweaks stay; a new card gets a fresh twin. A twin the run edited itself is left alone, and an edit that overlaps the twin's own changes is reported instead of forced.

The AI still writes the `.jsx`, the readme's prose and the Minimal CSS rules. The kit stays hand-authored, file by file: nothing is regenerated wholesale and nothing is compiled from the App into it.

## How it works

| Concept | What it is |
|---|---|
| **Sync point** | The App git rev plus the Design snapshot taken with it. Comparisons are three-way against it.<br>Optionally tagged `design-sync/<date>` in git.<br>Units kept open (`held`) keep their older baseline. |
| **Design snapshot** | A copy of the project's text files in `.state/snapshots/<id>/files/`, from one of three sources:<br>a **pull** (headless Claude Code + DesignSync);<br>an **import** (a project export);<br>an **upload** (the previous snapshot plus what went up). |
| **Unit** | One comparable thing:<br>a component (`components/<area>/X.jsx` + `.d.ts` + `.prompt.md` ↔ `src/client/design/<area>/X.tsx` + `.css`);<br>a token file;<br>a spec section (`readme.md` ↔ `DESIGN.md`, by `##` heading);<br>a screen (`ui_kits/todoi/*`, a reference read beside its App screen in `src/client/app/*`, never ported);<br>a preview card with its Minimal twin.<br>Pairing rules and renames live in `config.json`. |
| **Feature** | Changed units grouped into work: App commits since the sync point, plus Design preview cards (with the components they render).<br>A card joins the commit that shares the most units.<br>Hub components (Button, Menu…) don't glue features together.<br>Cards whose only change is a new Minimal twin become one feature. |
| **Step** | What a direction turns into:<br>a **CSS merge** for token CSS (rule-level three-way, no AI);<br>an **AI draft → App** (React 19 and the repo's conventions, committed changes or an evidenced already-implemented report, on the run's branch, scanned and reviewed before it merges);<br>an **AI port → Design** (into a staging copy of the kit, with the twin, readme and Minimal rules);<br>an **Upload** (after approval). |

Statuses: *changed on both* (red, the tool's one colour), *App ahead*, *Design ahead*, *new in App*, *new in Design*, *in sync*, *not dated* (no baseline yet on one side).

## Safety

- **AI runs need a confirmation.**
- **App work never touches your checkout.**
  - Ports and token merges run in a git worktree at `$TMPDIR/cds-runs/<repo>-<hash>/<run>`, with `node_modules` linked in.
  - That worktree is on a new branch `design-sync/run-<id>` from HEAD, so uncommitted changes are safe.
  - Claude Code (`claude -p`) may edit and run commands there, and reads the Design snapshot.
  - A detached HEAD is refused.
- **The tool checks the work itself.**
  - Each port must commit its edits and leave nothing uncommitted. An already-implemented feature instead returns an explicit report covering every selected unit with existing App file paths and concrete evidence. The tool verifies the report's coverage and files, checks the worktree stayed clean at the same HEAD, and shows the evidence in Activity for your review. No empty or cosmetic commit is required. A bare success message is still unverified and stops the run.
  - Then `app.check` (`npm run check`) must pass on the branch.
  - A failed or interrupted App-only run keeps its branch. **Resume run** in Activity reuses it, keeps completed steps and commits, retries unfinished steps, and reruns the final check. It refuses missing, dirty, switched, or unexpectedly edited worktrees. Mixed App/Design runs still need a new run. **Discard** removes the saved branch and worktree.
  - Job checkpoints and original plans are saved atomically under `.state/jobs/` and `.state/plans/`, so recovery survives a server restart. Older App-only runs can recover their exact step IDs from their stored sync point, snapshot and coverage; if those steps cannot be reconstructed, the tool asks for a new run.
- **Nothing reaches your branch until you press Merge.**
  - It fast-forwards when it can and makes a merge commit when you committed meanwhile.
  - A conflict changes nothing and says so.
  - It refuses when your checkout moved to another branch.
  - After a merge, the branch and worktree are removed.
- **Design ports** edit only `.state/stage/<run>/`.
  - The stage is deleted once the run is uploaded, discarded, stopped or failed.
  - An upload that's waiting for Claude Code, or didn't check out, keeps it.
- **Uploads go through DesignSync with a locked plan:** only the ticked files are written, nothing is deleted, and the kit is changed file by file on top of the live version, never regenerated.
- **Uploads run in an interactive Claude Code session, not headless.** DesignSync asks the developer to approve every plan (`finalize_plan`), and a background `claude -p` run can't answer that prompt: it gets the prompt's text back as an error. So the tool hands the upload over as a request, and only reads in the background. A headless DesignSync call that ever meets that prompt fails with "DesignSync asked for your approval…" instead of an obscure error.
- **An upload never overwrites newer Design work.**
  - If the project's `updatedAt` moved since the run's snapshot, the live copy of each file is three-way merged into the staged copy first.
  - A file that won't merge (same lines edited, or deleted in Design) stops the upload. It is unticked with the reason, and stays out until you pull and rerun the feature.
- **Every upload is read back** (Check the upload) and compared with the staged copy, ignoring line endings and trailing whitespace. Files that don't match yet, or can't be read, are named, and the upload keeps waiting.
- **The post-upload snapshot is marked current** (it takes Design's `updatedAt`) only when Design had changed nothing else when the files were checked. Otherwise "Check for changes" asks for a pull.
- **POST endpoints require an `x-cds: 1` header**, so other sites in your browser can't trigger runs. This matters more when hosted, because browsers resend a Basic Auth login on their own.
- **Hosted means logged in.** The server refuses to listen beyond loopback without `CDS_BASIC_AUTH_USER`/`CDS_BASIC_AUTH_PASS`, and then asks for them on every route but `/healthz` ([Run it on a server](#run-it-on-a-server)).
- **API input is validated at the server boundary.** Invalid requests return a JSON error before starting work.
- **A waiting upload keeps its staged files until it checks out or you discard it.** Preparing the request again checks live Design edits again.
- **Stop terminates the run's subprocess group**, including App-check descendants, and prevents subsequent harness calls from starting.
- **Codex** (`codex exec`, via `harness.implement`) is untested, with a best-guess output parser, so the GUI never offers it. It could only do App ports anyway.

## Limits

- **Pulls are content pulls.**
  - DesignSync has no per-file timestamps, so "Check for changes" compares the project's `updatedAt` with the snapshot's.
  - Each "Check for changes" starts a Claude Code model request through DesignSync and uses tokens even when nothing changed. It checks metadata without downloading file contents. Recompare reads local files and snapshots without a model request.
  - A pull first makes the same check, and stops with "Already up to date" when the newest complete snapshot from the same project matches. Otherwise it reads every text file (~3 min, ~$0.60 with Haiku at low effort).
  - Each file read run is capped at two turns: loading DesignSync, then fetching files. When calls follow that order, contents arrive in Claude Code's event stream without being sent back to the model. If DesignSync is already available and the model skips ToolSearch, it can fetch on the first turn and read the contents on the second. Files a run didn't reach are asked for again while rounds bring files in.
  - Binaries, uploads, the generated `_ds_bundle.js` and the `design.ignore` paths are skipped, except `_ds_manifest.json` (the kit tooling reads its namespace). Previews use a locally built bundle, and borrow the App's fonts and covers (`assetFallbacks`).
- **A pull that misses files says so.**
  - A file still failing after a retry (or sent truncated) keeps its previous snapshot's content, so it never reads as deleted in Design.
  - Its units say "Not pulled", the header offers **Pull again**, and the snapshot never passes as current.
- **Feature grouping is heuristic.** Commit subjects make the titles, so one-feature conventional commits make the tool read like a changelog.
- **Jobs survive a restart, but a running job doesn't.** Waiting runs persist in `.state/jobs/`. A job that was running when the server stopped is marked failed, and its App branch is kept for a look.
- **The Mapping history** knows only what the tool recorded (snapshots, sync points, its jobs). Whether Design changed is known only after asking since the server started.

## CLI

```bash
npm run claude-design-sync                         # the GUI (CDS_PORT to move it)
npm run design-sync -- status                      # Design project's updatedAt (via Claude Code)
npm run design-sync -- pull [--force]              # new snapshot; stops early when Design hasn't changed
npm run design-sync -- import [~/Downloads/x.zip]  # or an unzipped export folder; none = newest export of this project
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
  - `pullModel` and `pullEffort`: DesignSync reads only (status checks, pulls, upload read-backs). Contents come from tool results, never from the model's reply, so a cheaper model can't alter a file;
  - `haiku` is a moving model alias, rather than a pin to Haiku 4.5. Supported effort levels depend on the resolved model; see [Claude Code's model configuration](https://code.claude.com/docs/en/model-config);
  - `implementModel`: App and kit ports (empty = Claude Code's default).

Environment overrides, used by the tests:

- `CDS_REPO`, `CDS_STATE`, `CDS_CONFIG`, `CDS_PORT`.
- `CDS_FAKE_HARNESS=1` plus `CDS_FAKE_DESIGN=<folder>`: a stand-in harness that serves a local folder as the Design project. Both are required; `design-sync:demo` sets them up. `CDS_FAKE_PROJECT` names the project id the folder plays (default `fake`).
- `CDS_EXPORTS`: folders (separated by `:`) to look for exports in, instead of `~/Downloads` and `uploads/`. With the fake harness, none unless set.

## State on disk

`.state/` is gitignored and holds:

- `snapshots/<id>/` (meta plus files);
- `sync-points.json`;
- `jobs/<id>.json` (logs and approvals);
- `stage/<run>/` (Design staging copies, pruned on start);
- `storybook/<hash>/` (the newest static Storybook build, keyed by what it read);
- `visual/<key>/` (cached pictures for Compare visually);
- `sections/<hash>.md` (spec sections the briefs word-diff);
- `cdn/` (cached unpkg scripts for card renders).

Run worktrees live outside the repo, under `$TMPDIR/cds-runs/`.

## Code and tests

- **`src/engine`:** comparison, plan, merges, snapshots, DesignSync, worktrees, lanes.
- **`src/server`:** the Hono API, jobs, the token meter (`meter.ts`), mapping history.
- **`src/ui`:** React 19, plain CSS on the App's tokens.
- **Design docs:** [DESIGN.md](DESIGN.md) (the GUI's design system) and [PRODUCT.md](PRODUCT.md) (who it's for and why).

```bash
npm run design-sync:check   # typecheck + engine tests
npm run design-sync:e2e     # GUI flows (Playwright, throwaway fixture on :4478)
npm run design-sync:demo    # the same fixture world to click through, at http://localhost:4478
```

The engine tests build a throwaway git repo and two Design folders.
They also cover cancellation, subprocess cleanup, startup failures, path containment, and immutable baseline reads.

The GUI tests run the full loop against that fixture with the fake harness:

- comparison and the three directions (globally, per feature and per subfeature, by keyboard);
- diffs and briefs;
- axe and phone width;
- a run that stops for merge and upload, the upload conflict guard, discard, merge, the Claude Code handoff and its read-back, and mark synced;
- switching the target project in the footer;
- check, pull, and up to date;
- the Mapping page: lanes, replaying a move, bringing the data up to date.
- a missing staged copy, an upload checked before it ran (then closed once Design holds the files), discard while waiting, invalid API input, staging startup failure, and plan-dialog transitions;
- tooltips: every visible control on both pages has one; hover, keyboard focus, placement, dismissal and disabled reasons.

The regression flows save desktop and phone screenshots to the repo's gitignored `.tmp/design-sync-improvements/` folder. Screenshot capture disables animations so the images show the settled interface.
