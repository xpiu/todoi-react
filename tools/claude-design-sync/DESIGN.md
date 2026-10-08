---
name: Claude Design Sync
description: A sync plan you read top to bottom and sign, App on the left, Design on the right, direction on the rail between.
colors:
  ink: "#000000"
  ink-quiet: "#707070"
  ink-faint: "#a3a3a3"
  paper: "#ffffff"
  hairline: "rgba(0,0,0,.12)"
  rule-input: "rgba(0,0,0,.24)"
  wash: "rgba(0,0,0,.03)"
  danger: "#e8453a"
typography:
  verdict:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  body-strong:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  secondary:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  mono-block:
    fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  none: "0px"
spacing:
  gutter: "24px"
  gutter-narrow: "16px"
  cell-inset: "20px"
  row: "14px"
  item: "8px"
  tight: "4px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "30px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.ink-quiet}"
  rail-key:
    backgroundColor: "transparent"
    textColor: "{colors.ink-quiet}"
    rounded: "{rounded.none}"
    width: "26px"
    height: "24px"
  rail-key-set:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  rail-key-lg:
    width: "32px"
    height: "30px"
  direction-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "8px 14px"
  direction-option-set:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 0"
  link:
    textColor: "{colors.ink}"
    typography: "{typography.secondary}"
---

# Design System: Claude Design Sync

Scope: the GUI in `src/ui/` of this tool only. The tool wears Todoi's Minimal theme; the colour, type and motion tokens are the App's own, served unchanged from `src/client/design/tokens/` at `/tokens/*` (see the repo-root `DESIGN.md` for their definition). This file records how the tool consumes them. Never redefine a token here; the hex values above are the Minimal light values the GUI renders, recorded for reference.

## Overview

**Creative North Star: "The Signed Ledger"**

The sync is a plan document, not a dashboard. Every changed feature is one ruled line: its App work on the left, its Design work on the right, twinned around a narrow centre rail where its direction is set. The page reads top to bottom: a one-sentence verdict, one three-way direction control, the column heads, the ledger, and a plan bar pinned to the bottom that carries the one primary action.

The material is paper, ink and hairlines. No radius, no cards. Fills mark chosen controls and feature applicability: a light green wash for an active direction, a light gray wash for skipped or reference-only rows. Hierarchy comes from weight (400/500), ink depth and rules (a full ink rule above the column heads and the plan bar; 12% hairlines between rows; dashed hairlines between subfeatures). Density is that of a ledger: 13px text, tight rows, generous outer margins.

It refuses the status-card dashboard and the file-diff tree. Paths, SHAs and logs appear only as mono evidence inside a line, never as the structure.

**Key Characteristics:**
- Three-column ledger: App | rail (132px) | Design, on a 1180px page.
- Ink on paper, hairline rules, zero radius, flat except the activity panel.
- Red (`danger`) for "changed on both" and errors; a light green feature-row wash for active sync directions.
- Inter 13/1.45 for everything you read; Geist Mono 11px only for data.
- Arrows on the rail point at the column that receives the work.
- Light and dark use the App's `data-mode` tokens. The navbar's sun/moon button switches modes and remembers the choice across pages and reloads; until a choice is made, the tool follows `prefers-color-scheme`. The saved mode is applied before styles load.

## Colors

A monochrome ink-and-paper palette with one alarm colour. All values come from the App's Minimal tokens; the tool adds only two aliases (`--cds-hair` = 1px solid `--border-divider`, `--cds-wash` = `--n-a03`).

### Primary
- **Ledger Ink** (`--ink-900`): text, the ink rules above the column heads, plan bar and panel, set rail keys, the set direction option, the primary button, focus outlines, the progress fill. In dark mode it inverts to near-white and the fills invert with it.

### Neutral
- **Paper** (`--chrome-canvas`): every surface: page, sticky bar, column heads, plan bar, panel. Also the text colour on ink fills.
- **Quiet Ink** (`--ink-600`, `--ink-400`): secondary text, kind tags, counts, meta lines, "No change" cells, unset key glyphs, tool buttons at rest. The tool uses 600 for "readable secondary" (work lines, log text) and 400 for "metadata"; in Minimal both resolve to the same grey, so the distinction is semantic only.
- **Faint Ink** (`--ink-300`): disabled keys, step numbers, log timestamps, the "—" bullet on work lines.
- **Hairline** (`--border-divider`, 12%): row rules, rail borders, dashed subfeature rules, diff and preview frames, disabled button outlines.
- **Input Rule** (`--border-input`, 24%): key and button outlines at rest, underlines of fields and the sync-point select, link underlines at rest, the run-through on unavailable keys.
- **Wash** (`--n-a03`): hover on keys, options and jobs; the background of diffs, briefs and the log.

