# Claude Design Project archive review — 2026-10-10

Reviewed `.tmp/.tmp/Todoi Design System (4)` against the current worktree. The export's
`github.md` records its latest app-to-kit sync at 2026-10-10T04:55:14Z. The archive is a
comparison source, not an instruction to replace the production app.

The source inventory contains 118 component/helper JSX modules, 77 component stylesheets,
11 token stylesheets, 33 guideline pages, nine explorations and the interactive kit screens.
Comparisons covered exports/props, stylesheet declarations (ignoring formatting and cascade
layer wrappers), spec changes, and corresponding application behavior. Raw comparisons and
browser evidence live in `.tmp/20261010_archive_review/` and are intentionally untracked.

## What the archive teaches us

Most recent work flows **from the app into the kit**: aligned filenames, companion CSS,
SavedViewTabs, SearchDropdown loading/failure states, DescriptionEditor drafts, ProjectPicker
loading, SettingsShell and drag helpers. Many apparent diffs are formatting, token fallbacks,
JSX preview accommodations or old implementations. Matching prop names does not prove matching
focus behavior, data integrity or accessibility.

The two themes are already mature. Palette values and theme-independent tokens are effectively
unchanged. The exported Inter/Geist Mono files and all four SVG covers are byte-identical to the
app's copies. Font URLs are relative to different layouts; importing the kit typography file
would point at the wrong assets. Its extra Minimal menu rules also include regressions: selected
rows regain fills, disabled member rows can hover, and shortcut headings target `h4` instead of
the app's `h3`. Preserve the app's newer selectors and role-select styling.

The useful fresh ideas are about **dense metadata**: overflow labels should be discoverable,
and a full badge row should fit its card. These can improve the app without importing kit
state, manual positioning, timers or imperative measurement.

## Applied

- **List labels:** the app previously rendered only three label chips, then hid the “+N” count
  on hover without revealing the remaining labels. Rounded now keeps that count as an accessible
  button opening all names through the existing Base UI Popover. Keyboard Enter, Escape, explicit
  Close, focus return and the phone bottom sheet use the app's existing primitives. Each row owns
  its own open state. Minimal prints all names inline with its existing theme styling; long names wrap inside the
  metadata area so they cannot overlap the title.
- **Board badges:** crowded Rounded badge rows wrap rather than clipping metadata. Dates,
  checklist/attachment counts, assignees and the key retain their text. This adapts the kit's
  responsive-fit goal using CSS; its ResizeObserver/signature cache and icon-only compaction are
  unnecessary. Minimal retains its existing flowing metadata treatment.
- **Design specification:** clarified production authority and the actual stack; documented
  these adaptations and corrected the old claim that local font files do not exist.

## Retained or declined

| Area | Decision and reason |
| --- | --- |
| Shared controls, menus, tooltips, dialogs | Keep Base UI, forwarded refs/behavioral props, scoped portals and accessibility. The kit's document listeners and manual focus/positioning are preview substitutes. |
| Appearance, state, notifications, sync | Keep Zustand selectors, TanStack Query, actor-scoped IndexedDB, real recovery and server boundaries. Notification helpers and simulated conflicts do not establish a new persistence contract. |
| Board/list status behavior | Keep explicit status and server-linked moves. Kit ItemCard infers completion from a list name containing “done”/“complete”; a list called “Not done” illustrates why that must stay out. Keep atomic role review and archived-item exclusions. |
| Card quick actions and creation metadata | Decline the kit's menu-dependent expanded row: new action strings do not match the app's typed actions, and controls can remain inside an `aria-hidden` region. Existing overlay fields are already functional. |
| Label hover expansion | Adapt the discovery goal with the existing popover. Do not copy floating DOM mutation, color compositing, fixed width snapshots or mouse-only interaction. |
| Calendar | Keep app range drag/reschedule, undo and existing responsive behavior. The archive describes a simpler chip-only implementation. |
| Navigation and saved views | Already improved in the app: accessible tabs, loading/search states, chip paging and responsive sidebar. Preserve current routing and URL state. |
| Rich text, attachments and relations | Keep Tiptap, real uploads/limits, drafts and server mutations. Kit textarea shortcuts, timer uploads and in-memory relations are not production replacements. |
| Settings, account and authentication | Keep routed screens, authorization and truthful available actions. Preview providers, magic-link and reset flows do not imply server support. |
| Typography, covers, palette, explorations | Existing assets/tokens already cover these ideas. Keep local URLs and all four theme/mode scopes; no new visual world or dependency is needed. |
| Design-sync and Storybook | They adapt to the app. Do not reshape production APIs or automatically upload changes to Claude Design. |

## Verification

Storybook interaction coverage checks the changed components in Rounded/Minimal × dark/light,
including keyboard activation, focus return, no accidental item opening, all label names and
bounds of crowded badge content. Browser review covers desktop, tablet and phone with screenshots,
console checks, layout measurements and the existing axe scope. Production type checking,
unit tests, CSS lint and a client/server build are also required before accepting these changes.

Verified results: 64 Storybook cases passed (two component files × four theme/mode scopes),
179 unit tests passed, type checking and the client/server build passed, and CSS lint plus
JavaScript lint for the changed components passed. The browser matrix contains 12 combined
previews (four scopes × 1280/820/390px), with the Rounded label popup additionally opened and
closed in each case. Long label names fit, keyboard focus returns, and no item-open callback
fires. No console errors or axe violations were found under the project's WCAG rules; contrast
remains excluded by the existing project gate. The UI detector reported no findings. The existing app keyboard smoke test also passed
(arrows, selection, Escape and Enter-to-open).

Full-repository lint still reports the pre-existing `react(immutability)` error in
`tools/claude-design-sync/src/ui/Activity.tsx` (`resume` references `act` before its declaration),
confirmed in the unchanged HEAD version. This review does not alter that tool or unrelated
concurrent worktree changes.
