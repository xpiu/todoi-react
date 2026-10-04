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

The material is paper, ink and hairlines. No radius, no cards, no fills except where something is set (a chosen key, the primary button). Hierarchy comes from weight (400/500), ink depth and rules (a full ink rule above the column heads and the plan bar; 12% hairlines between rows; dashed hairlines between subfeatures). Density is that of a ledger: 13px text, tight rows, generous outer margins.

It refuses the status-card dashboard and the file-diff tree. Paths, SHAs and logs appear only as mono evidence inside a line, never as the structure.

**Key Characteristics:**
- Three-column ledger: App | rail (132px) | Design, on a 1180px page.
- Ink on paper, hairline rules, zero radius, flat except the activity panel.
- One colour (`danger`), reserved for "changed on both" and errors.
- Inter 13/1.45 for everything you read; Geist Mono 11px only for data.
- Arrows on the rail point at the column that receives the work.
- Light and dark follow `prefers-color-scheme` through the App's `data-mode`; nothing in the tool branches on mode.

## Colors

A monochrome ink-and-paper palette with one alarm colour. All values come from the App's Minimal tokens; the tool adds only two aliases (`--cds-hair` = 1px solid `--border-divider`, `--cds-wash` = `--n-a03`).

### Primary
- **Ledger Ink** (`--ink-900`): text, the ink rules above the column heads, plan bar and panel, set rail keys, the set direction option, the primary button, focus outlines, the progress fill. In dark mode it inverts to near-white and the fills invert with it.

### Neutral
- **Paper** (`--chrome-canvas`): every surface: page, sticky bar, column heads, plan bar, panel. Also the text colour on ink fills.
- **Quiet Ink** (`--ink-600`, `--ink-400`): secondary text, kind tags, counts, meta lines, unset key glyphs, tool buttons at rest. The tool uses 600 for "readable secondary" (work lines, log text) and 400 for "metadata"; in Minimal both resolve to the same grey, so the distinction is semantic only.
- **Faint Ink** (`--ink-300`): "No change" cells, disabled keys, step numbers, log timestamps, the "—" bullet on work lines.
- **Hairline** (`--border-divider`, 12%): row rules, rail borders, dashed subfeature rules, diff and preview frames, disabled button outlines.
- **Input Rule** (`--border-input`, 24%): key and button outlines at rest, underlines of fields and the sync-point select, link underlines at rest, the run-through on unavailable keys.
- **Wash** (`--n-a03`): hover on keys, options and jobs; the background of diffs, briefs and the log.

### Secondary
- **Both-Sides Red** (`--danger`): see the rule below.

### Named Rules
**The One Colour Rule.** `--danger` appears only where both sides changed (the "changed on both" status, the both-sides count in the verdict) and for errors (error banners, inline errors, failed jobs and steps, warn/error log lines). Everything else is ink. If a new state wants colour, it is either a conflict or an error, or it stays ink.

**The Borrowed Tokens Rule.** The tool loads the App's token files and consumes them by name. It never adds a raw hex, never forks a value, and adds only layout aliases prefixed `--cds-`.

## Typography

**Body Font:** Inter (`--font-ui`, Minimal stack)
**Label/Mono Font:** Geist Mono (`--font-mono`, Minimal stack)

**Character:** One neutral grotesque at one size carries all reading; a mono at 11px marks anything that is data rather than prose.