### Secondary
- **Both-Sides Red** (`--danger`): see the rule below.

### Named Rules
**The One Colour Rule.** `--danger` appears only where both sides changed (the square mark before the "changed on both" status, whose words stay ink because red text at 12px fails AA contrast; the both-sides count in the verdict) and for errors (error banners, failed jobs and steps; inline errors and warn/error log lines keep ink words and carry the red as a 6px square or a 2px margin bar, for the same contrast reason). Text and controls otherwise stay ink. Feature rows use an 8% mix of `--label-green` into `--chrome-canvas` for active directions, and `--cds-wash` for skipped or reference-only work. These fills follow the effective feature choice, including overrides, in Full sync, Into the App and Into Design. Another exception, by design: the **token meter's flame** in the bar burns in the App's flat `--label-orange` while Claude Code runs, the only warm colour in the tool; unlit, it is an ink outline like every bar icon.

**The Borrowed Tokens Rule.** The tool loads the App's token files and consumes them by name. It never adds a raw hex, never forks a value, and adds only layout aliases prefixed `--cds-`.

## Typography

**Body Font:** Inter (`--font-ui`, Minimal stack)
**Label/Mono Font:** Geist Mono (`--font-mono`, Minimal stack)

**Character:** One neutral grotesque at one size carries all reading; a mono at 11px marks anything that is data rather than prose.

### Hierarchy
- **Verdict** (400, 22px, 1.3, -0.012em, balanced, max 36ch): the one-sentence verdict and the onboarding heading. Drops to 19px when the page is narrow (see the Narrow Page Rule). Counts inside it are 500.
- **Title** (500, 15px, 1.4): sheet headings in the plan bar (confirm, mark synced).
- **Body** (400, 13px, 1.45): all UI and prose: rows, cells, buttons, fields, panel. 500 for feature titles, column heads, unit names, the wordmark, panel headings.
- **Secondary** (400, 12px, 1.45): status words, rail notes, direction hints, evidence lines, links, inline errors.
- **Mono** (400, 11px, 1.45, tabular figures for counts): kind tags, part counts, step tallies and step numbers, SHAs and repo meta, paths, job times, plan summary line.
- **Mono block** (400, 11.5px, 1.55): diffs and AI briefs; the log is the same face at 11px/1.55.

### Named Rules
**The Mono Is Data Rule.** Geist Mono is for kind tags, counts, step tallies, SHAs, paths and logs, never for headings, labels or prose. If the text is something you read as a sentence, it is Inter.

**The Two Weights Rule.** Only 400 and 500. Emphasis inside prose (`em`) is 500 upright, never italic.

## Layout

