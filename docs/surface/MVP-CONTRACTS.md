# MVP operational contracts

**Status:** implementation-derived contracts accompanying the
[subset baseline](MVP-SUBSET.md). These describe the current selected behavior
and responsibility boundaries. Internal functions/IR fields are not a published,
versioned SDK or Rust interoperability ABI.

## Source and diagnostic coordinates

- Inputs retain their original source string and filename. Component names are
  not unique project identities; same-named components in different files can
  remain distinct.
- The editor API uses zero-based UTF-16 code-unit `start`/`length` spans. Preserve
  CRLF, tabs and Unicode text. Diagnostic line/column values, where exposed, are
  one-based; a tab is not expanded to visual columns.
- Exact mapped diagnostics/definitions/edits refer to original source. Generated
  scaffolding has no invented original range. Editor errors without an exact
  origin are visibly approximate. The CLI retains its own projection/line
  reporting; do not claim that every CLI error has the editor's exact range.
- The draft specification's UTF-8 offset goal is not this API's current contract.
  A future byte-oriented consumer needs an explicit conversion boundary.

Evidence: [language service](../../tests/language-service.test.mjs),
[projection](../../src/language-projection.mjs),
[checker](../../src/checker.mjs), [initialization guards](../spikes/004/INITIALIZATION-GUARDS.md).

Project CLI checker diagnostics expose original file and one-based line, not
columns or source ranges. The [action-line mapping](../mvp/CHECKER-ACTION-LINES.md)
now uses original parameter/body spans for errors inside multiline actions,
including collapsed signature whitespace. Generated TS text and non-action
diagnostic routes are unchanged. Native editor mapping remains a separate path.

## Parse, check and emit

`parseSurface(source, filename)` produces the current component representation,
including source spans and declaration/UI data. Strict parsing is used for
compilation. The editor can recover selected incomplete inputs while retaining
diagnostics; recovered input is not an expanded compiler grammar.

Graph validation checks the tested component/import/slot/event contracts.
TypeScript projections supply type and symbol analysis. The projections remain
separate implementations with shared validators and parity regressions; this is
not a guarantee of equivalence for every TypeScript/Surface program.

The normal CLI `build` checks first, plans/generates output in memory, then
replaces its known generated `dist` directory. A tested planning/generation error
does not replace existing output. Filesystem writes are not an atomic
transaction. Low-level `generate` and `emitGraph` are emission functions: their
callers must perform the required graph checking, and ordinary runtime imports
need the module path context supplied by graph emission.

Outputs contain ESM plus the matching runtime. Surface modules use mapped
`.elnor-components/<hash>.mjs` filenames; ordinary dependencies use
`.elnor-modules/<hash>.mjs`. Safe flat compatibility wrappers may also exist.
Use the returned output map/manifest, rather than deriving a filename from the
component declaration. Hashes identify normalized physical source paths, not
source content; stability across different checkout locations is not promised.

The planner reads/parses/checks/emits ordinary sources without importing or
executing user modules. The browser later executes the generated application
and its allowed dependencies normally. This is not a sandbox for arbitrary
application code. Type-only imports are erased; runtime imports must satisfy the
bounded local ESM contract. ESM identity/cycles are delegated to the JavaScript
module loader; a tested deferred cycle is not all cycle behavior.

Evidence: [compiler](../../src/compiler.mjs), [module planner](../../src/module-plan.mjs),
[local ESM corpus](../../tests/local-esm.test.mjs),
[Surface identity](../../tests/surface-identity.test.mjs).

## Instance state and lifetime

The emitted module exposes `mount(target, props, handlers = {}, slots = {})`,
which returns a disposer after a successful mount. `props` is supplied by the
caller; compile-time contracts do not imply runtime validation of arbitrary
JavaScript callers. Instances have independent state and cleanup ownership.

- State initializers run once per instance, in state declaration order. All
  states are initialized before calcs, even if declarations were textually
  interleaved. Calcs are installed in calc declaration order. State snapshots
  do not become reactive initializers.
- Direct component-binding reads before their phase are caught in the tested
  static cases. An actual indirect early state/calc access can throw `ELN-INIT`
  with original declaration metadata. The guard does not prove general static
  initialization safety or map every runtime access stack to original source.
- Reassigning a cell notifies subscribed effects, except for `Object.is`-equal
  values; updates are scheduled through microtasks. Calcs and UI reads track
  cell dependencies. There is no general atomic-transaction or deep object/array
  mutation-tracking contract. Use reassignment for changed containers.
- Notification only queues the current subscribers; it does not execute their
  callbacks synchronously. A subscriber added after a write does not join that
  past notification. The private subscriber Set is traversed directly, while
  the effect-executing flush keeps its captured batch. See
  [notification snapshots](../mvp/NOTIFICATION-SNAPSHOTS.md).
