# Preparing to use the Todoi Design System in this app

**Date:** 2026-10-01
**Source:** `.tmp/20261001_claude_design_system_export/Todoi Design System/` (Claude Design export; `readme.md` is the spec, `SKILL.md` the agent entry point)
**Status:** in progress. Phases 0 and 1 done 2026-10-01; phases are implemented in order, each ticked when verified in the browser.

## What the export is

- A full product spec disguised as a design system: hierarchy vocabulary (`Account → Group → Project → List → Item → Subitem`), voice and copy rules, visual foundations, interaction and keyboard model, item editing, states, notifications, export, responsive classes, settings/account pages, project lifecycle, archive/trash, auth and guests.
- **Tokens:** 11 plain CSS files under `tokens/` (colors, two themes × two modes, typography, spacing, radius, elevation z-ladder, motion, base, print). Directly reusable.
- **Components:** 90 `.jsx` files under `components/{core,navigation,board,list,calendar,overlay,project,auth}` with matching `.d.ts` prop contracts. Written for React 18 UMD + Babel-standalone, CSS injected per component via a `<style>` tag, icons from the Lucide CDN global. Reference implementations, not drop-in production code.
- **UI kit:** `ui_kits/todoi/` is the assembled app (Board / List / Calendar, overlay, Settings, Account, Inbox). Depends on `_ds_bundle.js` and `window.*` globals. Treat as a behavioural reference and seed data, not as source.
- **Guidelines:** 70 specimen cards in `guidelines/` and `components/**/*.card.html`; `explorations/` holds rejected directions (keep for "why not").
- **Adherence lint:** `_adherence.oxlintrc.json` forbids raw hex, raw px, non-DS fonts, and unknown component props. Worth porting.

## Fit with the current repo

- Status ids already match (`NEW / BACKLOG / TODO / DOING / DONE` in `src/shared/item-status.ts`).
- Everything else is new: data model stops at `items`, client is one unstyled list, no theming, no routing, no auth.
- Decisions to make before building (see "Open decisions" below): Base UI vs the DS's own primitives, Tiptap vs the DS Markdown editor, Zustand for the Appearance store.

## Working rules (from the spec, apply from day one)

- Tokens only in component CSS. Never a hex, never a mode selector, never a raw `z-index`, never a component-level `@media`.
- `data-theme` and `data-mode` live on `<html>` and are owned by one Appearance store. Dark Standard is the default.
- Copy uses item / list / project, sentence case, verbs first. Never card / column / board in UI text.
- One shortcut registry, one Popover shell, one Toast (undo only), one `EmptyState`, one `SyncNotice`. No second copies.
- Notifications are Inbox items. No bell.

---

## Phase 0 — Interpret the design

- [x] Read `readme.md` end to end; keep it as the canonical spec. Copied verbatim into `DESIGN.md` (repo root, with a preamble that maps export paths to repo paths) per decision 6; the tokens are copied once, into `src/client/design/tokens/` (Phase 1), to avoid a second copy under `docs/`.
- [x] Open `ui_kits/todoi/index.html` in a browser (needs network for the CDN scripts) and walk every view, the overlay, Settings and Account. Note what is simulated vs real. Done with Playwright (41 screenshots in `.tmp/20261001_kit_walkthrough/`); notes in `docs/design/kit-walkthrough.md`.
- [x] Open each guideline card once; list the ones that affect data model or API (status linking, saved views, archive/trash, notifications, relations, repeat rules). See `docs/design/data-model-impact.md`.
- [x] Write a one-page glossary mapping DS vocabulary to database and API names (Group, Project, List, Item, Subitem, Label, Member, Status role, Saved view, Inbox). See `docs/design/glossary.md`.
- [x] Record the Open decisions below with a choice and a reason in this file.

## Phase 1 — Foundations: tokens, fonts, icons, theming

