# Live TypeScript dependency buffers in the editor

## Scope and result

The language worker already accepted versioned TypeScript source. The native
adapter previously synchronized only `.eln` documents, so editing an imported
TypeScript declaration without saving could leave Surface diagnostics and
definition ranges based on disk text.

The adapter now registers open local `.ts`, `.tsx`, `.mts` and `.cts` documents
in the same versioned workspace as Surface files. This includes buffers open
before activation. Their changes invalidate pending analysis, and worker replay
uses their current text. No imported module is executed to obtain its types.

`npm run check` parses and typechecks four components. `npm test` builds those
components and passes **287/287 Node tests**, with no skipped cases. The adapter
integration corpus contains **13 cases**, eight added here and five preceding
alias cases. These tests use a VS Code API double and the real worker; they are
not native editor evidence.

The expanded native suite passes **12/12 tasks** in `run-8qpKqr`, on Windows
with VS Code **1.145.3** and extension-host Node **24.22.1**. The process exited
zero with `trusted: true`, `passed: true` and `sourceFilesUnchanged: true` after
manual workspace trust. The first attempt, `run-lEZktV`, ended with
`trusted: false` and zero completed tasks; that attempt validated no capability.

## Implementation boundaries

- Open TypeScript documents participate in synchronization, physical source
  identity, alias conflicts, version epochs, closure and replay.
- Diagnostics and language providers remain scoped to Surface requests. Elnor
  does not query its Surface diagnostic engine on ordinary TS files or replace
  the editor's TypeScript diagnostic provider. Source-ownership conflicts can
  still be shown on either language's view.
- Initial workspace discovery still indexes Surface consumers only. A TS file
  does not become an owned buffer merely because the worker reads it from disk.
- A registered TS view is reloaded from saved source after its text model or
  clean final tab is released. Watcher notifications then refresh that tracked
  file, including while closed. Notifications cannot replace a dirty view.
- Watching TS extensions does not constitute complete dependency discovery:
  never-registered TS dependencies are not adopted by disk notifications alone.
- Surface rename that reaches a TypeScript declaration still fails explicitly
  with `Cross-language rename into TypeScript is not proven by this spike`.
  Neither source is changed. This increment does not implement rename from the
  built-in TS provider into Surface.

The underlying worker retains its existing TypeScript options. Registering a
`.tsx` buffer is not evidence of JSX support, tsconfig parity or general
TypeScript-project integration.

## Regressions and reproduction

All five initial new adapter cases failed before the integration. A TS edit did
not advance the workspace epoch; buffers present at activation or replay did
not change Surface diagnostics; navigation returned disk offset 25 instead of
unsaved offset 37 after a Unicode comment; rename rejected the file as outside
the versioned workspace rather than reaching the explicit cross-language limit.

The final eight new cases cover:

1. Unsaved `.mts`, `.ts` and `.cts` edits changing a Surface expression's type.
   Each maps `TS2339` exactly to `toUpperCase`, without writing the dependency.
2. A dirty TypeScript buffer already open when the adapter activates.
3. Worker restart retaining dirty TS text and actual model closure restoring
   the saved type.
4. Definition navigation into current unsaved TS text after Unicode changes
   its UTF-16 source offset.
5. Explicit rejection of rename into an owned TS declaration, preserving both
   texts.
6. Saved notifications for a previously registered, subsequently closed TS
   dependency invalidating Surface analysis and recovering when its type changes
   back. This test intentionally changes its temporary disk fixture.

Run from `elnor`:

```sh
node --test tests/editor-alias.test.mjs
npm run check
npm test
npm run test:editor
```

The native launcher uses an existing local VS Code installation and isolated
test profile. It resets seven generated source fixtures and temporarily creates
the existing file-symlink fixture. It changes no trust setting, installs no
global extension and downloads no editor. The person must review and grant
Workspace Trust for `editor-workspace` if requested.

Three native tasks passed in addition to the preceding nine:

- Change an imported `.mts` interface without saving, verify exact Surface
  diagnostics and recovery, and preserve its disk source.
- Navigate into the unsaved declaration after a Unicode prefix and reject a
  cross-language rename through real provider commands.
- Edit the dependency during worker analysis, reject stale batches, replay
  dirty TS text after restart, then discard the editor buffer and recover the
  saved type.

Results are retained in `elnor/.elnor/spikes/004/editor-runs/<run>/result.json`.
A process exit alone is insufficient; require `passed: true`, all twelve tasks,
and `sourceFilesUnchanged: true` before claiming native validation.

## Remaining uncertainty

Never-opened TypeScript dependencies changed on disk, project configuration,
JavaScript buffers, JSX, remote or additional workspace folders, larger graphs
and rename across native TS and Surface providers remain outside this bounded
increment. Complete project dependency invalidation is recorded in the
[MVP backlog](../../../tasks/005-mvp.md), rather than extending this closed spike.
