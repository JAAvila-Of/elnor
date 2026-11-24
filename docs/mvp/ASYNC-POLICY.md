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
| Recover a write after page reload | The `durable` action group policy in [DurableSave](../../examples/durable-save/DurableSave.eln); the handwritten [RecoverableSave](../../examples/recoverable-save/RecoverableSave.eln) for comparison | Create one journal per account in the host and use a provider that implements the [intent protocol](DURABLE-INTENTS-DESIGN.md#protocol); handle the outcome after the member's `await`. See [durable intents](#durable-intents) |
| Reuse invocation guards | [ManagedSearch and ManagedSave](OPERATION-HELPER.md) | Opt into the local TS helper while keeping business state, lifecycle registration and write identity explicit |
| Retire work with a component | [Component disposal](COMPONENT-DISPOSAL.md) | Register synchronous cleanup, invalidate publication and request cooperative abort; do not expect an awaited cleanup or remote rollback |
| Preserve every accepted operation | The `queue` action group policy below | Choose its capacity; the queue keeps order, continues after a failure and drops waiting calls when the owner changes. It is not persistent; a write that must survive a reload needs a [durable group](#durable-intents) |

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

## Action groups

Surface action groups bind async actions to a component owner. The owner is
a prop, state, or calc of the component, an expression over them, or a
comma-separated list of such owners. An action joins the group with `async`
and uses ordinary `await` in its body.

The group declaration states the concurrency policy once for its members.
Keeping the request and follow-up logic in the action body preserves normal
TypeScript control flow, including `try`, `catch`, and `finally`. It also
keeps the action signature free of a callback parameter for applying results.

```elnor
action group dashboard(workspace) single-flight

action async refreshSummary() in dashboard {
  return await loadSummary(workspace.id);
}
```

The group exposes `pending`. Each member exposes readonly `pending`,
`status`, `result`, and `error` properties. Checking for
`status === "success"` gives access to the awaited return type in `result`.
An execution failure is `unknown` in `error`. Awaiting a member call yields
its return value on success and `undefined` if it was skipped, replaced,
retired, or failed. Starting a new invocation clears that member's previous
outcome.

- `single-flight` admits one member at a time for the current owner.
- `latest` admits the newest member and retires the previous invocation.
- `keep-latest` lets the running invocation finish, then runs only the last
  call made in the meantime, with that call's arguments. Each newer call
  replaces the waiting one, which resolves to `undefined`. A call from a new
  owner, or unmounting the component, drops the waiting call. This suits
  autosave: the last edit is always saved, without one request per edit.
- `queue` runs every accepted call in order, one at a time. Up to 100 calls
  may wait, or the number written after the policy, as in `queue 20`. When
  the queue is full, the new call resolves to `undefined` and the waiting
  calls are kept. A failure leaves its error on that member and the queue
  continues with the next call. A call from a new owner, or unmounting the
  component, drops the waiting calls. The queue lives in memory, so a page
  reload loses the waiting calls. A write that must survive a reload uses
  a [durable group](#durable-intents) instead.
- Any policy may add a timeout, from `1ms` to `3600s`, as in
  `latest timeout 10s` or `queue 20 timeout 30s`. An invocation that runs
  longer is retired, and its member reports a `TimeoutError` in `error`.
  The group is free at that moment, even if the awaited work never settles,
  so the next call starts at once.
- `latest` may add a debounce with the same durations, as in
  `latest debounce 300ms`. Each call still retires the previous invocation
  at once, then waits for the quiet period before running its body. A call
  during that wait retires the waiting invocation, whose body never runs.
  The member is `pending` while it waits, and a timeout starts counting when
  the body starts.

  ```elnor
  action group search(query) latest debounce 300ms timeout 10s
  ```
- Changing the owner or unmounting the component retires its invocation.
  A direct state owner gets a new revision on every change, including a
  return to its original value within the same turn. Props, calcs and
  expressions use the owner value observed at admission and resumption,
  compared with `Object.is`. A list changes when any of its elements
  changes, and each element follows the same rules.
- Objects are compared by identity. When a parent passes a new object with
  the same data, such as a customer reloaded from the server, an object owner
  retires the invocation. Use a key as the owner instead:

  ```elnor
  action group orders(customer.id) single-flight
  action group search(workspace.id, filter) latest
  ```

  The editor marks an object owner with the warning
  `ELN-ACTION-GROUP-OWNER-IDENTITY` and suggests its `id` when every object
  type of the owner has one. Direct state owners are exempt because they
  compare revisions. The warning does not block a check or a build.
- A retired invocation unwinds at its next ordinary resumption, as if that
  `await` had returned. Writes to Surface state bindings through the retired
  invocation or its Surface helpers are discarded.

### Stale writes outside a group

The editor warns with `ELN-ASYNC-STALE-WRITE` when an async action outside a
group writes component state after an `await`, including in its own
right-hand side, in `catch` and `finally`, and before an `await` inside a loop.
If the action runs again before that run ends, an older result can overwrite a
newer one. The fix is to join a group, or to check a live value before the
write, with no `await` between the check and the write:

- an enclosing `if` or `guard` whose condition reads a live value, or an
  earlier one after the `await` that reads one and returns or throws;
- for a `catch`, every `await` in its `try` block must reach it through a live
  check: a rejection through an inner `catch` that starts with one, and a
  completion past one;
- an entry lock, such as `if (saving) return; saving = true;` before the first
  `await`, keeps the action from overlapping itself, so the action is not
  reported.

Live values are component bindings, properties declared as getters and
`AbortSignal.aborted`. A property of captured data, such as `response.ok`, is
not live, and TypeScript can only mark other live properties by declaring them
as getters, for example `{ get current(): boolean }`. A check inside a `try`
block does not guard its `finally`, because `finally` also runs after that
check returns. Locals that shadow state and writes inside nested functions are not
reported. The warning does not block a check or a build.

The warning found two races in `examples/components/UserEditor.eln`: a second
click on Save started a second save, and selecting another user during a save
wrote the draft name to that user. The example now uses
`action group editing(selectedId) single-flight`, and its Save label reads
`save.pending`.

### Cancelling requests

Inside a member, the group's `signal` property is the `AbortSignal` of that
invocation. Pass it to `fetch` or any other API that accepts a signal.

```elnor
action group search(query) latest

action async find() in search {
  const response = await fetch(`/api/search?q=${query}`, {signal: search.signal});
  return await response.json();
}
```

The group aborts the signal when the invocation is retired: the owner
changes, a newer `latest` invocation starts, the component unmounts, or the
group timeout expires. A timeout aborts with a `TimeoutError` reason. The
abort happens as soon as the change is observed, before the awaited work
settles. A signal is never aborted after its invocation has finished.

The signal is created only when a member reads it. `signal` exists only in
members of the group; elsewhere TypeScript reports that the property does not
exist. A helper action that needs the signal receives it as an argument.

Aborting is a request to the provider. The server may already have applied a
write, so writes still need an idempotency key when a retry is possible. Do
not pass the signal to cleanup work: after retirement it is already aborted,
while cleanup must still complete.

### One action per row

To let each row of a list run its own action, declare the group in a row
component and use the row's key as the owner. Each instance then admits one
invocation of its own, rows run in parallel, and each row shows its own
`status`.

```elnor
component Row(item: Item, api: Api) {
  calc id = item.id;
  action group saving(id) single-flight

  action async save() in saving {
    return await api.save(id);
  }

  ui {
    li {
      p item.name
      button disabled=(saving.pending) "Save" => save()
    }
  }
}
```

The list component keeps no async action, so it stays in the region backend.
Each row pays the general renderer cost described below.

### Cleanup after retirement

Retirement never interrupts cleanup. Cleanup covers `finally` blocks, the
disposal of `using` and `await using` declarations, and the closing of a
`for await` iterator. An `await` inside cleanup resumes with its own result
even after the invocation is retired, so the cleanup runs to completion.

```elnor
action async exportReport() in reports {
  const session = await openExport(report.id);
  try {
    return await session.write(rows);
  } finally {
    await session.close();
  }
}
```

If the owner changes while `session.write` is pending, the action unwinds at
that `await` and still awaits `session.close()`. If the owner changes while
`session.close()` is pending, the close completes and the action then
unwinds. The `finally` block runs to its end, and its pending exit is
discarded. This applies whether the exit was a `break`, a `continue`, a
`return`, or an exception. Ordinary code after the cleanup does not run for a
retired invocation, and this includes an enclosing `catch`. A
`finally` block nested inside another cleanup runs to its end. The unwinding
then happens at the end of the outermost cleanup.

- `await using` disposes resources in reverse declaration order, together with
  `using` declarations in the same block. Each async disposer is awaited. A
  resource without `Symbol.asyncDispose` falls back to `Symbol.dispose`, and
  its disposal is still awaited once. A disposal failure that follows an
  earlier failure becomes a `SuppressedError`.
- `for await` accepts async iterables and sync iterables. Leaving the loop
  early with `break`, `return`, an exception, or retirement calls the
  iterator's `return` method and awaits it. The loop does not close an
  iterator that finished or whose `next` failed. If the loop body threw, a
  failure from `return` is ignored and the body error is kept. For a sync
  iterable, each value is awaited, and a rejected value closes the iterable.
- A `for await` loop written inside `finally` is cleanup too. Retirement does
  not stop it, so a loop over an unbounded stream in `finally` never lets the
  invocation finish. Bound such loops or move them out of `finally`.
- The cleanup of a retired invocation can overlap with the invocation that
  replaced it. Resources that need exclusive access must be serialized by
  the application.
- For the current invocation, a cleanup failure becomes the member `error`.
  For a retired invocation, the error goes to `reportError` instead. This
  covers a failure of the cleanup itself. It also covers an error that ordinary
  code threw before retirement and that was still pending when the cleanup
  finished. Where `reportError` does not exist, as in Node.js, the error is
  rethrown in a microtask and behaves like any other uncaught exception. The
  rejection of awaited work is not reported, even when it propagates through
  the cleanup. The member state is unchanged, and awaiting the retired call
  still yields `undefined`.

Without retirement, a managed body behaves like the same native async
function. A differential suite in `tests/action-group-differential.test.mjs`
runs each body both ways on Node.js 24 and compares the events and the
outcome. It covers `await` in nested expressions, `try`, `catch` and
`finally`, labels, `switch`, `for await`, and `await using`. TypeError
messages are engine specific, so the suite compares only their type.

A managed `await` costs more than a native one. In two local Node.js 24
measurements, one ordinary suspension took 113–121 ns, against 45–46 ns for a
native `await`. A cleanup suspension took 91–100 ns. The measurement
excludes the awaited work itself.

A component with an action group renders through the general renderer
instead of the region backend. A plain async action, without a group, runs in
a sequential region as a general action body, as described in
[general region actions](REGION-BACKEND-OPAQUE-ACTIONS.md). The two runs below
were measured before that change, when a plain async action also used the
general renderer. In one paired run of the
synthetic matrix, an unused group added to each of 24 repeated panels raised
mount CPU by 14–17% in both orders, against an identical-build variation of up
to 6%. Each mounted panel also retained about 2 KB more heap. Counter actions
rose by 2–12%. The form workload showed no increase beyond the
identical-build variation. Composition exceeded it once, with +20% for mount
in one order and −1% in the other. The run did not separate the cost of the
renderer from the cost of the group itself. The cost matters mostly for components repeated many times,
such as list rows.

A later run of the same matrix declared an equivalent async action in the
Elnor, React and Svelte versions of each stateful component. Svelte used at
most 10% less renderer CPU than Elnor in every operation and order but one:
form unmount, where it used 7% and 14% less. React used more CPU than Elnor in
every operation and order. In both runs, the async action
is declared but not called during measurement, and lists with an action per
row are not covered.

The build emits no source maps yet (CAP-10 in the
[application roadmap](ECOSYSTEM-ROADMAP.md)), so debugging happens in the
generated JavaScript. In a component with a group, each action body is a
generator, and every action keeps its name in stack traces, including the
`at async` frame of awaited work that failed. Stepping over a managed `await`
stops at the next statement of the action, as with a native `await`.
The generated code differs from the source in three ways. A managed `await`
appears as `yield`, and state and helper references go through the
invocation's `actionLease`. An awaited `finally` adds two steps: one records
the pending error and one is the checkpoint.

`await using` in a `for`, `for in`, or plain `for of` head receives
`ELN-ACTION-GROUP-SUSPENSION`. Declare the resource inside the loop body, or
use it in a `for await` head. The group does not undo the effects of an
external request. State protection applies to binding assignments, so
application code still owns in-place mutation and side effects outside
Surface.

## Durable intents

A `durable` group stores each call as an intent in a journal before anything
is sent. The journal sends it until the provider decides an outcome, and the
member's body resumes with that outcome, in the same page or in a later one
after a reload. The [design](DURABLE-INTENTS-DESIGN.md) gives the full rules
and the protocol. [DurableSave](../../examples/durable-save/README.md) is the
example, and it rewrites the handwritten
[RecoverableSave](../../examples/recoverable-save/RecoverableSave.eln).

The examples use the `TaskEdit`, `TaskRevision` and `TaskRejection` types of
the [design](DURABLE-INTENTS-DESIGN.md#the-member).

```elnor
action group editing(task.id) durable "task-edit"

action async save(edit: TaskEdit) in editing {
  const outcome = await tasks.update(edit);
  if (outcome.status === "applied") {
    revision = outcome.result.revision;
  } else if (outcome.status === "rejected") {
    message = outcome.reason.kind === "conflict" ? "Review the other change" : outcome.reason.message;
  }
}
```

### The group and its members

- The string after `durable` is the journal name. It is stored with every
  intent, so it must stay the same between releases while intents may exist.
  Two groups with the same name in one build are an error. The policy takes
  only the name, with no other policy word or timeout.
- The owner must be a string, a number or a list of them, because it is part
  of the stored identity. An object owner is an error.
- The first statement of a member awaits one call to a durable operation
  reached through a prop, as in `const outcome = await notes.save(edit);` or
  `await notes.save(edit);`. It is the only `await` in the body. A call to a
  durable operation anywhere else is an error, so a write through it cannot
  skip the journal.
- Parameters, the operation input and the operation result must be JSON types,
  because the journal stores them. The checks read declared types: `any`
  passes the owner and JSON checks and `{}` passes the JSON checks, so the
  compiler cannot check what those types hold.

The syntax is tested in
[durable-syntax.test.mjs](../../tests/durable-syntax.test.mjs) and the types
in [durable-types.test.mjs](../../tests/durable-types.test.mjs).

### Resuming the body

The resume point of a member is its `await`. The rest of the body runs when
the outcome is known. If the outcome arrives in a later page, the body runs in
that page with the member's parameters restored from the journal, and
`outcome.late` is true. Component state read after the `await` is the state of
the component that resumes. The editor does not mark the `await` as the resume
point yet, and the language service has no hover or inlay hint for it; that is
future work.

Awaiting a member call yields the body's return value when the outcome
arrives in the same page, and `undefined` when the call was refused or the
outcome was handled elsewhere. If the rest of the body throws, the error goes
to `reportError` once and the record is removed.

Each outcome has one consumer. When two mounted instances observe the same
record, one resumes the body and both show the status. If the page ends after
the body ran and before the record was removed, the next page resumes it again
with `late` true. The rest of the body can therefore run more than once per
intent, but not concurrently.

An owner change or an unmount does not retire an intent. It keeps being sent,
and a component that mounts the same group with the same owner observes it.

These rules are tested in
[durable-groups.test.mjs](../../tests/durable-groups.test.mjs), which mounts
compiled components on a fake DOM.

### Status

| Status | Meaning |
| --- | --- |
| `idle` | No intent of this member for the current owner |
| `pending` | Stored and not decided: being sent, or retrying after a failure |
| `success` | Applied; `result` holds the operation result |
| `rejected` | Rejected by the provider; `reason` holds the typed reason, such as a conflict |
| `unconfirmed` | The provider no longer keeps the result, but will not apply the intent again |
| `blocked` | The record cannot be sent safely; the host must review it |

There is no `error` status: a transport failure leaves the intent pending. The
group exposes `pending`, which is true only while the owner's intent is
pending; it is false for a blocked intent. A call while the owner has a
pending or blocked intent is refused, so a button that starts a member checks
both the group's `pending` and the member's status for `blocked`, as in
`disabled=(saving.pending || save.status === "blocked")`. The members of a
group share the owner, and a member's `status` is `idle` while another member
of the same group and owner has the pending or blocked intent, although
calling it is refused. In a group with several members, check the other
members' status for `blocked` too.

### The host

```ts
const journal = createIntentJournal({scope: account.id});
const transport = httpIntentTransport({baseUrl: "/api/intents", headers: () => session.headers()});
const tasks = {update: journal.operation<TaskEdit, TaskRevision, TaskRejection>("tasks.update", {version: 1, transport})};
journal.start();
```

- The journal keeps its records in IndexedDB, whose transactions are coherent
  across tabs, and tells other tabs of each change through a
  `BroadcastChannel`. localStorage is not offered: in headless Edge it was not
  coherent across tabs even when every read and write ran under one Web Lock.
  The `store` option takes another `IntentStore`, as the Node.js tests do.
- `scope` partitions the storage by account. Call `journal.stop()` before the
  session ends or changes, and create another journal for the next account.
  `await journal.forget()` removes every record of the scope in every tab,
  including writes that were never sent, for a host that must not leave them
  on the device after a logout.
  When the provider answers that the scope does not belong to the session, the
  intent stays pending, the journal stops sending and `onPaused` reports it.
- `await journal.outcomes()` gives the outcomes that no member consumed, each
  with `acknowledge()`. `await journal.blocked()` gives the blocked records,
  each with `export()` and `discard()`. Until a blocked record is discarded,
  its owner admits no new intent. In both, `owner` is the owner as JSON text,
  such as `"t1"` with its quotes for the owner `t1`. Both reject when the
  store cannot be read.
- The operation's name and version are stored with the intent, and a record
  is never sent with another input shape. A record of an older version than
  the journal's is blocked. A record of a newer version, or of an operation
  the journal does not know, stays pending and unsent, so that a tab running
  the newer release sends it; `blocked()` does not list it.
- Storage that fails at admission refuses the call and sends nothing.

The journal and the transport are tested in
[intents-journal.test.mjs](../../tests/intents-journal.test.mjs) and
[intents-http.test.mjs](../../tests/intents-http.test.mjs). The second one runs
against the [reference provider](../../examples/durable-save/provider_fixture.py),
which [durable-provider.test.mjs](../../tests/durable-provider.test.mjs) tests
on its own.

### Security

The journal stores inputs, parameters, owners, results and rejection reasons
in plain text in origin storage, readable by any script of the origin. Secrets must not be durable inputs; the
compiler cannot know which values are secret. A journal only reads and sends
intents of its scope, and the scope is not an authentication boundary.

### Cost and evidence

The compiler emits `durable-runtime.mjs` only for a graph with a durable group.
A graph without one emits no durable runtime and imports nothing from it. A
component with a durable group renders through the general renderer, like any
component with an action group.

DurableSave and its host take 66 nonblank lines, against 196 for the
handwritten view and client, below the limit of 98 that the design set. Its
delivery, with `intents.mjs` (27548 bytes) and `durable-runtime.mjs` (8260
bytes) counted, is 42050 JS bytes and 12944 gzip-9 bytes, summed over the
files. The handwritten version measured the same way on the same branch is
15133 bytes and 3398 gzip-9; the [recovery journal](RECOVERY-JOURNAL.md)
reported 11039 bytes and 3815 gzip-9 with an earlier compiler. Both exclude
`runtime.mjs`, and neither is minified. The two journal files are shared by
every durable component of an application. The
[example](../../examples/durable-save/README.md#comparison-with-the-handwritten-version)
lists what each version does.

The behavior above is covered by Node.js tests, with a lock manager and an
in-memory store passed by the test and, for components, a fake DOM. Node.js
has no IndexedDB, so there the IndexedDB store is only tested against a
minimal fake of it. The
[acceptance in headless Edge](DURABLE-INTENTS-DESIGN.md#results) against the
reference provider, including reloads, two tabs and an account change, passed
all 19 checks in 7 of 8 runs; the other run failed one check on a socket error
while loading a static file, outside the journal. A forced kill of the browser
with a pending intent was not tested.