### Hierarchy
- **Verdict** (400, 22px, 1.3, -0.012em, balanced, max 36ch): the one-sentence verdict and the onboarding heading. Drops to 19px under 820px. Counts inside it are 500.
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
- **Bar:** sticky, 48px (`--cds-bar`): wordmark left; sync-point select, Recompare and Activity right, 18px apart.
- **Ledger grid:** `minmax(0,1fr) 132px minmax(0,1fr)` for the column heads, every row twin, the work twin and each subfeature unit, so the rail lines up down the whole page. Column heads are sticky under the bar. Cells inset 20px from the left (16px on the Design side's outer edge).
- **Row:** feature head (chevron, title, status, count) across the full width at 14px top padding; then the twin. Closed rows show at most four moved parts per side plus "+n more".
- **Plan bar:** fixed bottom, min 56px (`--cds-plan`), aligned to the page width; summary left, actions right. Its sheet opens above it, capped at min(56vh, 520px).
- **Activity panel:** fixed right, 440px (`--cds-panel`), from under the bar to the bottom. With the panel open the page shifts left to make room and the plan bar stops at the panel's edge.
- **Rhythm:** small steps (4, 6, 8, 10, 12, 14, 16, 20, 24px) set directly in the stylesheet; the tool does not use the App's `--space-*` scale.

**The 820px Rule.** Under 820px the twin stacks to one column: App cell, then the rail as a horizontal strip between dashed hairlines, then the Design cell, each side labelled. Column heads hide, gutters drop to 16px, tool labels hide behind their icons, the direction control goes full width, plan actions split the width, and the panel becomes full-screen.

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

### Direction control
The global three-way segmented control (Into the App / Full sync / Into Design): each option is glyph + name (500) + hint (12px), min 150px, joined by inset hairlines; the set option is filled ink with the hint at 70%.

### Buttons
- **Shape:** square, 30px tall, 12px side padding, 14px lucide glyph + label.
- **Default:** transparent with an input-rule outline; hover darkens the outline to ink; active adds Wash.
- **Primary:** filled ink, Paper text, no outline; hover softens to Quiet Ink. One per surface (Run plan, Upload n files, Pull the project).
- **Disabled:** Quiet Ink text, hairline outline.
- **Tool** (bar): borderless, Quiet Ink to Ledger Ink on hover or when pressed.
- **Icon** (28×28): borderless glyph, Quiet Ink to Ledger Ink.

### Links
12px ink text with an input-rule underline offset 3px; the underline turns ink on hover. Used for every secondary action in a line (App diff, Design diff, Preview, Read brief, Copy brief, Check for changes).

### Inputs / Fields
Underline only: no box, radius 0, 6px vertical padding, `--border-input` rule that turns ink on focus. Checkboxes use ink as the accent colour. The sync-point select uses the same underline treatment.

### Ledger row
Feature head (chevron rotates 90° when open; title underlines on hover), status word (red only for "changed on both"; ink for one-sided; quiet for others), part count in mono. Opening reveals the work twin ("—" bulleted), one unit per subfeature (name, kind, mono paths, evidence, link actions) separated by dashed hairlines, inline diffs and preview iframes in hairline frames, and "What runs for this feature" with numbered steps.

### Plan bar
Pinned summary ("n features · direction · n skipped" in 500, tallies in mono) with Mark synced and Run plan. The sheet above holds the run confirmation (harness choice as a joined segmented pair, model field) and the mark-synced form.

### Activity panel
Job list (square state mark, title, mono time; current job gets a 2px inset ink bar on the left), job view (title, mono state and cost, 2px progress line, step list with square marks: outline pending, pulsing running, ink done, red failed, run-through skipped), and the log on Wash in mono with step lines in 500 and warn/error lines red.

### States
- **Loading:** skeleton bars (10px lines, a 22px verdict line) in a slow linear shimmer between `--n-a06` and `--n-a03`; four skeleton rows in the ledger.
- **Empty / in sync:** centred quiet message with actions; when everything is in sync, a multi-column quiet list of synced features.
- **Onboarding:** verdict-size heading, a 62ch lede, and the two routes as a twin (Pull with Claude Code | "or" on the rail | Import an export) under an ink rule.
- **Errors:** banner with a red inset outline and red text (`role="alert"`); inline errors 12px red.
- **Awaiting upload approval:** an approval block in the panel under an ink rule: heading, the exact file list as checkboxes with mono paths and status, per-card render check ("renders" in mono, or "n errors" red), preview links, then the primary Upload n files button.

### Motion
Short and functional only, all on `--ease-standard`: colour and outline changes at `--duration-fast` (100ms); `cds-in` (fade plus 2px drop) for opening a row's detail and the plan sheet at `--duration-base` (150ms); `cds-panel-in` (16px slide plus fade) for the panel at `--duration-overlay` (200ms); progress fill at 150ms. Loops exist only as status: the live square and running step pulse, the job spinner, the skeleton shimmer. The App's global reduced-motion rule collapses all of it.

## Do's and Don'ts

### Do:
- **Do** load the App's token files and consume them by name; add only `--cds-` layout aliases.
- **Do** prefix every class with `cds-` (deliberately not the App's `td-`, so the tool's CSS can never be mistaken for, or collide with, App component CSS).
- **Do** keep the App | rail | Design grid on any new twin so the rail stays one vertical line down the page.
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
