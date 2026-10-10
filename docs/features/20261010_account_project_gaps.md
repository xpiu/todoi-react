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

## Remaining scope

- Avatar image upload, removal and propagation through the existing image fields.
- Account calendar (.ics) download and a real request path for expired invites.
- Accurate undo confirmation when snapshot restoration reverts later edits.
- Styled connection hints and icon-picker hints that escape scrolling clipping.
- Corrections for the Design project's empty-project guideline, font copy and
  theme manifest, prepared for the next app-to-Design push.
