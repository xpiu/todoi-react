# Item creation performance

Recommendations 1 and 3 are implemented: shorten the save pipeline and reduce board work while an item receives its server ID. Server-issued IDs, durable device storage, receipt deduplication and owner authorization remain in use.

The transport sends a queued write directly to the authenticated mutation endpoint instead of checking the session first. The server rejects an owner mismatch before writing. A 401 retains pending changes as failed drafts for recovery under their original account. Acknowledgement still commits to IndexedDB before resolving the request.

Live mutations use their existing scoped cache refreshes. Restored operations retain the transport's refresh fallback and project the durable acknowledgement into the query cache. This removes the extra global invalidation after each live write.

Project views group items and children once, share label/person indexes, and build item/count lookups in one pass. Optimistic creation preserves unchanged item references. A memoized board adapter receives immutable records, child summary counts and stable callbacks. Member lookups depend on members rather than the entire project response, so refreshing list counts does not invalidate every card. Delete reads the latest query cache at the action boundary; range selection uses current visible DOM order. Pending cards reserve the normal ID metadata row with an accessible, non-copyable “Pending” label.

## Measurements

Local Chromium against the development servers, one Playwright worker, three creates in each of Rounded/Minimal × dark/light: 12 samples before and 12 after. The same routing harness adds 200 ms to each session preflight and create request. Browser timestamps measure Enter to optimistic insertion and Enter to the displayed server ID; they exclude Playwright polling overhead. These figures are controlled local measurements, not production latency estimates.

| Measure | Before | After |
| --- | ---: | ---: |
| Median optimistic insertion | 21.0 ms | 16.4 ms |
| Median displayed server ID | 532.8 ms | 277.6 ms |
| Server ID range | 458.6–564.3 ms | 250.1–325.0 ms |
| API requests per create, including refreshes | 9 | 5 |
| Rounded card height, pending → confirmed | 30 → 52 px | 52 → 52 px |
| Minimal card height, pending → confirmed | 39 → 56.94 px | 56.94 → 56.94 px |

Median confirmation time fell by 48%. Session, labels, current-user and saved-view refreshes disappeared from the create sequence; item, project, group/count and Inbox badge refreshes remain.

On a board with 101 existing server records, the new card renders during creation and acknowledgement while the 101 existing cards skip rendering. The check also exercises delete/undo, range selection and opening the restored card. It passed three consecutive runs and the final regression suite.

## Verification

- 47 Playwright tests passed across creation, offline recovery, dependency replay, lost acknowledgements, conflicts, actor mismatch, access revocation, cross-tab freshness, keyboard selection, completion, drafts, deletion/undo and cross-project moves.
- All 181 unit tests and 22 server integration tests passed. Integration coverage includes actor mismatch, receipt retry, transaction rollback and item placement.
- Typechecking, changed-file JavaScript lint, CSS lint and client/server production builds passed. Existing warnings remain. Full repository lint fails on the pre-existing `react(immutability)` error at `tools/claude-design-sync/src/ui/Activity.tsx:231`.
- Desktop screenshots were inspected in all four scopes; phone pending/confirmed screenshots were inspected at 390 × 844. Bounding boxes remain identical across acknowledgement, and typing the next item continues while saving.

Local evidence lives in ignored `.tmp/`: [baseline log](../../.tmp/performance/baseline.log), [final timing log](../../.tmp/performance/final-latency.log), [regression log](../../.tmp/performance/final-e2e.log), and [repeat render check](../../.tmp/performance/render-check.log). Example screenshots: [desktop pending](../../.tmp/shots/item-pending.png), [desktop confirmed](../../.tmp/shots/item-confirmed.png), [Rounded dark](../../.tmp/shots/item-performance-rounded-dark.png), [Rounded light](../../.tmp/shots/item-performance-rounded-light.png), [Minimal dark](../../.tmp/shots/item-performance-minimal-dark.png), [Minimal light](../../.tmp/shots/item-performance-minimal-light.png), [phone pending](../../.tmp/shots/item-phone-pending-minimal-light.png), [phone confirmed](../../.tmp/shots/item-phone-confirmed-minimal-light.png).

Reproduce the focused coverage with `npx playwright test tests/e2e/item-performance.spec.ts --workers=1`; the large-board check uses test-only React development commit instrumentation. The simplification review consolidated lookup construction, reused the existing open-item callback and made failure handling explicit without adding dependencies or replacing the sync architecture.
