# UI kit walkthrough — what is real and what is simulated

Walked on 2026-10-01 with Playwright against `ui_kits/todoi/index.html` from the export, served
locally (the kit loads React 18, Babel standalone and Lucide from CDNs, so it needs network).
Screenshots: `.tmp/20261001_kit_walkthrough/` (gitignored; regenerate with `.tmp/scripts/kit-walk.mjs`).

## What was walked

List (the default view), Board, Calendar (month), the item overlay (plain and with a checklist),
Style / Filter / Share menus, the `?` shortcuts dialog, Ctrl+K palette, quick-add with the full
grammar, Inbox, Projects and Project groups pages, Settings (General, Appearance, Keyboard,
Storage & sync), Account (Profile, Projects, Data), all four theme × mode scopes, the invite
landing (`?i=demo`), the offline pill (`?offline`), the empty project (Trade show 2027), the failed
sync notice (Dealers & stock), the phone item sheet (390px) and the tablet two-row chrome (900px).

## Real in the kit (behaviour worth matching exactly)

- Every view, menu, picker and keyboard shortcut is wired; the keyboard model, multi-select,
  bulk bar, undo stack, quick-add parser, saved views and URL mirroring (`?p=…&v=…&f=…&s=…`
  via `history.replaceState`) all work against in-memory state.
- The appearance store applies `data-theme`, `data-mode`, `--chrome-canvas`, surface overrides,
  `data-colorize-columns` and `data-sidebar-side` on `<html>` and persists them in `td-*` keys.
  Those keys and the Settings `td-prefs` / `td-saved-views-open` keys are the only persistence.
- The default view is List; the item overlay opens from a row or a card; the phone sheet stacks
  the aside above the content; the tablet breakpoint moves the SubNavbar to its own row.
- Seed data: project "Helicopters Europe website" (group Marketing & PR, prefix `MP`), with lists
  New / To-do / Doing / Done / Backlog, two members (Flo Zuallaert, Sam Verhoeven), labels
  note · shop · design · photos · broken · paperwork, a few covers, a recurring item (MP-137),
  relations, and an Inbox with notification items. This is the seed for Phase 3.

## Simulated (do not copy the mechanics)

- Uploads progress on a timer; relations, watching, comments and reactions live in component state.
- Archive / Delete stop at the undo toast; `ArchiveView` is not wired to anything.
- GitHub / Bitbucket storage, import review, sync conflicts, API tokens, devices, sessions,
  sign-in providers and the password reset are previews: dialogs open, confirming raises a toast.
- "Dealers & stock" fakes a fetch (skeleton) and a failed sync on first open; `?offline` fakes the
  connection; `?i=demo` fakes an invite.
- Settings and Account share one in-memory "screen" switch, not routes. The real app uses routes
  (`/settings`, `/account`, `/i/CODE`).
- The Lucide glyphs come from the CDN global; the icon names are what matters.

## Defects in the kit to avoid in the port

- React warns `validateDOMNesting: <button> cannot appear as a descendant of <button>`: the
  `Checkbox` button sits inside a row that is itself a `button`. The port makes the row a
  `div[role=button]` or puts the checkbox outside the clickable element.
- In the Minimal theme the toolbar is icon-only through `font-size: 0`, which leaves the view
  switcher without an accessible name beyond `data-tip`. The port keeps `aria-label`s on
  icon-only controls in every theme.
- The Appearance store applies attributes only after a consumer mounts the hook; a page rendered
  without it stays on the `index.html` attributes. The port applies the stored theme before the
  first paint (inline script in `index.html`) so there is no flash.

## Observations that confirm the spec

- Standard dark: neutral black chrome, Carbon foreground, blue action; Standard light: Butter
  canvas by default (the token fallback is Cornflower), cream lists, navy ink.
- Minimal (Ledger): 48px chrome, hairlines, Inter + Geist Mono, square checkboxes, done items
  struck through in grey, the priority word in text, no fills or shadows.
- Status glyphs: New `circle-dashed`, To-do `circle-todo`, Doing `circle-dot` blue, Done
  `circle-check` green, Backlog `archive`.