- [x] Copy `tokens/` and `styles.css` into `src/client/design/tokens/`; import once from `main.tsx`. Remove the current `styles.css` rules it replaces. Entry is `src/client/design/index.css` with cascade layers `tokens < base < components < theme`; the placeholder list styles now use tokens only.
- [x] Copy `assets/fonts/` (Inter variable, Geist Mono) and fix the `@font-face` paths; verify both only load for the Minimal theme. Verified with Playwright: no font request in Standard, `Inter-Variable.ttf` requested only after switching to Minimal (Geist Mono loads once a mono element renders).
- [x] Icons: add `lucide-react`. Port the DS `Icon` wrapper to TSX with an explicit icon map (name → component) so tree-shaking survives; include the custom `circle-todo` glyph. `lucide-react` 1.49: all 137 DS glyph names resolve; only the brand marks (github, slack, instagram, facebook, chrome) are gone from Lucide, `github` is drawn in `Icon.tsx`, the rest are added when their pages are ported. `IconName` is a union type, so an unknown name fails `tsc`.
- [x] Appearance store: port `components/core/Appearance.jsx` (theme × mode, per-slot Background/Foreground, show ids / labels / status, sidebar side, colorize columns, suggest shortcuts; `td-*` localStorage keys). This is the first Zustand use. `src/client/design/core/appearance.ts`: Zustand 5 + `persist` under one key `td-appearance` (the kit's many `td-*` keys migrate on first read, verified); DOM effects applied before React mounts; cross-tab sync via the `storage` event.
- [x] Viewport: port `Viewport.jsx` (`useViewport`, `data-device`, `data-touch` on `<html>`). `src/client/design/core/viewport.ts` on `useSyncExternalStore`; verified `data-device="phone"` at 390px.
- [x] Set `<html data-theme="standard" data-mode="dark">` in `index.html`; confirm all four theme × mode scopes render. Plus a pre-paint inline script that applies the stored theme/mode before CSS resolves (no flash; verified at DOMContentLoaded). Four scopes screenshot-verified (`.tmp/20261001_phase1/`).
- [x] Port the adherence lint rules (raw hex, raw px, font family, restricted imports) into the project linter. `oxlint` with a local JS plugin `tools/lint/design-adherence.js` (no-raw-hex, no-inline-px, no-inline-z-index, no-inline-font-family) + `no-restricted-imports` for `lucide-react`; `stylelint` for component CSS (no hex, no named colours, `z-index` must be a `--z-*` token, `font-family` must be a `--font-*` token, no `@media`, `td-*` class names). Unknown component props are a TypeScript error, so that rule needs no lint. `npm run check` = typecheck + both linters.
- [x] Decide the component CSS strategy (see decisions) and set up the first example end to end. `Button` (`src/client/design/core/Button.tsx` + `Button.css` in `@layer components`) is the example: tokens only, `td-btn-*` classes, used by the placeholder list; the Minimal theme layer restyles it without touching the component.

## Phase 2 — Core primitives (TSX, one at a time, `.d.ts` as the contract)

- [ ] Button, IconButton, Tooltip (`data-tip`, 400ms delay), Checkbox, Switch, TextField, Segmented, SwatchGroup, Avatar / AvatarStack, ProgressBar, Skeleton, StatusChip (+ `STATUSES` registry sharing `src/shared/item-status.ts`).
- [ ] Popover, Menu / MenuItem / MenuDivider / MenuNote / MenuButton, Select, Dialog, ConfirmDialog. Built on Base UI if that decision lands; styled with DS classes and tokens.
- [ ] Toast + UndoStack (depth 10, LIFO, session only), EmptyState, SyncNotice, ConnectionStatus.
- [ ] Shortcuts registry (`SHORTCUTS`) and `KeyNav` roving tabindex; `keyLabel` for ⌘ / Ctrl.
- [ ] Date utilities: `resolveDate`, `formatDate`, `formatDateRange`, `parseTime`; DateCalendar, DatePicker, DatesPicker, RepeatPicker (`describeRepeat`, `nextOccurrence`, `completeRecurring`).
- [ ] Markdown subset renderer (mentions, item keys) and QuickAdd parser (`#label @assignee !priority due… >List`). Pure functions first, with unit tests.
- [ ] A Storybook or a plain `/dev/ds` route rendering every primitive in all four theme × mode scopes and on phone/touch overrides. Add the DS theme-parity check as a test.

## Phase 3 — Data model and API (match the vocabulary)

- [ ] Extend the Drizzle schema in steps, each a migration: `groups` (with key prefix), `projects` (icon, color, visibility, default view, link-lists-with-statuses), `lists` (order, status role), `items` (key, project, list, order, status, priority, start, due, due time, repeat rule, cover, done), `subitems`, `labels` + `item_labels`, `members` + `assignees`, `comments`, `attachments`, `relations`, `activity`, `saved_views`, archive / trash flags with 90-day retention.
- [ ] Item keys: per-group prefix + counter, stable across list moves, re-issued across group moves.
- [ ] Zod schemas in `src/shared/` for every new table; Hono routes with typed RPC as today.
- [ ] Linked moves update list and status atomically; the response carries what changed so the toast can say "— Status set to Doing".
- [ ] Seed script from the UI kit sample data (Helicopters Europe project, labels, members) for local development.
- [ ] Inbox as one app-managed list per account; notifications written as Inbox items.

## Phase 4 — App frame and views

- [ ] Routing (projects, `/settings`, `/account`, `/i/CODE`); URL mirrors view, filters, sort and saved view.
- [ ] TopNavbar, SubNavbar (view switcher, Filter / Sort / Style / Share), Sidebar (groups → projects, Groups / Projects / Inbox nav, left or right), SearchDropdown.
- [ ] List view first (the DS default): ListView, ListSection, ListRow, inline quick-add, checkbox semantics (done remembers prior status).
- [ ] Board view: BoardView, ListColumn (status-role tints), ItemCard, LabelChip, DueDatePill, FilterChip row.
- [ ] Drag and drop: native DnD plus the TouchDrag long-press layer; quiet cues (dimmed source, 2px blue slot line); cross-list drop → undo toast.
- [ ] Keyboard model end to end: N, ⇧N, E, D, 0–4, ⌫, /, F, X, Z, ?, G-chords, Ctrl+K palette, Ctrl+arrow moves, multi-select + BulkBar.
- [ ] Calendar view: CalendarView, header, grid with spans and "+N more", day list, year mini months.
- [ ] Empty, loading (ViewSkeleton after 150ms) and error states per the situation table.
- [ ] Responsive: 1024px nav hoist, touch hit targets, phone item sheet and Popover bottom sheets. No `@media` in components.

## Phase 5 — Item overlay and editing

- [ ] ItemOverlay shell (880px, aside order: list · Status · Priority │ Dates · Repeat · Labels · Assignees │ Attachment · Cover · Relations │ Watch).
- [ ] Property pickers: Select for list / Status / Priority, DatesPicker, RepeatPicker, LabelPicker (create / edit inline), MemberPicker, CoverPicker, RelationPicker + ItemPicker.
- [ ] Description editor (Markdown subset, quiet toolbar, Save / Esc). Tiptap decision applies here.
- [ ] Checklist / subitems with ⋯ (Open · Convert to item · Move to another item · Delete) and drag reorder.
- [ ] Attachments (list, lightbox, drop sheet, file-drop onto cards), Comments (composer, @mentions, reactions, reply / edit / delete), activity rail.
- [ ] Overlay ⋯: Duplicate, Move / Copy to project (ProjectPicker), Make subitem of…, Export…, Archive, Delete.
- [ ] Recurring completion: `completeRecurring` on check, 650ms hold, toast with next due.

## Phase 6 — Project lifecycle, settings, account, auth

- [ ] ProjectDialog (templates, copy existing, visibility, group kind with prefix), ProjectPanel (single scrolling body, inline confirms), ActivityLog (per project, grouped by day).
- [ ] Archive and Trash view (account and project scope, Restore, Delete forever inline).
- [ ] Settings shell (Page › Section › Group › Row registry, search across rows) with General, Storage & sync, Labels, Appearance, Keyboard (generated from `SHORTCUTS`), Help, Integrations, Notifications.
- [ ] Account pages: Profile, Sign-in methods, API tokens, Security, Devices, Projects (storage, share links, invites), Data, Support.
- [ ] Better Auth: SignInPage, SignUpPage, ResetPasswordPage, InvitePage, GuestBar + `data-readonly` contract.
- [ ] Export: ExportMenu (PDF via `print.css`, Markdown in Embridge format, CSV); import from Markdown, Trello JSON, CSV via one Review step.
- [ ] Saved views (tabs row, shareable URL state).

## Phase 7 — Quality gates (set up early, run continuously)

- [ ] Unit tests for every pure function ported (parsers, date math, repeat rules, markdown, `encodeViewState`).
- [ ] Component tests in all four theme × mode scopes; axe accessibility checks; reduced-motion check.
- [ ] Theme-parity audit as CI: every color token defined in all four scopes, no orphans, no hex in component code.
- [ ] Visual regression on the kit's key screens (board, list, calendar, overlay, settings) once they exist.
- [ ] Keep `docs/design-system/readme.md` in sync when a rule changes; the spec is the contract, not the kit.

---

## Open decisions (resolved 2026-10-01)

Each decision records the user's direction (`=>`), the choice made, and the reason. Versions were
checked against npm on 2026-10-01.

1. **Primitives:** Base UI (planned in the README) for Popover / Menu / Select / Dialog behaviour with DS classes on top, or port the DS primitives verbatim. Leaning Base UI: it owns focus, ARIA and keyboard handling, and the DS defines look and copy, not internals. The DS's one-Popover rule still holds either way.
   => answer: use best practices from the Base UI community
   **Choice:** `@base-ui/react` (the package was renamed from `@base-ui-components/react`; v1.8 is current, stable since the 1.0 GA). One `Popover` wrapper in `src/client/design/core/` wraps Base UI's Popover with the DS classes, tiers and sheet behaviour; `Menu`, `Select`, `Dialog`, `Tooltip` follow the same pattern, styled through `className` and `data-*` state attributes the way Base UI's docs recommend. **Reason:** Base UI handles focus return, typeahead, ARIA roles and portal placement (Floating UI) which the DS reimplements by hand; the DS still decides every pixel. Base UI's `render` prop keeps the DS's custom triggers.
2. **Component CSS:** keep the DS "one CSS string per component" pattern as co-located `.css` files imported by the TSX (closest to source, tokens-only, easy to diff), or CSS Modules. Tailwind is not a fit; the spec is written in tokens and class hooks (`.td-*`) that themes target.
   => do not use tailwind - write elegant css and be smart - use legible class names that are conventional
   **Choice:** plain, co-located `.css` files (one per component, imported by its `.tsx`), class names in the DS's `td-<component>-<part>` convention (BEM-like, no hashes), organised in CSS cascade layers (`@layer tokens, base, components, theme`) so the Minimal theme's `html[data-theme="minimal"] .td-*` rules override components by layer order instead of selector weight. **Reason:** the Minimal theme file targets the `td-*` hooks by name, which CSS Modules' hashed names would break; plain CSS keeps the spec's selectors greppable and diffable; layers remove the `!important` and `html`-prefix tricks the export needs.
3. **Rich text:** Tiptap (README) versus the DS Markdown subset editor. The DS deliberately stores Markdown that round-trips to GitHub and Embridge. If Tiptap, it must serialise to the same subset.
   => tiptap is only used for some content-heavy fields
   **Choice:** the item description (and later long-form project descriptions) use Tiptap with a Markdown serializer restricted to the DS subset (headings 1–3, lists, task lists, quote, code, bold / italic / strike / inline code, links, mentions, item keys). Comments, titles and every other field stay plain textareas with the DS `MentionField` behaviour. The `Markdown` renderer is a pure function shared by both. **Reason:** Tiptap earns its weight only where people write paragraphs; everywhere else the DS's lighter editing model is faster and keeps the Markdown exact.
4. **Icons:** `lucide-react` with an explicit map versus the Lucide CDN global the DS uses. Choose `lucide-react`; pin the version close to 0.454 to keep glyph names stable.
   => the two themes (Standard and Minimal) use different typographies and icons
   **Choice:** `lucide-react` (current major is 1.x; the glyph names the DS uses are checked against it in Phase 1 and any renamed glyph gets an alias in the icon map). `Icon` takes a name from an explicit `ICONS` map (tree-shakeable), draws the custom `circle-todo` and the pixel-snapped `list` / `kanban` / `calendar` / `panel-*` glyphs itself, and reads the theme to pick the Minimal (Ledger) variants and the 1.75 stroke. Typography switches per theme in `tokens/typography.css` (system stack vs Inter + Geist Mono). **Reason:** no CDN global in a Vite app; an explicit map keeps the bundle small and makes "unknown icon" a type error.
5. **React version:** DS targets React 18 UMD; the app is React 19. Port, do not load the bundle.
   => aim for a more modern React 19
   **Choice:** port every component to TSX on React 19: function components, `use` / `useSyncExternalStore` where the DS used module-level stores, `ref` as a prop (no `forwardRef`), no `React.createElement` strings, no UMD bundle. **Reason:** the bundle depends on `window.*` globals and Babel standalone; React 19 removes the `forwardRef` boilerplate the DS carries.
6. **Where the spec lives:** `docs/design-system/` in this repo versus a separate package. Start in-repo; extract only when a second consumer exists.
   => write the spec in DESIGN.md and in more places where more info is useful `docs/design/`
   **Choice:** `DESIGN.md` at the repo root holds the full spec (the README already points to it); `docs/design/` holds the glossary, the data-model impact list and the kit walkthrough; tokens live once in `src/client/design/tokens/`. **Reason:** one canonical file for the rules, short companion pages for the mappings that change as the app grows.

Supporting choices made at the same time (all current versions on npm, 2026-10-01):

- **State:** Zustand 5 for the Appearance store (persist middleware with `partialize`, keys kept as the DS's `td-*` names so a kit user's preferences carry over).
- **Lint:** `oxlint` for TypeScript/TSX (the export's `_adherence.oxlintrc.json` is already an oxlint config) and `stylelint` for the token-only CSS rules (`color-no-hex`, disallowed `px` outside tokens, allowed font families).
- **Tests:** Vitest for pure functions; Storybook 10 with `@storybook/addon-vitest` (Vitest browser mode on Playwright) and `@storybook/addon-a11y` for component tests across the four theme × mode scopes; Playwright for end-to-end and visual regression.

## Sources (external)

- Design tokens: CSS custom properties over preprocessor variables; primitives → semantic → component layering. [https://gitlab.com/gitlab-org/gitlab/-/issues/473845](https://gitlab.com/gitlab-org/gitlab/-/issues/473845) · [https://github.com/fintraffic-design/fds-coreui-css](https://github.com/fintraffic-design/fds-coreui-css)
- Lucide React: static imports or an explicit icon map; `import * as icons` defeats tree-shaking. [https://lucide.dev/docs/lucide-react](https://lucide.dev/docs/lucide-react)
- Base UI: unstyled, accessible primitives from the Radix / MUI / Floating UI authors; actively maintained in 2026. [https://base-ui.com/react/overview/about](https://base-ui.com/react/overview/about) · [https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026)
- Storybook 9 with Vite: story globals for theme / viewport, a11y via axe, visual regression via Chromatic or Playwright. [https://storybook.js.org/blog/storybook-9/](https://storybook.js.org/blog/storybook-9/)
