# Choosing an async policy

The initial technical evaluation is complete within the tested examples. Elnor
supports async actions through ordinary JavaScript/TypeScript promises and
async/await. Applications still choose invocation, state and provider policies.
This guide connects the implemented pieces; it does not introduce an API.

## Choose by operation

| Need | Existing example | Required application policy |
|---|---|---|
| Replace an obsolete read, such as search | [OwnedSearch](../../examples/async-search/OwnedSearch.eln) | Capture a generation, invalidate earlier work and publish only the current result; own pending/error state |
| Submit one write at a time | [OwnedSave](../../examples/async-save/OwnedSave.eln) | Reject duplicate pending submissions, freeze key/payload and correlate the receipt; require the provider's replay contract |
| Recover a write after page reload | [RecoverableSave](../../examples/recoverable-save/RecoverableSave.eln) | Store the scoped intent before sending, query authoritative status, retry the same intent only after confirmed absence, acknowledge terminal outcomes |
| Reuse invocation guards | [ManagedSearch and ManagedSave](OPERATION-HELPER.md) | Opt into the local TS helper while keeping business state, lifecycle registration and write identity explicit |
| Retire work with a component | [Component disposal](COMPONENT-DISPOSAL.md) | Register synchronous cleanup, invalidate publication and request cooperative abort; do not expect an awaited cleanup or remote rollback |
| Preserve every accepted operation | No queue example is established | Define ordering, capacity/backpressure, failure recovery, ownership and persistence before implementing a queue |

A latest-response policy suppresses obsolete publication; it does not serialize
remote mutations. Single-flight admission is local to its owner and does not
deduplicate requests from other owners. Abort requests cancellation, while the
provider may already have committed or may ignore the signal. UI lifetime and
durable intent lifetime therefore belong to separate owners.

The recovery fixture requires one writer per storage slot. Provider ID, scope and
ledger epoch correlate a journal with retained results; they do not authenticate
an account. Replacing or truncating provider history needs an epoch policy before
an absent result can authorize a retry. See the
[full protocol and limitations](RECOVERY-JOURNAL.md).

## Implemented, experimental and proposed

| Status | Contract |
|---|---|
| Implemented in the current subset | Async actions, TS interoperability and one synchronous component disposal hook; pending/error and invocation guards remain explicit |
| Tested application examples | Latest-response reads, single-flight writes, same-key replay under a provider contract, and local HTTP/SQLite recovery across reload/restart |
| Optional local prototype | Typed operation helper with latest/single-flight policies; not a stable SDK or automatic migration target |
| Proposed language design | `action.pending`; no implementation is implied by the specification |
| Separate acceptance work | Authenticated persistent Task desk, coordination between writers/tabs, production retention/recovery, independent human authoring and equivalent-workload runtime measurement |

The helper's selected search view falls from 67 to 37 nonblank lines. Its save
view falls from 82 to 69 lines but grows by 145 source bytes. The shared pair
adds 449 gzip-9 bytes, and the helper itself adds 107 source lines. Publisher
setup, explicit state/lifetime wiring and generic configuration remain visible
DX costs. These mixed results support keeping it optional. Counts and delivery
sizes are not CPU/startup/GC measurements or proof of parity with another framework.
See the [retained comparison](OPERATION-HELPER.md).

## Acceptance before broader adoption

For a persistent application pilot, specify the storage/API owner, identity and
authentication, conflict behavior, retention/epoch rules and writer coordination
first. Connect one representative Task desk write through that explicit contract.
Keep fixtures and production adapters distinguishable in documentation and tests.

Verify the representative workflow with a lost acknowledgement, a definitive
rejection, an unavailable status service, reload/remount, later draft edits and
account/scope changes. Obsolete owners must not publish and unknown writes must
not silently become fresh intents. A multiwriter pilot additionally needs a
tested admission/coordination design; the current journal does not supply one.

Before promoting an operation abstraction, obtain independent authoring/recovery
feedback, assess the full source and configuration cost, and measure equivalent
workloads if making runtime claims. Use the existing read/write/recovery examples
as regressions. Promote only the layer whose contract and acceptance are proven;
successful provider recovery alone does not justify new Surface syntax.

The subsequent [Task desk storage contract](TASK-PERSISTENCE-CONTRACT.md)
defines versioned task edits and verifies an internal transactional model. It
does not yet connect the public application to persistent storage.

The subsequent [persistent editing pilot](PERSISTENT-TASK-DESK.md) connects one
versioned Task desk flow to journal/HTTP/SQLite and validates browser recovery
and conflict review. It remains separate from full persistent CRUD, authenticated
deployment and stable operation-API acceptance.

The later [persistent CRUD increment](TASK-CRUD.md) adds creation and versioned
logical deletion to that local variant. Its application-level recovery does not
promote the optional operation helper or implement action.pending. Authentication,
multiple-writer coordination and independent human acceptance stay separate.

## Evidence and closure

The initial evaluation covers pending/error, concurrency and obsolete responses,
component retirement, write identity, recovery, delivery cost and visible DX
friction. Its evidence is split by layer:

| Evidence | Scope |
|---|---|
| [Read study](ASYNC-OPERATIONS.md) | Controlled promises and browser search policy |
| [Disposal contract](COMPONENT-DISPOSAL.md) | Component ownership and cleanup across retirement paths |
| [Write study](ASYNC-WRITES.md) | Single-flight, snapshots, later drafts and explicit replay |
| [Helper study](OPERATION-HELPER.md) | Type/editor/browser behavior and selected source/delivery comparison |
| [Recovery study](RECOVERY-JOURNAL.md) | 961 tests in 75 candidate files, 167 public transfer cases, four browser phases and three provider starts |

This consolidation changes documentation only. It reuses those retained results
without claiming a new test run, native editor run or human acceptance. The
compiler/runtime/editor and examples remain unchanged. The broader
[application roadmap](ECOSYSTEM-ROADMAP.md) remains open under its own criteria.
