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

## Remaining scope

- Account calendar (.ics) download and a real request path for expired invites.
- Accurate undo confirmation when snapshot restoration reverts later edits.
- Styled connection hints and icon-picker hints that escape scrolling clipping.
- Corrections for the Design project's empty-project guideline, font copy and
  theme manifest, prepared for the next app-to-Design push.
