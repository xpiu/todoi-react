# CSS class names

How classes in `src/client/**/*.css` are named, so a class tells you which component it styles and
which stylesheet to open.

## The pattern

```
.td-<component>-<part>            a piece of a component      .td-list-row-title
.td-<component>-<part>-<variant>  a variation of that piece   .td-archive-caption-strong
.is-<state> / .has-<thing>        a state, added by script    .td-list-row.is-selected
```

- **`td-`** marks a Todoi class. Stylelint rejects anything else (`selector-class-pattern`).
- **`<component>`** is the component's file name in kebab-case: `ListRow.tsx` + `ListRow.css` →
  `.td-list-row`, `SettingsShell.css` → `.td-settings`. To find where a class is styled, turn its
  first words back into a file name.
- **`<part>`** names the piece in whole words: `-title`, `-icon`, `-section`, `-option`, `-divider`,
  `-chevron`, `-caption`, `-avatars`. Write the word out; an abbreviation saves a few characters and
  costs every later reader a search.
- **States** are separate `is-…` / `has-…` classes, or a `data-…` / `aria-…` attribute when the
  component already sets one. They are always written next to the class they change
  (`.td-calendar-cell.is-today`), never styled alone.

## Short forms that stay

These are common enough across CSS codebases to read at a glance, so they are kept:

| Class | Stands for |
| --- | --- |
| `td-btn`, `td-iconbtn` | Button, IconButton |
| `td-topnav`, `td-subnav`, `-nav` | navigation bars |
| `td-kbd` | a keyboard key (the HTML `<kbd>` element) |
| `-sm`, `-lg` | size variants |
| `-id`, `-url`, `-abbr` | the usual acronyms |

A few components keep a shorter block name than their file because the short name is the plain
word for the thing: `td-card` (ItemCard), `td-label` (LabelChip), `td-due` (DueDatePill), `td-check`
(Checkbox), `td-field` (TextField), `td-notice` (SyncNotice), `td-empty` (EmptyState), `td-hint`
(ShortcutHint), `td-bulk` (BulkBar).

## Where a component has several blocks

| Stylesheet | Blocks |
| --- | --- |
| `list/ListRow.css` | `td-list-row`, `td-list-row-group` (a row with its subitems), `td-list-row-avatar`, `td-list-row-label` |
| `board/ListColumn.css` | `td-list-column` (a list on the board) |
| `list/ListSection.css`, `list/ListView.css` | `td-list-section` (a list in the List view), `td-list-view` |
| `core/DatePicker.css` | `td-date-picker`, `td-date-calendar` (the month grid inside it) |
| `calendar/*.css` | `td-calendar-view`, `-header`, `-grid`, `-week`, `-cell`, `-day-number`, `-chip`, `-span`, `-more`, `-day-list`, `-mini` |
| `overlay/Checklist.css` | `td-checklist`, `td-checklist-head`, `-row`, `-add`, `-grip`, `-line`, `-list` |
| `overlay/CommentComposer.css` | `td-composer`, `td-mention-field` |
| `core/Skeleton.css` | `td-skeleton` (one placeholder), `td-skeleton-view` (a whole placeholder screen) |

## What does not follow the class rules

- **Custom properties** a component sets from script keep a short private name: `--td-z`,
  `--td-row-bg`, `--td-lanes`.
- **Storage keys and element ids** that start with `td-` (`td-prefs`, `td-signin-email`) are not
  classes.
- **Minimal theme overrides** live in `tokens/themes/minimal-components.css` and use the same class
  names, scoped under `html[data-theme="minimal"]`.

## The Claude Design kit

The kit still uses the earlier short names (`td-lrow`, `td-set-…`, `td-tip`). Every pair is listed in
`tools/claude-design-sync/class-names.json` (kit → app). The sync tool rewrites token CSS between
the two spellings when it merges, and tells the porting agent to do the same for component code, so
neither side has to adopt the other's names. That file is also the lookup table when an older note
or screenshot mentions a class you cannot find.
