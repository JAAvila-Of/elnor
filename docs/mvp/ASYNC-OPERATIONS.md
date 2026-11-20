# Explicit asynchronous operations

This report records the initial host-owned study. The later
[component disposal increment](COMPONENT-DISPOSAL.md) adds `OwnedSearch.eln`,
which owns cancellation through `on dispose() => cancel()` and needs no host
lifetime signal. The original AsyncSearch example and its evidence remain here.

Surface actions use ordinary JavaScript promises and `action async name()`.
The runtime schedules reactive DOM work in microtasks. This does not provide
automatic loading/error state, latest-response selection, retries or cancellation.
`action.pending` in the design specification remains proposed.

The [AsyncSearch example](../../examples/async-search/AsyncSearch.eln) defines a
bounded application policy using the existing language and browser APIs. No
compiler, runtime or editor implementation changes are involved.

## Observed baseline

Compiled Surface tests establish that an unguarded action can:

- read changed state after an await rather than the value at invocation;
- overwrite a newer result when an older request completes last;
- clear a newer request's loading flag from an older invocation's finally;
- continue application effects after its component has been disposed.

These observations match the existing [runtime contract](../surface/MVP-CONTRACTS.md).
Removing DOM subscriptions is different from stopping an arbitrary promise or
undoing a remote operation.

## Search policy

| Concern | Explicit example behavior |
|---|---|
| Inputs | Capture the trimmed query before awaiting; later edits remain in the input |
| Concurrency | Every valid submit starts a request; a newer request replaces the previous one |
| Loading | Only the current invocation can clear pending in finally |
| Success/error | Only a current, non-aborted invocation updates result, emits loaded or sets an error |
| Cancel | Invalidate the invocation before aborting its controller; retain the previous result |
| Reset | Cancel, then clear query, result and validation/error state |
| Host disposal | The host aborts its lifetime controller before calling the mount disposer |
| Failure | Catch current errors locally; a later submit is an explicit retry |

Each invocation receives a composed signal through `AbortSignal.any`. A provider
that supports abort can stop its work. A provider that ignores it may keep running,
but version and signal checks discard its late success or failure. Cancellation
is not rollback of a server-side mutation and does not guarantee that a promise
will settle. This example is a read/search policy; writes may instead need
single-flight, queuing, idempotency or an explicit conflict protocol.

The example requires a modern environment with `AbortSignal.any`; the verified
targets are Node 24 and the headless Edge installation used by the retained run.
[The platform API](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static)
composes caller and invocation cancellation without an application listener registry.

## Host ownership and DX limits

The caller supplies a request function and an immutable lifetime signal for one
mount. An imperative integration owns the following order:

```js
const lifetime = new AbortController();
const stop = mount(target, {request, lifetime: lifetime.signal}, handlers);
const dispose = () => {
  lifetime.abort();
  stop();
};
```

Use a fresh controller on remount. Lifetime abort denotes terminal host disposal;
use the Cancel action for a live panel. Aborting the lifetime without unmounting
does not promise to restore the live panel's loading state. Calling only `stop()`
does not abort a request. Conditional child removal is not automatically wired to
this host signal. There is no new Surface lifecycle hook or operation object.
Function/signal props also cannot be supplied through JSON preview props.

DX friction is explicit: the example repeats a generation guard, controller,
try/catch/finally and host ownership. This is useful evidence for an operation
API, rather than a claim that application authors should repeat it indefinitely.
The next design increment should settle component-owned lifetime and the policy
differences between reads and writes before choosing syntax or automatic state.

## Svelte contrast

[Svelte's getAbortSignal](https://svelte.dev/docs/svelte/svelte#getAbortSignal)
belongs to a running derived or effect and aborts when that reactive owner reruns
or is destroyed. Its [await-expression documentation](https://svelte.dev/docs/svelte/await-expressions#Concurrency)
distinguishes compiler-coordinated expressions from ordinary sequential awaits
inside async functions. This suggests separating lifetime ownership from invocation
policy in Elnor; it does not justify applying reactive cancellation automatically
to every event action. The local reference was Svelte 5.57.3, `src/index-client.js`,
SHA256 `f4d801d17cc0b8e008d0685255f20eae1e18fc20d62bb982fc523b6a19600951`; the inspected files and
hashes are retained in `svelte-reference/`. No Svelte implementation was copied, and this study makes
no performance-parity claim.

## Evidence and boundaries

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build and 834/834 tests in 68 files; no skips/cancellations | full-989594bb99b04d64aa34fdfd0240a977 |
| Controlled browser | Enter, replacement, late completion, errors/retry, Cancel, reset and explicit host disposal | browser-ac837db18c564c6b9242090f5beaafc4 |
| Delivery | New standalone example: 6435 JS bytes, 2317 gzip-9 bytes; zero core-source changes | cost-195709cb26bc442f839c9ea184759734 |
| Public transfer | Check/build and 90/90 tests; exact source hashes | promotion-5770d7a4de9646afbe8285938cd9b726 |

Evidence, producers and before/candidate archives are retained under
`elnor/.elnor/mvp/async-operations/`. Delivery is a total for a new example,
not an equivalent-workload overhead comparison or a CPU measurement.

The tests use controlled promises rather than timing sleeps. The browser fixture
injects an in-memory provider under restrictive CSP; it does not prove HTTP,
storage persistence, server cancellation, multiuser conflict handling, every
browser, accessibility acceptance or human authoring acceptance. Existing native
editor evidence remains at the managed-reset revision; no new native editor run
is implied by this unchanged-core study.

The later [async write study](ASYNC-WRITES.md) exercises a different application
policy: single-flight, captured intent data, explicit same-key retry, and local
retirement without claiming remote rollback. It leaves the core unchanged and
uses a controlled in-memory provider rather than a persistent backend.

The later [local operation-helper experiment](OPERATION-HELPER.md) retains this
explicit implementation as a reference and adds ManagedSearch/ManagedSave. It
extracts invocation machinery into TypeScript while keeping the read/write policy,
lifecycle and provider responsibilities explicit. No stable core API is implied.
