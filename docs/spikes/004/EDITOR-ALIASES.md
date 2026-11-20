# Native editor views of one physical source

Follow-up: [TypeScript buffers](TYPE-BUFFERS.md) adds live dependency snapshots.
Counts and native results below describe the earlier alias increment.

## Result and boundary

The physical-origin service corpus established one buffer per tested filesystem
origin. It did not establish how independent VS Code URI documents should use
that buffer. This follow-up exercises the actual adapter, including two open
tabs referring to one file through a file symlink.

The final native run, `run-Rzyy1P`, passed **9/9 tasks** on Windows with VS Code
**1.145.3** and extension-host Node **24.22.1**. It reported `trusted: true`,
`passed: true` and `sourceFilesUnchanged: true`. Two independent URI documents
were observed, rather than inferred from engine tests. No files were saved by
the adapter or the test edits.

The five adapter integration cases in `tests/editor-alias.test.mjs` use a VS Code
API double and the real language worker. They are distinct from this native
evidence. The complete Node suite passes **279/279 tests**; `npm run check`
parses and typechecks four components, and `npm test` also builds them.

## Changes to the adapter

- Equal source text still registers or acknowledges each logical editor view.
  The previous early comparison could omit that ownership step.
- Saved indexing keeps one logical entry per physical source. Opening a real
  view retires disk-only alias entries; a watcher notification through another
  alias cannot replace an owned dirty buffer.
- Divergent editor text produces an `ELN-SOURCE-CONFLICT` diagnostic. Neither
  tab is overwritten. The caller reconciles its text explicitly before semantic
  requests, including rename, proceed. Conflicts also prevent pending results
  from being delivered as current analysis.
- A physical rename plan expands to every supported open URI view of each
  target. Each view must still match the analyzed source. The adapter returns
  one `WorkspaceEdit`; normal editor events update the service after application.
- Closing a tab and closing a `TextDocument` are separate lifecycle events.
  Clean cached models can remain after their last tab disappears. The adapter
  releases that view using `tabGroups` events, while retaining dirty tabless
  documents such as renamed consumers. A URI with another open tab is retained.
- A final saved-text change before close can change the shared buffer. After
  releasing that view, unanimous surviving editor text reestablishes ownership.
  Divergent survivors still require reconciliation. Reopening a cached model
  registers its view again and exposes any conflict with the remaining buffer.

The adapter continues to handle only the first trusted local workspace folder
and Surface documents. This is not automatic tab synchronization or merging.

## Evidence that changed the implementation

Before the adapter changes, three of the first four new integration cases
failed: diagnostics propagated a conflict exception without a visible marker,
rename omitted an open alias URI, and alias closure left incompatible state.
The extended five-case corpus additionally checks watcher notifications, closed
disk aliases, reopening and a simulated revert before close.

The first native attempt, `run-ASsxNP`, ended with `trusted: false` and zero
completed tasks. It validates no editor capability. The launcher did not grant
trust or change trust settings. The person granted workspace trust manually.

The next native run, `run-XNIaMI`, completed eight tasks, including conflict
recovery and applying rename to both alias URI documents. Its ninth task timed
out while waiting for `TextDocument.isClosed` after closing the tab. That exposed
an invalid lifecycle assumption in the harness and adapter. The final test
observes tab removal, and the adapter handles the cached clean model separately.

The successful `run-Rzyy1P` repeats the six preceding editor tasks and adds:

1. Change one physical source view without changing its alias tab; verify the
   conflict marker, blocked rename and recovery after matching the texts.
2. Apply a rename to both open URI views and one consumer; verify source text
   and diagnostics without saving.
3. Revert and close an alias tab, retain the other view's unsaved text, restart
   the worker, then reopen and reconcile the saved alias view.

All five generated source files and the file visible through the symlink remain
unchanged on disk. The fixture link is removed with `unlink`, not recursive
removal through the target. Results and editor logs remain under
`elnor/.elnor/spikes/004/editor-runs/<run>/`.

## Reproduction and remaining uncertainty

From `elnor`, run `npm run check`, `npm test` and `npm run test:editor`.
The native launcher uses the existing local editor and its isolated test profile;
it downloads no editor and installs no global extension. If Workspace Trust is
requested, the person must review only the generated `editor-workspace`.

Native directory-junction views, retargeting during editor edit application,
multiple groups containing the same URI, remote workspaces, large-workspace
performance and a human assessment of conflict recovery are not established by
this run. Engine-level junction and retarget coverage remains described in
[physical identity](PHYSICAL-IDENTITY.md).

The next bounded uncertainty is live unsaved changes to ordinary TypeScript
dependencies through the native adapter. The worker supports versioned
TypeScript documents, but this adapter still indexes and syncs `.eln` documents
only. Do not infer native TypeScript-buffer integration from these alias tests.
