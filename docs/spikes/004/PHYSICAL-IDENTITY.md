# Physical origins and alias-owned buffers

Follow-up: [native editor aliases](EDITOR-ALIASES.md) verifies bounded URI-view
conflicts, rename and closure in VS Code. Counts below record this earlier
engine/worker increment.

## Question and result

Do symlinks and Windows junctions preserve the same module identity in native
ESM, generated output and the versioned language service?

They did not initially. The preceding 253-test suite passed, but eleven of twelve
new physical-identity cases failed. Native Node ESM coalesced a real path and a
directory junction, while emitted modules produced `[1,1]` instead of `[1,2]`
from what should be one shared counter. A parent-relative import returned
`"Wrong"` instead of `"Ready"` because resolution used the alias directory.
Surface records, unsaved buffers and rename references were also separated by
logical path, and retargeting an owned link did not invalidate an old rename plan.

Physical origin resolution now unifies the tested file aliases across emission,
checking and the synchronous/asynchronous services. The final twenty-one-case corpus
passes, including worker replay, conflicting views, alias closure and retargeting.
This is in-process/worker evidence, not native editor UI synchronization evidence.

## Physical source resolution

`sourcePath` in `source-identity.mjs` uses filesystem `realpath` for existing
paths. For a new unsaved file, it resolves the nearest existing ancestor and
appends the missing suffix. The file is not created. `sourceKey` applies the
existing slash normalization and Windows case folding to that physical origin;
source hashes therefore identify one tested physical path rather than each alias.

Surface and ordinary module imports resolve relative to the physical importer.
This includes parent-relative imports and TypeScript package-format lookup.
Shared modules are emitted once, and Surface aliases share one output/contract
record. Output metadata and safe compatibility aliases use the physical source.
Original logical paths remain available for editor locations and view ownership.

The behavior matches the default Node ESM loader in the tested link forms. It is
not an inode-based identity scheme, a persistent file UUID, or support for Node's
nondefault symlink-preservation modes.

## Buffer ownership and acknowledgment

`document-store.mjs` is shared by the synchronous engine and asynchronous client.
It stores one source buffer per physical origin, plus logical alias views:

- Dependency discovery can read saved source but owns no editor view. It cannot
  replace an existing dirty buffer. The first explicit editor view may supersede
  disk-discovered text with its unsaved content.
- A new explicit alias with incompatible text raises `ELN-SOURCE-CONFLICT` before
  replacing source, changing versions or advancing the asynchronous epoch.
- A known alias remembers the canonical text it last acknowledged. If another
  view changes the shared buffer, an edit based on that older text is rejected.
  The caller can read the current text and acknowledge it with `open(alias, text)`
  before submitting a further edit. No automatic three-way merge is attempted.
- Rename requires all explicitly owned views to acknowledge the current buffer.
  This check runs in both the synchronous service and asynchronous client, before
  exposing edits. Rename references are deduplicated by physical source.
- Closing one view retains another view's dirty text. Closing the last explicit
  view releases that editor buffer. Remaining Surface consumers rediscover the
  saved contract immediately, without requiring a service or worker restart.

The model exposes canonical text through either alias; it does not itself update
other native editor tabs. Primary logical locations can change when their view
closes, while TypeScript virtual filenames stay tied to physical origins.

Worker replay sends the latest shared text for every explicitly owned alias.
The client retains its view-acknowledgment guards, so replay cannot authorize a
rename that the caller's known views have not acknowledged. No source is written
to disk by these service operations.

## Link retargeting

Tracked aliases pin their physical identity while owned/discovered. If a link
now resolves elsewhere, `ELN-ALIAS-RETARGET` rejects access instead of moving an
old buffer to the new target. Existing rename plans and asynchronous snapshots
become non-current. Closing the old logical view and reopening it establishes a
new identity explicitly. Retargeting does not rewrite either target file.

Worker startup and restart validate these pinned identities before replay. If a
link changes while the worker starts, replay rejects the ready promise and
terminates that worker before posting the saved snapshots to the new target.

This validation occurs on operations; it is not a background filesystem watcher
or an atomic filesystem transaction. Retargeting during a compiler read is not
proven by these editor-snapshot tests.

## Evidence and reproduction

`tests/physical-identity.test.mjs` contains twenty-one tests covering:

- Native ESM identity through directory links and file symlinks, emitted singleton
  state, and physical parent-relative edges for ordinary and Surface modules.
- Surface record/contract deduplication, rename of both alias consumers and one
  physical declaration, and physical TypeScript package context.
- Dirty buffers shared by known aliases, first explicit ownership after discovery,
  new/known conflicting views, acknowledgment before rename and correct closure.
- Worker restart/replay, closure of the primary view, restoration of saved
  dependencies without restart, and rejected retargeted queries/plans/restarts,
  including a link changed during worker startup.
- A new unsaved TypeScript file under a linked directory, available without a
  physical file being created.

The initial twelve-case corpus passed one case and failed eleven before changes.
Additional regressions caught false import errors after the final view closed and
two unsafe known-view/rename cases; each failed before its corresponding fix.
Two further assertions exposed unguarded restart/startup replay after retargeting;
both failed before the worker lifecycle guards were added.

On this Windows account, file symlinks and directory junctions were created using
the existing privileges. `node scripts/probe-physical-links.mjs` reports file-link
capability; the integration tests exercise actual links without silent skips or
privileged fallback. Fixture cleanup unlinks aliases before deleting its checked
temporary root, keeping target files outside recursive link removal.

`npm run check` checks four components. `npm test` builds and passes **274/274
Node tests**, including all twenty-one physical-identity cases. The native VS Code
host was not rerun, and generated DOM execution still uses the existing fake DOM.

## Limits and next uncertainty

The tested store has one canonical buffer and explicit logical views. A real
editor can maintain independent URI documents; tab synchronization, conflict
presentation and edit application must be verified through its native adapter
before claiming support there. This is the next useful experiment.

Link cycles, hard links, inaccessible targets, file aliases with different source
extensions, cross-volume preview metadata, nondefault loader flags, live disk
watching, concurrent filesystem mutations and large-workspace realpath costs are
not established by this corpus. Existing parser/runtime grammar and the `mount`
API are unchanged. No production filesystem, performance or general editor
integration claim follows.
