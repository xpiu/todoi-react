# Account and project gaps

Implement the reviewed gaps gradually, retaining the existing Minimal/Rounded themes,
Base UI controls, server authorization and data hooks. No additional dependencies.

## Completed: ownership and pending invites

- Project settings offers an inline member selection and confirmation for ownership
  handover. The previous owner stays as an admin; leaving is a separate action.
- Membership writes lock the project and recheck the current actor. Concurrent
  handovers cannot create two owners. Ordinary role updates, invites and removals
  cannot create or remove an owner.
- Admins can manage project settings and invitations. Viewers and editors can leave
  their own membership, with no promise of Undo that would require regained access.
- Pending invites load in the existing Members section with copy-link, expiry and
  revoke. Loading and revoke failures remain local and retryable.
- Access changes use live requests, avoiding delayed offline handovers and conflicts
  with unrelated project edits. Project data retains the existing offline transport.

Verification: six Playwright checks passed (handover, leave as admin/viewer,
pending invites, API refusals and recovery), including all four theme/mode scopes,
phone layout, screenshots and the existing axe gate. Three isolated database tests
passed, including concurrent handovers and rollback. Repository typechecking,
lint and all 181 unit tests passed; lint retains existing warnings.

## Completed: avatar images

- Account › Profile uploads/replaces a PNG, JPEG, GIF or WebP image (2 MB maximum)
  and removes it back to initials. Inline failures leave the current image intact.
- Images use existing disk storage, signature checks, constrained response headers
  and the cleanup queue. The user row serializes replacement; only the current
  opaque image URL is served. Superseded and removed URLs return 404.
- The existing image fields now reach the profile, account menu, member roster,
  assignees, pickers, comments and activity. Failed images fall back to initials.

Verification: five Playwright checks passed across all four theme/mode scopes,
including refresh, propagation, replacement, removal, phone layout, axe and failed
upload recovery. Two isolated database tests passed for concurrent replacement,
cleanup and validation. All 181 unit tests, typechecking, lint and production
client/server builds passed. Impeccable found no issues in the changed UI.

## Completed: calendar export and expired invite requests

- Account › Data downloads dated items from accessible live projects and the Inbox
  as an `.ics` snapshot, including items with only a start date. Archived, deleted
  and undated items are excluded. Date
  ranges, local times, stable identities, escaping and UTF-8 folding follow
  [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html).
- Expired invites offer a signed-in request. The inviter (or current owner) receives
  one Inbox notification per person and invite, with instructions to send a fresh
  link. Requests persist across reload, reject mismatched locked emails and closed
  projects, and never grant access. Invite acceptance rechecks under the same locks.

Verification: six Playwright checks passed across the four theme/mode scopes,
including phone layout, axe, download contents, failure recovery, request delivery,
deduplication and authorization. Five database checks passed (requests and existing
notifications). All 184 unit tests, typechecking, lint and production builds passed.

## Completed: snapshot undo feedback

- Snapshot restores read current values, compare only the fields they restore and
  name later edits that were overwritten. Unrelated edits stay intact; values
  already restored do not raise a warning. Relation order does not count as a change.
- Priority, labels, assignees, dates, recurrence, moves, parent links and membership
  restoration use the shared helper. Successful bulk steps survive a retry without
  being repeated. Bulk outcomes enter history only after successful writes.
- A single-item read now includes its fields and relations; the scoped read supplies
  queued local edits through the existing offline transport. Network failures can
  use the current optimistic item; access refusals cannot use that fallback.
  Offline restoration confirms after the server acknowledges the queued write.
  Last-repeat status and parent-list changes are included in restored-field feedback.

Verification: all twelve focused Playwright tests passed (four theme/mode scopes
plus existing delete and cross-project move coverage); helper tests cover unrelated
edits, relation ordering, failures and partial retries. All 189 unit tests,
typechecking and lint passed.

## Completed: styled and scroll-safe hints

- Connection pills use the existing CSS hint and suppress it while the menu is open.
- List/project icon tiles and color swatches use the shared Tooltip's portal option.
  Base UI owns trigger composition, delay, collision placement and portal behavior;
  the skin and Minimal typography reuse the existing CSS rules and tokens.
- Phone bottom sheets provide their popup through the existing portal context, so
  nested hints stay inside the active modal and escape inner scrolling. Keyboard
  navigation, selection handlers, accessible labels and disabled behavior remain.

Verification: four Playwright theme/mode checks passed, including scrolled last-row
hints, keyboard selection, offline connection menus, phone layout and axe. All 144
focused Storybook checks passed across the four scopes. Screenshots were inspected;
Impeccable's detector found no issues in the changed controls.

## Prepared: Design references for the next sync

[The correction package](../design/20261010-next-push.md) provides an apply-checked
patch for the empty-project guideline and font statement, plus the exact four
canonical theme/mode manifest entries and regeneration criteria. The patched
empty-project guideline was rendered and inspected in a disposable archive copy.
The live Design project has not been published from this task.

## Final verification

The combined browser run passed 36 scenarios; one expired-invite scenario timed out
and passed its focused rerun. All 37 scenarios are verified, including each new
workflow plus existing completion, delete and cross-project Undo coverage. The
start-only calendar export passed both download and retry checks after its final
update. Ten isolated database checks, all 190 unit tests, typechecking, lint and
production client/server builds passed. Lint retains pre-existing warnings.
