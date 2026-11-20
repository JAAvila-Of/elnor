# Local typed operation helper

This experiment extracts invocation machinery into the ordinary TypeScript
[operation module](../../examples/operations/operation.ts). It is an example-local
prototype, not a stable framework API, package export or new Surface syntax.
Compiler, runtime and editor implementation sources are unchanged.

## Explicit API and ownership

Inside a component, the tested construction uses the current one-line initializer:

```surface
state progress: OperationState = idleOperationState();
state operation = createOperation<string, string>({policy: "latest", publish: value => report(value), success: value => accept(value)});
on dispose() => operation.dispose()
```

`report` assigns the immutable snapshot to a Surface state. Ordinary mutable
properties inside a TypeScript object are not implicitly reactive in Surface;
the publication bridge is required. Construction publishes nothing and starts
no work, allowing its deferred callbacks to reference component actions safely.

When the operation always uses the same function, configure it once with
`work`. TypeScript infers the input and result from that function and checks
the success callback against both types. Call `run(input)` for this form.
An incompatible callback is highlighted on `success`. The overload details
show the expected type from `work` and the declared callback type.

```surface
state operation = (
  createOperation({
    policy: "single-flight",
    cancellable: true,
    work: request,
    publish: report,
    success: accept
  })
);

action search() { void operation.run(query).catch(callbackFailed); }
```

| Policy | When already busy | Exposed methods |
|---|---|---|
| latest | Retire/abort the previous invocation; only the current invocation can commit | run, cancel, dispose |
| single-flight | Resolve an ignored outcome without executing the new work function | run, dispose |
| single-flight with `cancellable: true` | Resolve an ignored outcome without executing the new work function | run, cancel, dispose |

`run` captures an input reference and invokes
`work(input, signal)` only after admission. The caller owns any snapshot, clone
or freezing requirement. The write example creates its immutable intent inside
accepted work, so ignored submissions do not allocate keys or alter an attempt.
Keep validation and its UI updates inside accepted work when duplicate
submissions should leave the form untouched.
Use `run(input, work)` when the caller chooses the work at submission time.

The helper publishes frozen readonly snapshots with status idle/pending/success/
error and the original unknown work error. Publishing pending happens before
work. Publication and success callbacks must be synchronous and return void or
undefined; directly async callbacks are rejected by the TypeScript contract.
Explicitly hiding a promise behind any/discarding it adds no ownership guarantee.

## Commit timing and errors

On success, the helper invokes `success(value, input)` synchronously while it
still owns the invocation. The single-flight busy interval includes this callback.
Only afterward can it publish terminal success and release ownership. Reentry
through publish, abort listeners, cancellation or success cannot let an older
completion clear a newer pending invocation. Disposal during success prevents a
later publication. Application callback effects already performed are not rolled
back.

Use this success callback for component state/event commits. A value observed
after awaiting run does not prove the component is still mounted or the invocation
still current; its outcome describes completed work, not a reusable commit token.

Work failures resolve a typed error outcome and publish error only while current.
Ignored/cancelled/superseded/disposed invocations resolve their distinct outcomes
without a stale success callback. Programmer errors in publish/success reject the
run promise; they are not recategorized as provider failure or retried. Combined
work/publication failures retain both errors. The examples attach a catch handler
that presents a separate callback-result message. A failing publisher can leave
its own last visible snapshot unchanged; no rollback of user callback code is
promised.

`cancel()` is available for latest and explicitly cancellable single-flight
operations. It aborts the current invocation, releases its slot for a retry,
and publishes idle if it still owns the state transition. Use the opt-in for
work such as remote form validation. `dispose()` is terminal, idempotent,
aborts active local work, releases the configured work and callback references
and publishes nothing. Use it for owner
retirement, not a live-view reset. A provider may ignore abort, and arbitrary
promises or remote mutations are not undone.

## Migrated examples and remaining friction

[ManagedSearch](../../examples/operations/ManagedSearch.eln) replaces its explicit
controller, generation and try/catch/finally with a latest operation. It keeps
query validation, business result state and native Clear/Cancel behavior explicit.

