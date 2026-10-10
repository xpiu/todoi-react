# React and UI quick wins

All seven audited improvements are implemented on `main`, using the existing React, Base UI, Zustand and design-system patterns.

1. Project exports use the same item filtering, completion preference and ordering as the project view. Hidden lists are excluded. List ordering uses the filtered counts. The menu, toast and file share one export count; calendar exports exclude undated items.
2. The design-sync Activity action is declared before the resume callback that calls it. Repository lint now passes with warnings.
3. AppShell, Sidebar and TopNavbar subscribe to individual resolved appearance preferences. Unrelated appearance changes no longer invalidate these subscribers through the whole preference object.
4. Switch forwards native button props and its ref. It composes the supplied click handler and respects `defaultPrevented` and disabled state, following Checkbox's existing pattern. Base UI popover composition, focus return and canceled clicks have browser coverage.
5. The Tiptap editing surface loads separately from read-only descriptions. The existing idle preloader warms it for offline editing. Cold loading uses the shared delayed skeleton and Cancel; failed imports offer Reload because the browser retains rejected module imports. Recovery preserves the item URL and device drafts. Save-and-close waits for the editor to load.
6. Filter availability and counts are memoized against their actual inputs: root items, members, labels and the current date. Grouping and export derivations are also memoized.
7. Global shortcuts, shortcut hints and keyboard navigation share the existing typing-target guard, including contenteditable rich-text editing.

## Bundle measurement

Production Vite manifests identify the JavaScript entry and its recursive static imports, excluding dynamic imports. Gzip sizes are measured per emitted file and summed. This measures initial JavaScript weight, not production load latency; idle preloading subsequently fetches the editor.

| Initial JavaScript | Before | After |
| --- | ---: | ---: |
| Uncompressed | 1,587,377 bytes | 1,131,713 bytes |
| Gzipped | 497,811 bytes | 356,267 bytes |

Initial gzipped JavaScript fell by **28.4%**. The manifest confirms `DescriptionEdit.tsx` is a separate dynamic entry. Local measurements: [bundle comparison](../../.tmp/quick-wins/bundle-comparison.json).

## Verification

- 57 distinct Playwright checks passed: 20 screen comparisons, 8 editor loading/recovery/offline tests, 4 draft tests, 4 export tests and 21 keyboard, settings, item-performance, mobile-sidebar and motion regressions.
- 124 Storybook browser tests passed across Switch, DescriptionEditor, Sidebar and TopNavbar in Rounded/Minimal × dark/light.
- All 181 unit tests, typechecking, JavaScript lint and CSS lint passed. Lint retains existing warnings.
- All 111 design-sync tests and its TypeScript check passed. Client and server production builds passed.
- Impeccable and Simplify reviews preserved the existing visual language and component architecture. Desktop and 390 × 844 phone screenshots were inspected. Loading/editing accessibility checks passed; the new loading-error text separately passed the Axe contrast rule.

The checked-in screen baselines already differed from the current seeded workspace before implementation: 12 of 20 initial comparisons failed. Final comparisons used fresh pre-change captures, with the existing baseline for the eight already passing screens, and all 20 passed. Checked-in snapshots were not rewritten. The targeted Impeccable detector retained one existing warning about the semantic blockquote border; the new loading styles introduce no detector findings.

Local evidence is ignored by Git: [screen comparisons](../../.tmp/quick-wins-visual.log), [functional checks](../../.tmp/quick-wins-functional.log), [final editor checks](../../.tmp/quick-wins-editor-final.log), [regressions](../../.tmp/quick-wins-regression.log), [Storybook](../../.tmp/quick-wins-storybook-final.log), [repository checks](../../.tmp/quick-wins-check-final.log), [design sync](../../.tmp/quick-wins-design-sync.log), [production build](../../.tmp/quick-wins-production-build.log), and [Impeccable](../../.tmp/quick-wins-impeccable.log).

Example screenshots: [Minimal light editor](../../.tmp/quick-wins/shots/minimal-light-editor-editing.png), [Rounded dark editor](../../.tmp/quick-wins/shots/rounded-dark-editor-editing.png), [phone failed load](../../.tmp/quick-wins/shots/minimal-light-editor-failed-phone.png), [phone recovery](../../.tmp/quick-wins/shots/minimal-light-editor-recovered-phone.png), and [filtered board export](../../.tmp/quick-wins/shots/minimal-light-export-board.png).

Reproduce focused coverage with `npx playwright test tests/e2e/editor-loading.spec.ts tests/e2e/exports.spec.ts tests/e2e/drafts.spec.ts`. Run `npm run check`, `npm run design-sync:check` and `npm run build` for repository checks.