- **Page:** max 1180px (`--cds-page`), centred, 24px gutters; bottom padding clears the plan bar.
- **Bar:** sticky, 48px (`--cds-bar`): the wordmark left, then three groups on the right, each separated by a 16px hairline rule: the page's own tools (Merge only while a run waits for it or is still porting into the App, the sync-point select, Recompare, Activity), the pages (Plan, Mapping, Guide), and the meta (token meter, sun/moon mode toggle, Claude Design link). Every control is a box with a 6px inset (min 26×28), 6px from the next, so glyphs and labels sit an even 18px apart whatever their kind; the last glyph lands on the gutter. The pages are tabs as tall as the bar: the current one is Ledger Ink with a 2px ink rule along the bar's bottom edge. The mode toggle is an icon button whose accessible name and tooltip name the mode it switches to.
- **Bar, smaller windows:** under 1100px the page's tools and the Claude Design link drop to their glyphs (tips still name them) and "Since" hides; the pages keep their names. Under 640px the bar becomes two rows (48 + 40px, and `--cds-bar` grows to 88px so everything sticky clears it): the wordmark and the page's tools, then the pages as tabs with the meta on the right. Under 420px, on a page with its own tools, the wordmark keeps only its mark. On touch (`pointer: coarse`) bar controls grow to 36×36.
- **Ledger grid:** `minmax(0,1fr) 132px minmax(0,1fr)` for the column heads, every row twin, the work twin and each subfeature unit, so the rail lines up down the whole page. Column heads are sticky under the bar. Cells inset 20px from the left (16px on the Design side's outer edge).
- **Row:** feature head (chevron, title, status, count) across the full width at 14px top padding; then the twin. Closed rows show at most four moved parts per side plus "+n more".
- **Plan bar:** fixed bottom, min 56px (`--cds-plan`), aligned to the page width; summary left, actions right. Its sheet opens above it, capped at min(56vh, 520px).
- **Activity panel:** fixed right, 440px (`--cds-panel`), from under the bar to the bottom. With the panel open the page shifts left to make room and the plan bar stops at the panel's edge.
- **Rhythm:** small steps (4, 6, 8, 10, 12, 14, 16, 20, 24px) set directly in the stylesheet; the tool does not use the App's `--space-*` scale.

**The Narrow Page Rule.** The ledger answers to its own width (a `page` container on `.cds-main`), not the window's, so a phone and a tablet with the Activity panel open behave alike. When the page is under 700px the twin stacks to one column: App cell, then the rail as a horizontal strip between dashed hairlines, then the Design cell, each side labelled (an empty side and the rail's "work" label drop out). Column heads hide and the direction control goes full width; under 520px its three options stack as rows, each with its route beside its name and hint. A tablet on its own (768px and up) keeps the twin. The plan bar is its own container: under 900px its actions take a second row and split the width. Under 820px of window, gutters drop to 16px and the panel becomes full-screen. On touch, rail keys take the large size in the twin and grow to 40×36 in the stacked strip.

## Elevation & Depth

Flat. Depth is conveyed by rules: an ink rule marks the top of a structure (column heads, plan bar, approval block, onboarding twin, panel edge), hairlines divide inside it. Outlines are drawn as inset box-shadows so adjacent keys and options share one hairline.

### Shadow Vocabulary
- **Overlay** (`--shadow-overlay`): the activity panel only, the one surface that floats over the ledger.

**The Flat Ledger Rule.** Nothing in the ledger lifts. A new surface floats only if it overlays the ledger the way the panel does.

## Shapes

Square everywhere (radius 0, set explicitly on selects and inputs to beat UA styles). Status dots (live indicator, job-step marks) are small squares, not circles. The diagonal run-through is the one oblique mark: it means "unavailable" on rail keys and "skipped" on job steps.

## Components

### Rail keys (signature)
Four printed marks in a radiogroup, joined edge to edge (`margin-left: -1px`), in the fixed order Into the App ←, Full sync ⇄, Into Design →, Skip ⊘. Arrows point at the receiving column (← the App on the left, → Design on the right).
- **At rest:** hairline outline (`--border-input`), Quiet Ink glyph (lucide, 14px, stroke 1.75).
- **Hover:** Ledger Ink glyph on Wash.
- **Set:** filled Ledger Ink, Paper glyph; stays filled under the pointer.
- **Unavailable:** Faint Ink glyph with a diagonal hairline run through it, `not-allowed` cursor, the tooltip says why.
- **Focus:** a 1px ink outline bracket offset 2px, raised above neighbours. Arrow keys move the choice; only the set key is in the tab order.
- **Large** (32×30, 16px glyph) is used for unit-level rails in the open detail.
- A rail note (12px) appears under the keys only when the line differs from the plan, with a "· reset" link when overridden.
- **References** (preview cards, screens, guidelines): every key but Skip is unavailable, and the rail note always reads "Reference only". The row is not greyed like a skipped one, its head status reads "changed in Design, not ported" in Quiet Ink, and the plan bar counts references apart from skips.

### Direction control
The global three-way segmented control (Into the App / Full sync / Into Design): each option stacks a route, the name (500) and a hint (12px) saying which side it changes, min 170px, joined by inset hairlines; the set option is filled ink with the hint at 70%. The two one-way names carry a small mono count of changed features available in that direction (including features changed on both sides, excluding reference-only work). Counts come from the comparison, independent of selection and overrides; show an em dash until a comparison is available and 0 when none qualify. Tooltips explain the count. Full sync keeps its name without a count. The route draws the job: an `App` and a `Design` box (500, 10px) either side of the arrow, the receiving box filled, the other outlined, so the three options differ in shape and not only in words. The empty ledger's line and action follow the set option (Recompare the App for Into Design; Check Claude Design otherwise).