- A queued reaction failure does not discard independent live effects in the
  same batch. The scheduler attempts them in order, queues at most one follow-up
  microtask for chained writes, then rethrows the original failure or an ordered
  AggregateError. Disposed effects remain skipped. Later writes can notify a
  failed effect again; there is no automatic retry or rollback of prior writes.
- A captured effect consumes invalidations queued before its execution. Writes
  during or after that execution remain pending for a later batch. There is no
  general topological ordering or guarantee that every intermediate read sees
  all derived values updated.
- Props passed through composition are live read-only getters. Direct writes to
  prop/calc bindings are checked in the selected forms; nested object mutation
  is not covered by a deep-immutability guarantee.
- Child/slot/list/conditional resources have owners. Disposing a scope is
  idempotent, removes owned effects/listeners and attempts all cleanup callbacks.
  A failed synchronous mount cleans its owned partial resources and preserves
  prior target children in the tested cases.
- A successful mount's disposer releases ownership before running cleanup;
  repeated and reentrant calls do nothing, including after a cleanup failure.
  Cleanup callbacks run before removal of the mount's captured nodes. Reusing a
  node after disposal does not transfer ownership back to the old disposer.
  Disposed effects release their stored callback; retained mount disposers
  release their owner and node collection.
- A cleanup failure can be rethrown or aggregated with the mounting failure.
  Later event-handler errors, asynchronous rejections and running promises do
  not receive a general rollback/cancellation guarantee. Application actions
  own their async error handling and effects.
- A keyed `each` expects an array and unique keys. Invalid arrays/duplicate keys
  have explicit runtime errors. Node reuse/reordering is tested; key stability
  is the author's responsibility.
- A failure during a queued `each`/`when` read, construction or DOM update
  clears that block's owned region, releases its listeners/subscriptions and
  preserves the anchor for a later dependency notification. Staged rows are
  released as well. Outside siblings remain; the previous UI is not restored.
  The original error remains visible, with cleanup failures aggregated and the
  original cause preserved. Scope disposal and failed initial mounting also
  remove the anchor. See [structural recovery](../mvp/STRUCTURAL-RECOVERY.md).

Text and button labels retain a Text node. Each effect reads/converts once and
updates `nodeValue` only when the actual node value differs. Reevaluation can
repair an external edit to that same Text node; replacing owned nodes externally
is not covered. Expression effects remain independent. See the
[text-write study](../mvp/TEXT-WRITE-GUARD.md) for behavioral and measured limits.
Handlers use native event listeners, and no raw HTML
operation is selected by the subset. This does not validate arbitrary user actions or
provide the future `SafeHtml` capability. External CSS is global to the current
preview; style isolation is not implemented.

Generated children use an internal `renderOwned` entry point within the caller's
rollback/lifetime region. External `mount` calls keep independent boundaries.
The graph compiler can build an each row as one detached root when it proves a
plain single-container view without slots, structural blocks or nested child
components. Such rows use no temporary staging fragment; other bodies keep the
general path. The root remains detached until keyed reconciliation inserts it.
A sole-child each in a fresh container can use verified collective DOM removal;
foreign siblings or user cleanup callbacks retain ordinary per-row teardown.
See the [region experiment design](../mvp/REGION-OPTIMIZATION.md) for its guards
and measured limits.

Evidence: [runtime](../../src/runtime.mjs),
[initialization](../../tests/initialization-parity.test.mjs),
[scope semantics](../../tests/scope-parity.test.mjs),
[reactive scheduling](../../tests/reactive-scheduler.test.mjs),
[notification queue](../../tests/notification-queue.test.mjs),
[structural recovery](../../tests/structural-recovery.test.mjs),
[text writes](../../tests/text-write-guard.test.mjs),
[mount cleanup](../../tests/mount-rollback.test.mjs),
[composition](../../tests/spike.test.mjs).

## Editor text, identities and safe edits

One canonical in-memory source belongs to each tested physical origin. Logical
URI views own/acknowledge that source independently. Realpath and the nearest
existing ancestor identify tested existing/new paths. File links and directory
junctions are covered in the engine; native alias coverage uses a file symlink.
Hard links, concurrent filesystem mutation and all retarget races are not a
complete filesystem identity model.

Conflicting or stale-view text raises `ELN-SOURCE-CONFLICT` instead of silently
replacing the canonical buffer. Retargeting a tracked alias raises
`ELN-ALIAS-RETARGET`; close/reopen establishes a new identity. Native tabs are not
automatically synchronized or merged. A user reconciles differing texts.