[ManagedSave](../../examples/operations/ManagedSave.eln) uses single-flight. It
still owns snapshot/key creation, the unconfirmed attempt, receipt correlation,
same-key retry and later-draft preservation. The helper supplies none of those
provider guarantees. Its lifecycle hook replaces the local retired/controller
machinery. The [provider/recovery limits](ASYNC-WRITES.md) remain unchanged.

DX costs remain visible: one progress state, one helper instance, a publisher
action, explicit lifecycle registration, callback-error handling, generic type
arguments and a long one-line initializer. The abstraction reduces repeated
invocation guards, rather than eliminating application policy or all state.
Original OwnedSearch/OwnedSave remain as reference implementations.
Both managed views retain the existing disposal/general-renderer fallback;
the module introduces no regional rendering capability.

Assessment: the selected search view drops from 67 to 37 nonblank lines and save from 82 to 69, but the save source grows by 145 bytes. The shared pair adds 449 gzip-9 bytes and the helper adds 107 source lines. This mixed result supports retaining an opt-in prototype, not replacing the original views or adopting a stable API.

## Contrast and scope

Svelte's [getAbortSignal](https://svelte.dev/docs/svelte/svelte#getAbortSignal)
belongs to an active reactive owner, while this helper receives explicit work
and lifetime calls. Svelte's [async-expression documentation](https://svelte.dev/docs/svelte/await-expressions#Concurrency)
also distinguishes compiler-coordinated expressions from ordinary async functions.
This prototype tests application-level policy through existing TS interoperability;
it does not copy a reactive async runtime or imply performance parity.

## Retained evidence

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build; 927/927 tests in 72 files, no skips/cancellations | full-73da0613d05b431c80ae39d670271807 |
| Controlled browser | Both policies, replay, later drafts, callback failure, cancellation, retirement and remount | browser-1b5516904837477e94953eba14021f23 |
| Native editor | 55 checks; actual helper bytes verified in scripts/operation-helper.ts, Workspace Trust intact | native-complete-0798d698835043e38fee62e40c1f0727 |
| Source/delivery | Four standalone examples plus paired graphs; table below | cost-fac1889a6f6146f1ba394f2a8acffba4 |
| Public transfer | Check/build; 133/133 tests; exact source hashes | promotion-a74a0aef6701437397e885f631986c38 |

| Example graph | JS bytes | gzip-9 bytes |
|---|---:|---:|
| OwnedSearch | 6380 | 2304 |
| ManagedSearch | 7464 | 2754 |
| OwnedSave | 7043 | 2475 |
| ManagedSave | 8378 | 2999 |
| OwnedPair | 10197 | 3079 |
| ManagedPair | 11160 | 3528 |

| Source | Nonblank lines | Bytes |
|---|---:|---:|
| OwnedSearch | 67 | 1655 |
| ManagedSearch | 37 | 1463 |
| OwnedSave | 82 | 2657 |
| ManagedSave | 69 | 2802 |
| operation | 107 | 4423 |

The source count includes the helper as its own module; reducing view code is
not a reduction of all project source. Paired graphs exercise sharing one module
between both views. Runtime CPU/startup/GC were not measured.

Evidence, producers and before/candidate/documentation archives are retained
under `elnor/.elnor/mvp/operation-helper/`. The native fixtures copy the exact
helper into the existing scripts namespace and verify its hash before execution.
The native run retains the existing 1 GiB, CPU/pids limits and owned-container
cleanup, with Workspace Trust enabled. It opens no desktop editor.

Delivery comparisons use selected examples and include added callback-error
handling and different source metadata paths. They are not an equivalent-workload
CPU benchmark. No automatic retries, queues, outbox, durable recovery, remote
rollback, exactly-once guarantee, action.pending implementation or stable SDK
commitment is introduced. Browser providers are controlled in-memory fixtures;
independent human authoring and real storage/API acceptance remain open.