### Buttons
- **Shape:** square, 30px tall, 12px side padding, 14px lucide glyph + label.
- **Default:** transparent with an input-rule outline; hover darkens the outline to ink; active adds Wash.
- **Primary:** filled ink, Paper text, no outline; hover softens to Quiet Ink. One per surface (Review selected sync steps, Upload n files, Import project archive). While a run waits for Merge, Merge takes the plan bar's primary slot and Review selected sync steps drops to Default (it is disabled until the run is merged or discarded).
- **Disabled:** Quiet Ink text, hairline outline.
- **Tool** (bar): borderless, Quiet Ink to Ledger Ink on hover or when pressed.
- **Icon** (28×28): borderless glyph, Quiet Ink to Ledger Ink.

### Merge offer
One action in four places, all driven by one hook (`Merge.tsx`), so they agree and one press disables them all:
- **Navbar:** a tool button that is filled ink (500, 10px side padding, "Merge into main") while a verified App branch waits, the only filled control in the bar; greyed (Faint Ink, `not-allowed`) while a run still ports into the App; absent otherwise. Under 1100px it is the filled glyph alone. With more than one run waiting it adds a mono count after a 1px rule.
- **Banner:** above the verdict on both pages, under an ink rule like every approval block: a 15px title naming the run, the branch and check in mono, the commit list, then the primary Merge and *Review in Activity*. Absent unless a run waits.
- **Plan bar:** a Merge button before Review selected sync steps: primary while a run waits, Default and disabled while one ports, absent otherwise.
- **Activity:** the run's own "Merge into the App" block; while another job is shown, a strip under the job list (ink rule on top) names the waiting run (a link that shows it) beside a primary Merge.
- **Drafts** (runs that ported kit code into the App) never merge from the navbar, banner or plan bar: those read **Review the draft** (ScanSearch glyph) and open the run in Activity, landing focus on the review heading. The review block sits under its own ink rule: a 13px heading counting what the architecture scan flagged, findings grouped by file (mono path with *Copy its diff*, one checkbox per finding with its rule in 500 weight), the review points as a quiet list, *Copy the whole diff*, and the confirmation checkbox, which stays disabled until every finding is ticked. Merge stays disabled until it is ticked. While a draft waits, the panel's Upload button drops to Default so the panel keeps one primary.

### Token meter (bar)
A 16px flame just left of the light/dark toggle (`Flame.tsx`), following the server's own count of live Claude Code calls (`/api/meter`, polled every second while lit and every two otherwise, never in a hidden tab), so it burns as long as tokens are being spent.
- **Unlit:** lucide's flame outline, Quiet Ink, stroke 1.75: one of the bar's icons.
- **Lit:** the same shape filled with flat `--label-orange` and an open heart in `--chrome-canvas`, with no gradient or glow. It rises out of the outline with a small overshoot (360ms) and sinks back when the last call ends.
- **Flicker:** the silhouette stretches, compresses and leans from its planted base (1.4s), while the open heart changes shape independently (1.1s). Colour stays solid throughout. Reduced motion keeps it lit and still.
- **Tip:** what is burning now with its elapsed time, which actions spend tokens and which are free, and the calls and cost since the server started. Focusable (`role="img"`, named "Token meter: …"); a polite live region announces when it lights.

### Links
12px ink text with an input-rule underline offset 3px; the underline turns ink on hover. Used for every secondary action in a line (App diff, Design diff, Preview, Read brief, Copy brief, Check for changes).