The async client snapshots workspace epoch and worker generation. Changes
invalidate pending responses; restart replays current owned source. Cancellation
discards work/results but cannot preempt a synchronous TypeScript analysis already
running inside the worker. Tooling reads imports without evaluating them.

Rename plans are checked against tracked versions, exact mappings, parse state
and the tested collision rules. Native rename expands physical edits to matching
open URI views after checking their text. Incomplete/stale/conflicting plans or
edits into unversioned/ordinary TS declarations are refused. The editor applies
the resulting `WorkspaceEdit`; neither engine nor adapter saves user sources
automatically. There is no general capture-safety or cross-language rename claim.

The native adapter handles the first trusted local workspace folder. It indexes
Surface consumers and syncs open Surface/TS buffers. Released clean tabs may leave
cached text models; dirty tabless documents retain ownership. Saved TS changes,
creation and deletion now invalidate disk analysis even for never-opened local
dependencies, under the [disk invalidation contract](../mvp/DISK-INVALIDATION.md).
This preserves unsaved buffers and excludes generated/dependency directories;
the initial [configuration contract](../mvp/TYPESCRIPT-CONFIGURATION.md) uses one
fixed shared profile without loading tsconfig options or discovering configured
projects. Ordinary TypeScript diagnostics
continue to belong to the editor's TS extension.

Evidence: [document store](../../src/document-store.mjs),
[async client](../../tests/async-language-service.test.mjs),
[physical identity](../../tests/physical-identity.test.mjs),
[adapter corpus](../../tests/editor-alias.test.mjs),
[native aliases](../spikes/004/EDITOR-ALIASES.md),
[native TS buffers](../spikes/004/TYPE-BUFFERS.md).

## CLI and preview responsibilities

The current CLI accepts `check`, `build` and `preview` with an entry stem under
`examples/components`; the default is `UserEditor`. This is a fixed example
layout, not a project generator or a configured arbitrary application workspace.
Preview entry fixtures are explicitly maintained in `examples/preview-fixtures.mjs`.
A new component does not automatically acquire a preview fixture.

The separate [project checker](../mvp/PROJECT-CHECK.md),
`npm run check:project -- <entry.eln>`, accepts a saved local entry outside that
layout, follows its Surface imports and reuses the same checker/profile.
Generated projections stay in the tool's internal run cache. This is check-only;
project preview and configured-project discovery are not implied.
The separate [project build](../mvp/PROJECT-BUILD.md) accepts an explicit output,
checks first and emits new owned generations before publishing its manifest.
It preserves previous files, refuses foreign/linked destinations and does not
create HTML, preview props or assets automatically.
The separate [project preview](../mvp/PROJECT-PREVIEW.md) serves the owned manifest
entry with explicit JSON props and optional CSS, retaining verified module bytes
for open pages. Rebuild then reload selects a new generation. It does not create
fixtures, infer assets, watch sources or load tsconfig options.
The separate [development controller](../mvp/PROJECT-DEVELOPMENT.md) combines
build/preview, hashes saved sources inside a declared scope and serially rebuilds
after stable changes. Its status is rendered on navigation; failed builds retain
the last valid manifest. It preserves CSP and keeps page refresh manual;
complete dependency discovery is not guaranteed. The subsequent
[observed-dependency extension](../mvp/OBSERVED-DEPENDENCIES.md) records local
Surface/checker/planner reads and lookup paths, including absent candidates,
and polls those concrete paths outside the recursive scope. Node modules,
unobserved inputs, tsconfig loading and arbitrary directory contents remain excluded.
The later [preview-input extension](../mvp/PREVIEW-INPUTS.md) rereads explicit
props/CSS on development-page navigation, versions bootstrap/CSS URLs and retains
the last valid pair on input errors. The subsequent
[typed-props extension](../mvp/TYPED-PREVIEW-PROPS.md) checks development JSON
against captured checker inputs from the published build, revalidating fallback
compatibility after a contract change. This is TS assignability with field-path
diagnostics, not runtime invariant checking or persisted contracts. CSS is not
compiled and existing pages do not reload automatically. Standalone preview
keeps its fixed, untyped startup inputs.

The separate [authoring exercise](../mvp/AUTHORING-WALKTHROUGH.md) provides a
fixed App/Counter workspace through `npm run authoring -- ...`. Setup preserves
existing sources, check/build reuse the same compiler APIs, and preview requires
manual saving, rebuilding and reloading. Saved-input status is limited to the
exercise's Surface/CSS snapshot; this helper does not implement general project
discovery, automatic rebuilds or a formatter.

