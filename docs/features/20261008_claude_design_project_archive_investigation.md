# Claude Design project archive investigation — 8 October 2026

Use **Share → Project HTML → Project archive → Export** for full Design snapshots. It preserves this project's source files and avoids the Claude Code calls used by a full pull. The current sync tool already supports this route; no new transport is needed.

## Verified export behavior

Inspected the live Todoi Design System project (`13419b94-fc55-494b-8a6d-e08632bb71e0`) in Chrome. Its Export HTML dialog offers:

- **Project archive:** “Every project file, zipped. Instant and free.”
- **Standalone HTML:** combines the selected page into a self-contained file using Claude, and explicitly counts toward usage limits.

Choose the archive for synchronization. Standalone HTML is a generated presentation artifact and does not preserve the separate source files needed for mapping and diffs. Downloading an archive does not require publishing the design or changing its sharing permissions.

Anthropic's [Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design) also documents ZIP and standalone HTML as separate export formats. The free-versus-Claude distinction above was verified in the live dialog, rather than inferred from that article.

## Actual archive and fidelity

Downloaded `~/Downloads/Todoi Design System (3).zip` at `2026-10-08T10:21:32Z`:

| Measurement | Result |
| --- | --- |
| Compressed / uncompressed bytes | 6,700,489 / 9,347,997 |
| Files | 479 |
| Source and documentation | 116 JSX, 99 TypeScript declaration files, 12 CSS, 78 Markdown |
| HTML references and previews | 130 files |
| Other contents | Bundle, manifest, images, fonts, SVGs, uploads and support files |
| SHA-256 | `58daef476d0ab0dc05cad486f29a7624c77a180b05cb1807189b5eb6d81d72bf` |

The ZIP has original project-relative paths: `components/`, `tokens/`, `ui_kits/`, `guidelines/`, `explorations/`, `assets/`, `readme.md`, `styles.css`, and `_ds_manifest.json`. It is suitable as input to the existing source-based sync engine, not merely a rendered page.

Compared every file against the latest existing local snapshot, `20261008T064600246Z` (after the 28-file upload): all 439 snapshot paths are present; 435 contents match byte for byte and four differ. The archive contains 40 additional paths. This checks coverage of the prior snapshot; it is not a same-revision comparison against a fresh live MCP file listing.

Ran `findExports`, `importExport`, `compare`, and `buildBundle` using temporary state, then removed that temporary state:

- Downloads discovery recognized the archive's `FlowboardDesignSystem_13419b` namespace.
- Import took **278 ms**, producing 452 files after the existing exclusion of 27 `uploads/` files.
- All 452 retained paths and contents matched a separate extraction byte for byte, with no missing or extra files.
- Applying the current `pullable` rules selects 433 files totaling 2,217,154 bytes. Imports retain additional assets and generated/support files; comparison still applies the configured ignore rules.
- Comparison completed, and the kit bundler rebuilt 101 component modules successfully.
- Existing export and DesignSync reader tests passed: 2 test files, 7 tests.

The tool's actual current snapshot and sync points were not replaced during the investigation. The fresh downloaded ZIP remains in Downloads.

## Savings and what still costs tokens

The current pull starts Claude Code to dispatch DesignSync `list_projects`, `list_files`, and batched `get_file` calls. It captures file contents from tool results rather than asking Claude to rewrite them. Reads already use the configured Haiku model, low effort, and limited turns, but still require model calls and tool-call generation.

Existing completed pull jobs report:

| Pull date | Files | Duration | Claude Code reported cost |
| --- | --- | --- | --- |
| 5 October | 431 | 159 seconds | $3.9731 |
| 6 October | 433 | 173 seconds | $5.6132 |
| 8 October | 433 | 168 seconds | $5.5799 |

These are API-equivalent cost figures recorded by the harness, not proof of a separate charge on a subscription. The historical jobs do not provide enough data here to claim an exact token count saved. Archive download and local import invoke no model, so they eliminate the full-pull model usage. The 278 ms measurement covers local import only, not downloading, human interaction, or a complete synchronization run.

MCP/API transport does not inherently consume model tokens: our current Claude Code orchestration does. A direct supported file/archive API could also transfer bytes without model usage. No stable, documented archive-download API was verified in this investigation; the confirmed route is the authenticated browser export followed by the existing local importer. Browser automation could perform those clicks, but would add UI/session dependencies and has no additional token-saving advantage over a manual download and deterministic import.

AI ports into the App or kit still cost tokens when they read and adapt selected source files. Project-status checks, pre-upload live reads, upload orchestration, and read-back verification also retain their existing costs. ZIP import replaces full snapshot acquisition, not those operations.

## Existing integration and limits

The tool already provides Downloads discovery, ZIP selection/drop, folder import, and a CLI:

```sh
npm run design-sync -- import "$HOME/Downloads/Todoi Design System (3).zip"
```

Implementation: [snapshots.ts](../../tools/claude-design-sync/src/engine/snapshots.ts), [DesignRefresh.tsx](../../tools/claude-design-sync/src/ui/DesignRefresh.tsx), and the [import/export server routes](../../tools/claude-design-sync/src/server/main.ts). DesignSync reads and upload checks remain in [designsync.ts](../../tools/claude-design-sync/src/engine/designsync.ts).

The manifest exposes a bundle namespace, not an authoritative server revision or full project identity. The importer associates it using the first six hexadecimal characters of the configured project ID. This is a useful check for our exports, not a collision-proof identity guarantee. A recognizable different namespace is refused; a missing/unrecognized namespace can be imported without claiming a project ID.

The download's filesystem modification time is only a freshness hint. The GUI uses a two-minute margin against the last known Design update, but copying an old ZIP can give it a newer modification time. An import never claims Design's `projectUpdatedAt`: upload preparation still reads live target files and checks for newer edits. A later CLI/API pull still fetches the project rather than treating the ZIP's timestamp as proof it is current.

Recommendation: use a newly downloaded **Project archive** as the normal full-refresh route and retain the existing Claude Code pull as an automated fallback. Keep DesignSync's targeted upload checks and verification. This changes how Design files reach the sync tool; it does not change the production React/Base UI architecture or remove the need to review translated code.
