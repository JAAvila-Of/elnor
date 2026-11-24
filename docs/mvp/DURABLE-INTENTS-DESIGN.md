# Durable intents design

Status: the client half is implemented, covered by Node.js tests and accepted
in headless Edge (see [results](#results)); the server half waits for CAP-08.
[Durable intents](ASYNC-POLICY.md#durable-intents) describes the
implemented behavior and [DurableSave](../../examples/durable-save/README.md)
is the example.

## Intent

Part 2 of the [vision](../VISION.md#2-durable-intents) says that the UI records
intents instead of sending requests. An intent has an identity, survives a
reload or a crash, is retried without being applied twice and is reconciled
with the server's authoritative outcome.

Today an application gets this only by writing it by hand.
[RecoverableSave](../../examples/recoverable-save/RecoverableSave.eln) needs a
144-line client, a 64-line view and a provider that implements a key, status
and epoch protocol, all described in the
[recovery journal](RECOVERY-JOURNAL.md). The
[persistent Task desk](PERSISTENT-TASK-DESK.md) adds revisions and conflicts on
top. This design turns that pattern into a declared action group policy, so
that the owner, the policy, the lifetime and the destination of a write are
stated once and checked by the compiler.

## Goals

- A write that the person submitted is not lost by a reload, a browser crash,
  a lost reply or an unmount, and it is not applied twice.
- The component states this with one policy word on an action group, and
  handles the outcome in the same action body, after one ordinary `await`.
- The outcome reaches the component even when it arrives after a reload.
- Conflicts reach the component with the data needed to review them.
- The client half works with any backend that implements the protocol below,
  and the future server actions of CAP-08 implement the same protocol.
- The compiler rejects declarations that cannot be durable and calls to a
  durable operation that would skip the journal.

## Non-goals

- Work without a connection: several waiting intents per owner sent in order
  later. The design keeps it possible as an extension (see the last section).
- Local-first synchronization or replicated state.
- Automatic merging of conflicts.
- Exactly-once effects in a backend that does not implement the protocol.
- Coordination between several writers to the same record beyond what the
  provider's revision checks give.
- Encrypted or authenticated client storage.

## Anti-goals

The design fails, even if it works technically, if:

- a retry can apply a write twice in any tested path, including a lost reply,
  a concurrent retry and an expired receipt;
- a write the person submitted disappears without any outcome being reported
  to the component or to the host;
- an intent stored for one account is sent with another account's session;
- the authoring cost is close to the handwritten version, so nobody would use
  it;
- it changes the behavior or the cost of components that do not use it.

## Constraints

- Surface grammar changes need documented alternatives, DX cost and a reason.
- Public content is in English; no private material in the public repository.
- Every guarantee needs a test that would fail without it.
- Security controls are never disabled to make a test pass.
- The parity contract with Svelte must keep holding for components that do not
  use durable groups.

## Approaches

Scope. Three scopes were considered: an intent that is neither lost nor
duplicated, with one pending intent per owner; the same plus several queued
intents sent after a connection returns; and local-first replicated state. The
first one was chosen. It generalizes a protocol that already has browser and
provider evidence, and the second one can extend it with a queue.

Construction. The guarantee against duplicates can only be given where the
effect is applied, which is the server, and server actions do not exist yet in
the public repository.

1. A client policy with an open protocol. It works with any backend now, but
   Elnor can never check the server half.
2. End to end with server actions. The strongest guarantee, but blocked
   behind the CAP-08 design.
3. Protocol first. The design defines the protocol between both halves. The
   client policy is built first and tested against a reference provider that
   implements the protocol. The CAP-08 server half is specified to speak the
   same protocol, so the client does not change when it arrives.

The third approach was chosen. A TypeScript library without language support
was rejected: it would not be declarative and the compiler could not report
writes that should be durable.

## Authoring

### The group

```elnor
action group editing(task.id) durable "task-edit"
```

`durable` is a policy like `single-flight`. The string is the journal name, a
persisted identity like a table name. It must be unique in the application and
must not change between releases while intents may exist, so it is written out
instead of being derived from the component or file name, which a rename would
change silently. The compiler reports a duplicate journal name in one build.

The owner identifies the record the intent writes to. It must be a string, a
number or a list of them, because it is part of the stored identity; an object
owner is an error in a durable group instead of the identity warning of other
groups. `durable` cannot be combined with `latest`, `keep-latest`, `queue`,
`debounce` or `timeout` in this scope.

### The member

The examples use these types, and the component receives `task` and `tasks`
as props:

```ts
export type TaskEdit = {id: string; title: string; revision: number};
export type TaskRevision = {revision: number};
export type TaskRejection = {kind: "conflict"; current: TaskEdit} | {kind: "invalid"; message: string};
```

```elnor
action async save(edit: TaskEdit) in editing {
  const outcome = await tasks.update(edit);
  if (outcome.status === "applied") {
    if (!outcome.late) revision = outcome.result.revision;
    message = "Saved";
  } else if (outcome.status === "rejected") {
    if (outcome.reason.kind === "conflict") {
      current = outcome.reason.current;
      draft = edit;
      message = "Someone else changed this task. Review it before saving again.";
    } else {
      message = outcome.reason.message;
    }
  } else {
    message = "The save was received, but its result is no longer available.";
  }
}

action async remove() in editing {
  const outcome = await tasks.remove({id: task.id, revision});
  message = outcome.status === "applied" ? "Deleted" : "The task was not deleted.";
}
```

A durable member is an ordinary async action with two rules, both checked by
the compiler as errors:

- its first statement awaits one call to a durable operation, either as
  `const name = await operation(argument);` or as `await operation(argument);`;
- that is the only `await` in the body, including `for await` and
  `await using`.

The argument is evaluated once, when the intent is admitted, and is what the
journal stores. The callee must be a prop or a property path of a prop, such
as `tasks.update`, because the component evaluates it at mount to find the
journal before any call. A group may have several members; they share the
owner, so a save and a delete of the same task never run at once.

The rest of the body handles the outcome. It is synchronous and runs when the
outcome is known, with types inferred from the operation. If the outcome
arrives in a later page, the body resumes right after that `await`, with the
member's parameters restored from the journal, so the parameters must be JSON
values too. Locals declared before the `await` do not exist, because the call
is the first statement. Component state read after the `await` is the state
of the component that resumes, which after a reload may have been loaded
since. `outcome.late` is true when the intent was admitted by an earlier page
or another tab, so the body can avoid overwriting newer data. The `await` is
the point where a later page resumes. The editor does not mark it yet, and the
language service has no hover or inlay hint for it; that is future work.

Awaiting a member call yields the body's return value when the outcome
arrives in the same page, and `undefined` when the call was refused or the
outcome is handled elsewhere. If the rest of the body throws, the outcome
still counts as delivered, the record is removed and the error goes to
`reportError`, so a failing handler does not run again on every load.

This form keeps the decision already taken for action groups: the request and
its follow-up live in one ordinary body, without callbacks. Alternatives
considered:

- a member without a body, `=> tasks.update(edit)`, followed by a
  `then (outcome, input) { ... }` block: a `then` next to a call reads like
  `Promise.then`, which was the reason a managed `await` with `then` was
  rejected for groups, and `then` already means something else after `guard`;
- one `on applied(result, input) => markSaved(result)` handler per outcome:
  reuses the `on` form of `on dispose()`, but splits the request and its
  handling across several actions, and the earlier result block prototype
  found them easier to read together;
- a new `intent` declaration: clear, but a second kind of action with its own
  invocation, status and group rules duplicates what groups already define.

### Calling and observing

Calling `save(edit)` admits an intent if the owner has none pending, stores it
before anything is sent and returns a promise as described above. A call while
an intent for the same owner is pending or blocked is refused, as in
`single-flight`.

Calling a durable operation returns an inert request; only the first
statement of a durable member sends it. A call to a durable operation anywhere
else is an error, so a write through a durable operation cannot skip the
journal.

The member exposes:

| Status | Meaning |
| --- | --- |
| `idle` | No intent for the current owner |
| `pending` | Stored and not yet terminal: being sent, waiting for a connection or retrying |
| `success` | Applied; `result` holds the operation result |
| `rejected` | Definitively rejected; `reason` holds the typed reason, such as a conflict |
| `unconfirmed` | The provider no longer keeps the result, but guarantees that the intent will not be applied again |
| `blocked` | The local record cannot be used safely; the host must review it |

There is no `error` status: a transport failure does not end a durable intent.
The body resumes for `success`, `rejected` and `unconfirmed`, which are the
outcomes the provider decided. It does not resume for `blocked`, which is a
local condition handled by the host.

### Lifetime and delivery

The intent belongs to the journal, not to the component. Unlike other
policies, an owner change or an unmount does not retire it. The pending intent
keeps being reconciled, and a component that mounts the same group with the
same owner observes it.

Each terminal outcome has one consumer. When several mounted instances, in one
tab or several, observe the same record, the first one to take its Web Lock
resumes the body and removes the record under that lock; the others only show
its status. If the page ends after the body ran and before the removal, the
next page resumes it again with the same outcome on fresh state. The rest of
the body may therefore run more than once per intent, but never concurrently.

A terminal record never expires. It stays until a member consumes it or the
host acknowledges it, so no outcome disappears unreported.

A group watches and consumes only the terminal records of the members it
declares and of the operation versions its journal registered. A terminal
record of another member, for instance one that an older release of the
component admitted, does not stop the group's own later outcomes from being
consumed and resumed; it stays for `journal.outcomes()`. The same holds for
a terminal record of another operation version, including one that became
terminal by the rule below after a newer release blocked it: the body of one
release never resumes with the parameters and result of another.

A pending or blocked record of an undeclared member still holds the owner, so
the group admits no new intent for that owner meanwhile. A blocked one holds
it until the host discards it. A pending one holds it until the provider
decides it, which makes it terminal; the host cannot discard a pending record,
and the only call that removes one is `journal.forget()`, which removes every
record of the scope.

An answer that arrives for a record that another tab has meanwhile blocked
because its operation version changed (reason `version`) is still the
provider's decision. When it is an `applied`, `rejected` or `unavailable`
answer with a matching echo, the record becomes terminal with that outcome
instead of staying blocked.

Before the journal's first read the member reports `idle`. A call made then is
still checked against storage, so no write is lost because the status had not
loaded yet.

### Persisted identity

A record stores a format version, the journal name, the scope, the owner, the
member name, the operation name and version, the key, the epoch, the input
and, once known, the outcome. The journal name, member names and operation
names are persisted identities: renaming one leaves existing records without
a consumer, and the host sees them through `await journal.outcomes()` and
`await journal.blocked()`. The host declares an operation version, and a record
is never sent with a different input shape. A record whose version is lower
than the one the journal registered is blocked. A record whose version is
higher, or whose operation the journal does not know, was admitted by a newer
release in another tab during a rolling deploy: it stays pending and unsent in
this journal, so a tab running the newer release sends it, and until then its
owner admits no new intent. `blocked()` does not list it; it waits for a
release that knows it. A terminal record of an operation version other than
the registered one is not resumed by any member of this release: it does not
hold back the owner's outcomes and stays for `journal.outcomes()`.

## Host

The host creates one journal and the durable operations, and passes the
operations to components as props, like the current recovery client.

```ts
const journal = createIntentJournal({scope: account.id});
const transport = httpIntentTransport({baseUrl: "/api/intents"});
const tasks = {
  update: journal.operation<TaskEdit, TaskRevision, TaskRejection>("tasks.update", {version: 1, transport}),
  remove: journal.operation<{id: string; revision: number}, null, TaskRejection>("tasks.remove", {version: 1, transport}),
};
journal.start();
```

The journal, the operations and the transport come from one Elnor module.
The compiler recognizes durable operations by their type from that module.

- The journal keeps the records of a scope in IndexedDB. A write completes
  its transaction before the scope's Web Lock is released, so the next tab to
  take the lock reads it. Writes ask for strict durability, which asks the
  browser to flush the write to disk before it completes, so the journal
  stores an intent that way before the request is sent; a browser without
  that option uses its default. A forced crash of the browser or of the
  operating system with a pending intent has not been tested. Other tabs hear
  of each change through a `BroadcastChannel` and update what their components
  show. localStorage was rejected because it is not coherent across tabs. In
  one diagnostic in headless Edge, two tabs of one profile each made 200
  increments of one localStorage value, every one inside the same Web Lock,
  and three runs ended at 399, 398 and 347 instead of 400, while one tab alone
  always reached 400. A tab holding the lock could read a value from before
  the previous holder's write, and one run of the example resumed the same
  outcome in both tabs. The loss reported under Acceptance comes from a later
  test with other counts and runs, so the two sets of figures are not
  comparable.
- `scope` partitions the storage by account. The journal only reads and sends
  intents of its scope. The host calls `journal.stop()` before the session
  ends or changes; it aborts requests in flight, sends and admits nothing
  more, also when the journal never started, and closes the IndexedDB
  connection of a store the journal created by default. A store that the host
  passed in is the host's to close, through the optional `close()` of
  `IntentStore`; closing it keeps the subscriptions of journals that still
  run on it. A journal that is used after `stop()`,
  by a late answer, `outcomes()`, `blocked()` or a watch, opens the connection
  again. A login as another account creates another journal. A host that must
  not leave the scope's records on the device calls `await journal.forget()`,
  which removes them all, including writes that were never sent. It does not
  stop the journals of the same scope in other tabs: the host stops them, as
  it does its own.
- If the provider answers that the scope does not belong to the session, the
  record stays pending and the journal pauses that scope and reports it to the
  host. A valid intent is not blocked because the session changed under it.
- `start` reconciles every stored intent of the scope, whether or not a
  component for it is mounted, so a write is completed even if the person never
  returns to that screen. It runs again when the browser reports a connection
  and with bounded backoff after a failure. If the store cannot be read, for
  example an IndexedDB open that times out, it retries reconciliation with the
  same backoff, growing to `maxMs`, and keeps retrying every `maxMs` until
  `stop()`. A read for a watch that fails in a running journal is retried
  the same way, and the retried read shows the records to the components.
- `await journal.outcomes()` gives the terminal records that no member has
  consumed, for example to show a notification, and each one has
  `acknowledge()`. A rejected write is therefore never dropped without being
  visible.
- `await journal.blocked()` gives the blocked records with the reason,
  `export()` for their stored text and `discard()`. Discarding is the only way
  to remove a blocked record, and until then its owner admits no new intent.
- Every read-modify-write of a scope's records, admission included, runs
  under one Web Lock per scope, so two tabs cannot admit two intents for the
  same owner. Both tabs may reconcile the same intent; the protocol
  makes that safe.
- Inputs and results must be JSON values, checked through the operation's
  types, and are frozen at admission.

## Protocol

One request applies or replays an intent:

```
PUT {base}/{operation}/{key}
Intent-Scope: {scope}
Intent-Epoch: {epoch stamped on the intent}
Content-Type: application/json

{"input": ...}
```

The key is a random identifier created at admission. The provider must:

- apply a new key and record its terminal result in the same transaction as
  the effect, and serialize concurrent requests for the same key;
- answer a known key with the same input with the retained terminal result,
  without applying it again;
- answer a known key with different input as a key conflict, without applying;
- keep every key it ever received for the lifetime of its epoch. After its
  receipt retention window it may drop the result but must keep a marker, and
  answer that key as `unavailable`, never as new;
- return its epoch on every response, and refuse a request without an epoch
  or with one that does not match with `412` and its current epoch, without
  applying it. A provider that loses or restores history must change its
  epoch.

The epoch protects against a provider that lost its history. Every request
that can apply an intent therefore carries the epoch the intent was stamped
with:

- the journal keeps the last epoch it saw for its scope and stamps each intent
  with it at admission;
- a journal that has never seen one stamps the intent as unstamped. Its first
  request carries no epoch, so the provider refuses it with `412` and nothing is
  applied. The journal stamps the intent with the returned epoch and sends it
  again;
- a stamped intent is never restamped. If the provider's epoch differs, the
  record is blocked, because an earlier request may have been applied in the
  lost history.

A provider whose history was reset before it ever saw an intent stamped with
the old epoch also blocks that intent. That is rare and safe, and the host
resolves it through `await journal.blocked()`.

Responses carry `{"status": "applied", "result": ...}`,
`{"status": "rejected", "reason": ...}` or `{"status": "unavailable"}`, with
the scope, key and epoch echoed. The HTTP transport maps every answer to one
of three effects.

- It blocks the record when the answer may mean that the intent was applied
  and the journal cannot tell what happened: a `200`, `412` or `422` whose body
  is not JSON or does not echo the scope and key; a `200` or `422` that decides
  the intent but echoes another epoch; a `409` whose body is protocol JSON with
  `"status": "key-conflict"` and that echoes another scope, key or epoch
  (reason `mismatch`); a `409` with that body and the right echo, which is a
  key conflict; and a `412` for a stamped intent, which is an epoch mismatch.
  An unstamped intent takes the epoch of its `412` and is sent again.
- It pauses the scope, leaving the intent pending, on any `403`, whatever its
  body. A `403` comes from the provider, which refuses the session's account,
  or from something in front of it, such as a proxy, a firewall or an expired
  session, and applied nothing.
- It leaves the intent pending and sends it again, with backoff, after a
  network failure, a `404`, a `5xx`, a `409` whose body is not protocol JSON,
  a `412` without an epoch, a `200` or `422` with a status that does not
  decide the intent (even with another epoch), and any other status
  code. None of them is an answer from the protocol, so none can have applied
  it.

A protocol `409` is the only `409` that blocks: one from a proxy or an
endpoint outside the protocol retries, because it applied nothing.

The recovery journal used a status query before a retry. Here the replay is the
query: because the provider never treats a received key as new within an epoch,
sending the same key again cannot apply it twice, and a separate status request
adds a round trip without adding safety.

The provider authorizes each request with the current session. An intent whose
scope does not belong to that session's account is refused with `403` and a
`scope-refused` status, without applying it; the journal pauses the scope as
described in the host section.

### Server halves

The reference provider for tests extends the existing loopback SQLite fixture
of the recovery journal and the Task desk, which already implements most of
these rules. When CAP-08 server actions exist, declaring an action as durable
on the server generates the same endpoint inside the BFF, with the receipt
written in the handler's transaction. That half is specified here only to keep
the protocol stable; it is designed with CAP-08.

## Compiler and editor

- An object owner, a non-serializable parameter, input or result type, a
  first statement that is not the durable call, a second `await`, a combined
  policy, a callee that is not a prop path, or a duplicate journal name is an
  error.
- Calling a durable operation outside a durable member is an error. For
  writes through durable operations, the third guarantee of the vision, that a
  write meant to survive a reload is durable, holds by construction. A write
  through ordinary `fetch` is not recognized; finding writes that should be
  durable without a declared operation is outside this design.
- `ELN-ASYNC-STALE-WRITE` does not apply, because a durable member belongs to
  a group and admits one intent per owner. `ELN-UNOWNED-WORK` applies to the
  rest of the body as to any action.

A component with a durable group renders through the general renderer, like
any component with an action group.

## Security

- The journal stores inputs, parameters, owners, results and rejection reasons
  in plain text in origin storage, readable by any script of the origin. Secrets must not be durable inputs; the documentation
  says so, and the compiler cannot know.
- Intents are partitioned by scope and are only sent by a journal of that
  scope. Discarding a scope on logout loses its unsent writes, so the host
  decides it explicitly with `await journal.forget()`, which removes every
  record of the scope under its lock and tells the other tabs.
- Storage failure at admission refuses the call and sends nothing.
- Corrupt or foreign records block; they are never deleted or replaced
  silently.

## Acceptance

The design is accepted for implementation when its tests cover, in headless
Edge against the reference provider:

- a reply lost before and after commit, then a reload;
- a provider outage, then recovery;
- an unmount and an owner change while pending, and the outcome observed by a
  later mount;
- an outcome that no component observes, reported through the host;
- two tabs admitting and reconciling the same owner;
- concurrent replays of one key;
- an epoch change, including after a first request whose reply was lost, and
  an expired receipt;
- an account change with pending intents;
- a record whose operation version changed, and a blocked record discarded by
  the host;
- one outcome observed by two mounted instances and by two tabs;
- a conflict reviewed and saved again with a new key.

### Results

The acceptance ran in headless Edge 157 against the reference provider, on
the final code (commit `e99cdae`). Five consecutive contained runs passed all
24 checks each, with no page errors and no CSP violations. The checks cover
the list above and five more: a calc label that reflects a member's status; an
orphan outcome of an undeclared member that does not block the owner's next
outcome; an answer that arrives for a record another tab blocked by version; a
started tab that adopts a pending intent a closed tab left, without an online
event or a reload; and reconciliation after a failed first read, induced by
holding an IndexedDB connection that blocks a version upgrade past the 10 s
open bound.

Two tabs that each made 200 locked read-modify-writes of one counter reached
400 of 400 in all 20 counts through IndexedDB. The localStorage contrast lost
between 1 and 9 of 400 in a private profile and up to 76 with a profile on
disk. The 399, 398 and 347 given earlier come from the separate diagnostic
described under Host.

Admission latency was measured with 50 admissions per run and context, strict
durability and the CPU limited to 10%. With the profile on an NVMe SSD the
median was between 1.4 and 1.6 ms, the p95 between 1.7 and 17.3 ms and the
maximum 859 ms. In a private (in-memory) profile the median was between 0.8
and 1.0 ms. An earlier round, with the profile on a shared SATA hard disk,
gave a median of 50.6 to 65.5 ms and a p95 of 98.7 to 210.4 ms, so disk
speed dominates these figures.

A forced kill of the browser or of the operating system with a pending intent
has not been tested.

RecoverableSave rewritten with a durable group is the DX comparison. Its view
and host setup must take at most half of the 196 nonblank lines of the
handwritten client and view. The delivery size is reported with the journal
module counted. A component without a durable group must produce identical
output before and after.

## Extension to queued intents

`durable "name" queue 20` would keep several intents per owner, each with its
own key, sent in order. The open question for that extension is what a
rejection in the middle does to the later intents, which may depend on it;
the proposed default is to stop the queue and block it until the component
decides. Nothing in the first scope depends on that answer.

## Left to the builder

- The storage adapter for the first version, behind the same journal
  interface. It is IndexedDB; localStorage was rejected because it is not
  coherent across tabs under a Web Lock (see Host).
- Backoff limits, the local retention time for unobserved outcomes and the
  journal's record format.
- The exact HTTP paths and how the reference provider is shared by the tests.
- How the compiler splits a durable member at its `await` so that the rest of
  the body can run in a later page, reusing the existing managed action
  lowering where possible.