The separate [indentation formatter](../mvp/FORMATTER.md) returns original-source
UTF-16 edits or explicit refusal diagnostics. Its CLI only checks or prints.
It re-parses and checks structure/token preservation and idempotence before
returning edits; it does not typecheck dependencies. The
[versioned adapter](../mvp/VERSIONED-FORMATTING.md) adds epoch/generation and
document version/text checks before returning edits, with explicit alias refusals.
These guards have Node/API-double evidence and a passed native unsaved-buffer
formatting task. Filesystem write actions remain unimplemented; human formatting
preferences remain unevaluated.

Build emits external scripts/styles and preview metadata. The preview server
binds locally and applies its restrictive CSP. The retained Edge pilot proves
the specified local flows and five policy probes; it is not a general security
audit, persistence backend, browser matrix or production deployment contract.
No HMR, SSR/hydration or published extension/package is supplied here.

Evidence: [CLI](../../src/cli.mjs), [preview server](../../src/server.mjs),
[closure/pilot](../spikes/004/VIABILITY-CLOSURE.md).

## Evolution boundary

This inventory preserves the demonstrated route while the MVP adds workflow and
formatting. A new claim needs evidence in its relevant layer: parser acceptance
does not substitute for type/runtime/editor/browser evidence. Existing refusal
codes and internal APIs may evolve deliberately with tests and documentation;
they are not all permanent language design commitments.

Keep the current JS/TS implementation initially. If a Rust port becomes useful,
preserve the observable contracts and compare implementations with the existing
corpus. Decide explicitly how UTF-16 editor spans cross a byte-oriented boundary;
do not infer that replacing the Surface compiler replaces TypeScript semantics.

The [async policy guide](../mvp/ASYNC-POLICY.md) is the consolidated selection
and acceptance reference for the following application-level policies.

## Explicit application async policy

The [async search study](../mvp/ASYNC-OPERATIONS.md) verifies an application-owned
latest-response policy, pending/error state and cooperative cancellation through
the existing async action path. Its host aborts a supplied lifetime signal before
disposal. This is an example policy, not automatic cancellation of arbitrary
actions or conditional child removal, and it does not implement `action.pending`.

## Explicit component disposal

A component may declare one synchronous `on dispose() => release()` expression.
The [disposal contract](../mvp/COMPONENT-DISPOSAL.md) covers ordinary mount
disposal, conditional/keyed/slot retirement, installed-hook UI rollback and
cleanup failures. It requires a void result and registers with the existing owner.
The hook does not await promises or choose an invocation policy. OwnedSearch uses
it to invalidate and abort local work; arbitrary actions retain their existing
explicit error/concurrency contract. Affected graphs use general rendering.

## Explicit write example policy

The [async write study](../mvp/ASYNC-WRITES.md) demonstrates application-owned
single-flight and immutable intent snapshots. Rejection retains an unconfirmed
intent; explicit retry reuses its key/data under a required provider replay
contract. Disposal can request abort and suppress late UI effects; it cannot
promise remote rollback or exactly-once execution. No core API, automatic retry,
queue or durable outbox is added. This is separate from latest-response reads.

## Local operation-helper experiment

The [operation helper](../mvp/OPERATION-HELPER.md) is an ordinary local TypeScript
module under examples/operations. It publishes readonly state into an explicit
Surface state and invokes a synchronous owned success callback. Latest supports
Cancel; single-flight ignores duplicate work and exposes only run/dispose. Work
errors and callback exceptions have separate paths. It does not alter action
semantics, implement action.pending or choose a provider's write/retry contract.
Its type, editor, browser and delivery evidence is separate from a stable API
commitment or independent human DX/performance acceptance.

## Persistent application editing variant

The [Task desk editing pilot](../mvp/PERSISTENT-TASK-DESK.md) uses existing
Surface/TS contracts for a stable host-owned client, versioned task edits and a
scoped journal. Its loopback HTTP/SQLite transport and separate same-origin host
do not add a framework backend API or relax the general preview CSP. The original
Task desk remains in memory; persistent creation/deletion, authentication and
multiple-writer coordination are not established.

The later [Task desk CRUD increment](../mvp/TASK-CRUD.md) extends that local
application with create/delete command kinds, replay identities and monotonic
tombstones. It preserves replace journals, adds an old-ledger migration and
retains explicit client/view ownership. These remain application examples, not
new language declarations or a stable backend SDK.

## Persistent recovery fixture boundary

The [journal/provider study](../mvp/RECOVERY-JOURNAL.md) adds an example-local
client, Surface view and loopback Python/SQLite fixture. It records the intent
before a write and requires correlated applied/rejected status or authoritative
absence within the same provider scope/epoch. Explicit acknowledgement removes
only a checked terminal record. The fixture demonstrates single-writer recovery
across page reload and provider restart, not a general persistence API, authenticated
backend, multi-tab outbox or exactly-once guarantee. The general preview CSP and
compiler/runtime/editor implementations remain unchanged.
