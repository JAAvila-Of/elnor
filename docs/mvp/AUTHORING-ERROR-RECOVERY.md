# Authoring diagnostic context and recovery

The exercise's `check`, `build` and initial `preview` build now explain failures
without requiring the author to infer whether an earlier preview is current.
The type checker, Surface grammar and pass/fail criteria have not changed.

For example, changing `Counter label="Clicks"` to `Counter missing="Clicks"`
produces the existing TS2353 diagnostic followed by its original source line:

```text
TS2353 .../App.eln:12: ...
  12 |       Counter missing="Clicks" {
Check failed; no preview was rebuilt.
Fix the errors, save, build again, then reload.
```

The header retains the actual diagnostic code, file, reported line and message;
the ellipses above abbreviate that header only for illustration. A failed
`check` does not build. A build rejected by source diagnostics reports whether
previous preview files were kept or no successful preview exists yet. Errors
without that verified build-state metadata do not invent a preview state.

Context comes from source snapshots captured during that check, including
readable files whose parse fails. Later disk edits cannot substitute a different
line into the report. Missing files, unavailable dependency snapshots and
out-of-range/unknown lines receive the diagnostic header without fabricated
context. TypeScript-backed CLI mapping remains line-oriented; no precise column,
caret or editor-equivalent source range is implied. CRLF/Unicode are retained
as source text and terminal control characters are printed as escapes.

The reporter does not fix or save source, execute application code, rebuild on
error or change generated-preview preservation rules. Failure still exits with
code 1; repair/check/build succeeds with code 0. The
[preview build-status notice](PREVIEW-BUILD-STATUS.md) independently reports
pending saved Surface/CSS changes when the browser reloads.

Five new regressions in [the authoring corpus](../../tests/authoring-session.test.mjs)
cover terminal context and repair, first-build failure, retained preview, source
snapshot stability after edits, missing files and control/Unicode/range handling.
The initial missing-context regression failed before implementation. All 21
authoring cases pass; the complete suite has 381 passing Node cases and the
four-component check passes. Tests run on disposable workspaces. No user source
or manually started preview server was changed. This is automated feedback-path
evidence, not an independently completed human error-recovery exercise.