### Inputs / Fields
Underline only: no box, radius 0, 6px vertical padding, `--border-input` rule that turns ink on focus. Checkboxes use ink as the accent colour. Selects (the sync point, the Mapping's Show) share `Select.tsx`: the same underline, which turns ink on hover and focus, with the platform's chevron replaced by a 12px lucide chevron in Quiet Ink.

### Tooltips
Every control explains what it does in one sentence (or why it's unavailable, when disabled). One slip of ink with Paper text, 12px Secondary type, 5×8px padding, square, no shadow, max 280px wide; multi-line text keeps its line breaks. It opens above the control, centred, 6px away; below it when there's no room (the top bar); never past the viewport's 8px margin. A tip opens after a 450ms rest under the pointer or on keyboard focus; within 500ms of one closing the next opens at once, so the pointer can read along a row. A press, Escape, typing, scrolling or resizing closes it, and a pressed control stays quiet until the pointer leaves. Controls carry only the text (`data-tip`); one delegated layer (`Tooltip.tsx`) shows it and links it with `aria-describedby` unless it repeats the control's name. Native `title` stays only on iframes (their accessible names) and sync-point options.

### Visual comparison
Opened under a component part ("Compare visually"), never by default. A sticky bar (it sits under the column heads) holds the Rounded / Minimal toggle (Mapping filter style) and one quiet line naming the mode; then the twin: App stories in the App column, kit cards in the Design column, the rail empty. Each picture is a figure with a 12px caption (story or card name; cards add "Name × n" quiet; render errors as an inline-error disclosure) over an image at actual size inside a frame that scrolls rather than shrinks, ringed with `--border-input`. Loading is one quiet status line plus two skeleton blocks; a side with nothing says why in a quiet line. On a narrow page the column labels hide and captions carry the pairing.

### Ledger row
Feature head (chevron rotates 90° when open; title underlines on hover), status word (red only for "changed on both"; ink for one-sided; quiet for others), part count in mono. The whole feature row has a light green background when its effective direction is active and a light gray background when skipped or reference-only, whether folded or open. The rail retains its direction and reference labels so color is a supplemental cue. Opening reveals the work twin ("—" bulleted), one unit per subfeature (name, kind, mono paths, evidence, link actions) separated by dashed hairlines, inline diffs and preview iframes in hairline frames, and "What runs for this feature" with numbered steps.

### Plan bar
Pinned summary ("n features · direction · n skipped" in 500, tallies in mono) with Mark selected features synced (the latest run supplies the selection when available) and Review selected sync steps. Open features also offer Mark this feature synced; its dialog selects only that feature. The sheet above holds the shared run confirmation and the mark-synced form. A feature-only confirmation names the feature and reviews its writes, harness, App worktree and upload approval.

### Activity panel
Job list (unfinished jobs first, eight completed jobs initially with Show older jobs to reveal more; square state mark, title, mono time; current job gets a 2px inset ink bar on the left), job view (title, mono state and cost, 2px progress line, step list with square marks: outline pending, pulsing running, ink done, red failed, run-through skipped), and the log on Wash in mono with step lines in 500 and warn/error lines red.

### Mapping page (`/mapping`)
A second page on the same ledger. The rail is 232px wide here, and it stands for the tool.
- **Top:** a 12px "Mapping" kicker and a verdict-size sentence (units, lanes, waiting, red count for both sides). Then **Bring the mapping up to date** with a live status line. It is the page's primary action, filled only while something is behind or missing.
- **Meta and technique:**
  - A four-column definition list under an ink rule, with hairlines between the columns: Project, App, Design, Sync point. App and Design each end with a freshness line: a 6px square (filled ink when current, ink outline when behind or missing, faint outline when not known) and the link that fixes it.
  - The six technique steps follow in six columns, with mono step numbers.
- **Lanes:** ledger rows (chevron head, status, count) whose twin holds the App pattern | the rail | the Design pattern.
  - The rail has two tracks around a 5px node (the tool): App → Design on top and Design → App below, with mono counts at the receiving ends.
  - The lane's technique is a square key between the tracks:
    - hairline at rest;
    - filled when its lane is open;
    - dashed for reference-only lanes;
    - a red square inside when units changed on both sides.
  - An open lane shows "Into the App | Paired by | Into Design" as a twin, then notes, pinned pairs, filtered units (the same twin, statuses on the rail) and its recent moves.
- **Recent imports and exports:** twin rows under an ink rule: App files | arrow and time | Design files. The shown move gets Wash; a move still waiting for you gets a small ink square.
- **Flow motion:** a lit track half is a 2px dashed ink line with an arrowhead, its dashes travelling toward the receiving side (0.8s linear).
  - It loops only while work is waiting, so the loop reports status.
  - A replayed move runs four passes and rests as static dashes.
  - Lanes a move didn't touch drop to 35% opacity.
  - Reduced motion leaves the static dashes and arrowheads, which carry the same information.
- **Page under 952px:** the meta goes to two columns and the steps to three. **Under 700px:** both stack. The rail becomes a full-width strip that keeps both tracks, the event actions wrap, and a recent move leaves out the side it brought nothing to.

### States
- **Loading:** skeleton bars (10px lines, a 22px verdict line) in a slow linear shimmer between `--n-a06` and `--n-a03`; four skeleton rows in the ledger.
- **Empty / in sync:** centred quiet message with actions; when everything is in sync, a multi-column quiet list of synced features.
- **Onboarding:** verdict-size heading, a 62ch lede, and the two routes (below) under an ink rule.
- **Bringing Design in** (`DesignRefresh.tsx`, one component on first run, on the plan and on Mapping): the archive is the recommended route. A permanent ruled entry on Plan and Mapping pairs "Update the Design snapshot" and "All project files, no tokens" with a filled **Import project archive** button. It opens the guide directly without a paid status check. First run shows the guide immediately; change-check links can also open it. The guide stays inline under a 15px title and close glyph.
  - **Archive guide:** a 20px Project archive heading with "Recommended · No tokens" and two sequential columns: Download from Claude Design, then Import the downloaded archive. These are workflow steps, not the App/Design comparison twin, so they use equal columns with a 40px gap and stack below 700px. The exact **Share → Project HTML → Project archive → Export** path stays visible even with an archive in Downloads; Project archive and Export are highlighted in ink. A short note distinguishes the free archive from token-costing Standalone HTML.
  - **Import step:** Downloads exports remain radio rows with file size, download time and freshness. With none, a Wash line explains the next action. **Choose a .zip…** is an outlined button; folder import stays in a quiet disclosure. Dragging a file turns this step into one dashed drop target.
  - **One primary:** **Open Claude Design** when no suitable archive is selected; **Import this archive** when it covers the last known change or no check is available. Archive actions are at least 36px tall. **Alternative: pull with Claude Code · Costs tokens** is a collapsed disclosure under a hairline, with the existing cost/time evidence and an outlined Pull the project button. Bring the mapping up to date remains an outlined check action.
- **Errors:** banner with a red inset outline and red text (`role="alert"`); inline errors 12px red.
- **Awaiting upload approval:** an approval block in the panel under an ink rule: heading, the exact file list as checkboxes with mono paths and status, per-card render check ("renders" in mono, or "n errors" red), preview links, then the primary "Upload n files from Claude Code". Once prepared, a numbered three-step list under a hairline (mono step numbers like the plan's steps): copy the request or the terminal command (links), with the request readable in a brief block; approve DesignSync's prompt there; check the upload. The primary becomes "Check the upload".

### Motion
Short and functional only, all on `--ease-standard`: colour and outline changes at `--duration-fast` (100ms); `cds-in` (fade plus 2px drop) for opening a row's detail and the plan sheet at `--duration-base` (150ms); `cds-panel-in` (16px slide plus fade) for the panel at `--duration-overlay` (200ms); `cds-tip-in` (fade plus a 2px rise toward the control) for a tooltip at `--duration-fast`; progress fill at 150ms. Loops exist only as status: the live square and running step pulse, the job spinner, the skeleton shimmer, and the Mapping rail's flowing tracks while work waits (a replayed move runs a few passes and stops). The App's global reduced-motion rule collapses all of it.

## Do's and Don'ts

### Do:
- **Do** load the App's token files and consume them by name; add only `--cds-` layout aliases.
- **Do** prefix every class with `cds-` (deliberately not the App's `td-`, so the tool's CSS can never be mistaken for, or collide with, App component CSS).
- **Do** keep the App | rail | Design grid on any new twin so the rail stays one vertical line down the page (a page may widen its rail, as Mapping does, but keeps one width throughout).
- **Do** keep the direction vocabulary exact: Into the App ←, Full sync ⇄, Into Design →, Skip ⊘, with arrows pointing at the receiving column.
- **Do** mark the top of a structure with an ink rule and divide inside it with hairlines.
- **Do** show "unavailable" as a run-through mark plus a tooltip that says why.

### Don't:
- **Don't** use `--danger` for anything other than changed-on-both and errors.
- **Don't** set headings, field labels or prose in Geist Mono.
- **Don't** add radius, cards, status tiles or a file tree.
- **Don't** add shadows to anything inside the ledger.
- **Don't** add decorative motion; a loop must report live status.
- **Don't** use weights other than 400 and 500, or italics.
