# Embridge conformance suite (vendored)

`fixtures/*.md` and `expected/*.json` are copied unchanged from the Embridge specification's test suite,
[github.com/embridge-foundation/embridge/tests](https://github.com/embridge-foundation/embridge/tree/main/tests)
(spec v0.2.2, MIT licence). `src/shared/embridge/embridge.test.ts` parses every fixture and checks the
tree against its expected JSON, then checks that Todoi's writer output is clean, lossless and idempotent.
Refresh them together with the `embridge` package version in `package.json`.
