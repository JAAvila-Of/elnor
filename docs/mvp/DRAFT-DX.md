# Task desk draft authoring follow-up

The persistent Task desk now shares draft loading in `openDraft(task)` and
normalized command fields in `draftInput()`. `beginCreate()` declares the new-task
priority once as `initialPriority` and loads both selection metadata and editable
fields through `openDraft`. The public example keeps normal; the owned authoring
exercise keeps its previously demonstrated high default.

These are local synchronous actions using existing Surface and TypeScript.
Creation, selection, save and terminal acknowledgement share field preparation.
Request guards, cancellation, immutable journaled commands, expected revisions,
retry/status/acknowledgement and late-draft handling remain explicit. Revision
review and copying a deleted draft deliberately preserve the typed fields rather
than calling `openDraft`. Restored attempts retain their captured priority.

Only `examples/persistent-task-desk/App.eln` changes implementation. Compiler,
runtime, editor, client, provider, host and tests are unchanged. This does not
promote the optional operation helper or introduce Surface syntax.

## Validation

- The existing 11 Surface persistence/CRUD cases pass before and after.
- Candidate and public copies each pass CLI check/build and 123 selected tests
  with no failures, skips or cancellations: persistence, CRUD, host origin,
  disposal, asynchronous actions and spike regressions.
- Six CRUD browser phases and six separate editing phases pass through real
  HTTP/SQLite, including lost replies, restart, conflicts, rollback, retained
  drafts and changed-history blocking.
- The private exercise compiles and passes its browser flow: new high, existing
  normal, explicitly chosen normal restored after a lost reply, and journal
  cleared only after correlated status/acknowledgement. No browser errors occur.

The first aggregate candidate run lacked its generated runtime module: 106 cases
passed and the spike import failed. An explicit CLI check/build prepared that
candidate before the successful 123-case gate. The failed run is retained.

Delivery measured at the same candidate path is 28,442 to 28,203 raw JavaScript
bytes (-239), and 8,604 to 8,607 gzip-9 bytes (+3), including view and client factory
and excluding the Node/Python host. No CPU or comparative performance result is
claimed. Named actions clarify responsibilities; source line count is not a DX
acceptance criterion.

The previous complete 1024-test and native-editor results remain historical;
neither suite was rerun for this application-only refactor. The exercise is an
guided technical check, not independent human authoring acceptance.

## Retained evidence

Internal producers, original/refactored source archives, patches, immutable input
hashes, bounded Windows Job logs, synthetic SQLite databases and documentation
hashes are in `elnor/.elnor/mvp/draft-dx/`:

| Scope | Record |
| --- | --- |
| Candidate gate | gate-c4028d9bc2664966b10d39d5c348bd17 |
| CRUD browser | crud-browser-b3c67b556d7d454ca8294ef1119dc2ce |
| Editing browser | edit-browser-4db49c5c09e54c97bb30a505178d1725 |
| Public transfer | promotion-b20ab7fe035346a29f2043a217865d04 |
| Private high-priority exercise | exercise-7c6828adb69840b09271219ebc2269a6 |

See the [authoring exercise](TASK-DX-EXERCISE.md) and [CRUD contract](TASK-CRUD.md).
