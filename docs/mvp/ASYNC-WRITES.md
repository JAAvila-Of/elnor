# Explicit asynchronous writes

[OwnedSave](../../examples/async-save/OwnedSave.eln) is a small application-policy
example using the existing async action and component-disposal contracts. It
adds no compiler/runtime/editor code, operation object or `action.pending` syntax.
The request types are ordinary [TypeScript](../../examples/async-save/contracts.ts).

## Invocation policy

The example permits one write request at a time per mounted instance. A second
submit while pending is ignored, including programmatic native submissions and
reentrant submissions during key creation. Setting pending before calling the
provider protects the action independently from the disabled submit button.
There is no queue and no replacement of the current write.

Each new intent captures the raw input, trimmed payload and a caller-issued
nonempty unique key. Its payload is frozen. Later edits stay in the draft and
do not change the pending intent. On a matching receipt, the example publishes
the saved snapshot and clears the draft only if its value still equals the
captured raw input. Newer text is preserved. The receipt must match both key and
payload. It is a correlation check, not authentication of a remote server.

| State | Submit | Draft reset | Visible outcome |
|---|---|---|---|
| Idle, no intent | Validate and allocate a new intent | Clear draft/error | No implicit write |
| Request pending | Ignore duplicate invocation | Refuse, even through form.reset() | Saving |
| Confirmation missing/invalid | Explicit retry of the same key and frozen payload | Refuse abandonment | Original attempted text and retry message |
| Confirmed | Release the old intent; later submit may allocate a new key | Clear only draft/error | Saved receipt text remains |
| Retired | No new work | No live UI | Abort locally; ignore late completion/rejection |

The model deliberately distinguishes a failed confirmation from proof that a
write was never applied. It retains the intent after a provider rejection or
mismatched receipt. A synchronous failure to allocate a key starts no request;
a later submit can try allocation again.

## Provider contract and controlled ledger

`persist(intent, signal)` must support replay of the same key and payload and
return the matching receipt. The caller supplies `createKey()` with uniqueness
within the provider's identity scope. Elnor does not implement that provider,
atomic key storage, authentication, expiration policy or durable deduplication.

The retained in-memory test ledger models this contract: the same key and data
return the original receipt; the same key with different data is rejected. One
test applies a mutation and then loses its confirmation. Explicit retry confirms
it with one ledger effect. Another applies after local abort, proving that the
disposal hook cannot promise remote rollback.

[HTTP semantics, RFC 9110 section 9.2.2](https://httpwg.org/specs/rfc9110.html#idempotent.methods)
distinguishes request idempotence from merely retrying after communication loss.
The example's replay rule is an explicit adapter requirement; the language does
not turn an arbitrary request or endpoint into an idempotent operation. No HTTP
transport is used in this pilot and retries are never automatic.

## Lifetime and DX limits

`on dispose() => retire()` aborts the active local controller and prevents late
saved events, including conditional child removal and ordinary `stop()`. The
provider may ignore abort or may already have applied the write. Remount creates
fresh local state: an unconfirmed intent is not persisted or recovered. A real
application needing recovery across navigation/reload must own a durable outbox
or status-reconciliation protocol outside this component.

The draft remains editable while saving. The attempted payload remains visible
when its confirmation is uncertain. That attempt must be confirmed before
starting a different write from the mounted instance. This is explicit DX
friction: the bounded adapter does not distinguish definitive business rejection
from unknown outcome or provide an abandon/reconcile flow. It is an example
policy for evaluation, not a universal write policy.

Pending/error flags, snapshot management and try/catch/finally remain explicit
application code. A replaceable search can use the earlier
[latest-response policy](ASYNC-OPERATIONS.md); a write needs its own concurrency
and identity contract. A queue would retain every accepted intent and needs
separate ordering, backpressure, failure and persistence rules. This example
drops duplicate pending invocations and implements no queue.

## Evidence and limits

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build; 890/890 tests in 70 files, no skips/cancellations | full-006c73b53da740a0948e8ff8b7a68b25 |
| Controlled browser | Native/programmatic submission, snapshots, lost acknowledgement/replay, reset guard, later edits, receipt correlation, disposal | browser-caf980348cc64b848a18ed4ec3c85ce0 |
| Delivery | New standalone OwnedSave: 7015 JS bytes/2467 gzip-9 bytes; no before/after workload comparison | cost-db2366fc16d74c13afd7cee59b57b724 |
| Public transfer | Check/build; 146/146 tests; exact source hashes | promotion-17c392cc6c05410facd5d5a32c0644f0 |

Evidence, producers and before/candidate archives are retained under
`elnor/.elnor/mvp/async-writes/`. All compiler/runtime/editor source hashes
match the preceding revision. Delivery measures a new example in its retained
build environment; it is not a CPU measurement or framework-performance ranking.

All operation ordering uses controlled promises, not timing sleeps. The browser
fixture uses an in-memory provider under restrictive CSP. It does not establish
HTTP/server behavior, persistent storage, concurrent server workers, multiuser
conflicts, exactly-once delivery, all browsers or independent human DX acceptance.
The compiler/runtime/editor are unchanged from the
[component disposal revision](COMPONENT-DISPOSAL.md), whose native editor evidence
remains separate; this study does not imply a new native editor run.

The later [local operation-helper experiment](OPERATION-HELPER.md) retains this
explicit implementation as a reference and adds ManagedSearch/ManagedSave. It
extracts invocation machinery into TypeScript while keeping the read/write policy,
lifecycle and provider responsibilities explicit. No stable core API is implied.

The later [persistent recovery fixture](RECOVERY-JOURNAL.md) addresses the local
attempt's lifetime separately: it writes a scoped journal before HTTP and queries
a SQLite-backed result after reload before authorizing same-key retry. Its single-
writer/fixture limits remain explicit; OwnedSave itself is unchanged.
