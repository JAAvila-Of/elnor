# Explicit component disposal

A component can declare one synchronous cleanup expression:

```surface
component OwnedSearch(request: (query: string, signal: AbortSignal) => Promise<string>) {
  state controller: AbortController | null = null;
  on dispose() => cancel()

  action cancel() {
    controller?.abort();
    controller = null;
  }

  ui {
    p "Search panel"
  }
}
```

This declaration belongs directly in the component body. It takes no payload
parameter and does not introduce a component event. Existing child events named
`dispose` remain separate. Unknown lifecycle names, arguments and a second hook
produce `ELN-LIFECYCLE-EVENT`. The expression must return `void` or `undefined`;
a directly returned promise or number receives a mapped TypeScript diagnostic.
Definition, rename, completion inside the expression and conservative formatting
use the existing TypeScript projection. There is no new lifecycle keyword snippet.

## Lifetime and cleanup

The compiler registers a deferred callback with the existing resource owner,
after state/calcs/actions are available and before rendering the UI. It does not
execute cleanup at registration. The callback reads current component state.
An installed hook executes once when its owner is retired:

- an ordinary public mount disposer;
- removal of a conditional child or a keyed row;
- removal of a rendered slot placement;
- rollback after a subsequent UI mount failure.

Keyed reordering preserves the instance and does not run its hook. Remounting
creates a fresh instance and cleanup. Cleanup follows the existing reverse
registration order; child hooks installed later run before their parent's hook.
Reentrant or repeated disposal remains idempotent. Throwing cleanups do not skip
other registered cleanup or DOM removal; multiple failures retain the existing
aggregate-error behavior.

Failures during initialization before registration have no new cleanup guarantee.
There is no asynchronous teardown barrier, watcher, mount hook or automatic
promise cancellation. The hook is synchronous; discarding a promise explicitly
or hiding it behind `any` does not make its work awaited or owned.

## Owned asynchronous search

[OwnedSearch](../../examples/async-search/OwnedSearch.eln) replaces the earlier
host lifetime prop with `on dispose() => cancel()`. The host calls ordinary
`stop()`. Conditional/keyed child removal now invokes the same local cancel
action without any host wrapper or injected lifetime signal.

The action still invalidates its generation before aborting the active controller.
Its pending/error state and latest-response checks remain explicit. A provider
that ignores abort may continue, but cannot commit or emit after retirement.
This is cooperative cancellation plus an application commit guard, not remote
rollback or termination of arbitrary promises.

| Operation kind | Invocation policy | Retirement policy |
|---|---|---|
| Replaceable read/search | Example uses latest-wins; snapshot inputs and reject obsolete completion/error/finally | Explicit cancel action in the disposal hook |
| Save or other mutation | Choose single-flight, queue or conflict/idempotency protocol at the application/API boundary | Cleanup may request abort; a remote mutation may already have committed |
| Subscription/resource | Register a synchronous release action | Run the hook once on retirement |

The hook solves resource lifetime. It does not choose a universal read/write
policy, implement `action.pending`, serialize actions or add automatic retries.
Writes and actual server behavior were not exercised by this increment.

DX improvement: the owned example needs no lifetime prop, `AbortSignal.any`, or
abort-before-stop wrapper. Remaining friction is the per-action generation,
controller and try/catch/finally code. Further operation ergonomics must preserve
the distinction between invocation policy and component lifetime.

## Architecture, fallback and Svelte contrast

Registration lowers to the existing `owner.own` mechanism. Both runtime source
files remain byte-identical. No new runtime export, registry, global listener,
controller per unrelated component or capability was introduced. A component
with a hook, including an expanded composed child, causes the current regional
selectors to exclude it and use general rendering. The specific rejection is
`component-disposal-not-proven` when the hook check is reached.
This explicit fallback is a current performance limit for affected graphs.

Svelte's [onDestroy](https://svelte.dev/docs/svelte/svelte#onDestroy) registers a
component-lifetime callback. Its [getAbortSignal](https://svelte.dev/docs/svelte/svelte#getAbortSignal)
instead belongs to an active reactive owner. Elnor uses its own existing resource
owner and an explicit Surface declaration, leaving operation policy in actions.
The pinned local source was Svelte 5.57.3 `src/index-client.js`, SHA256
`f4d801d17cc0b8e008d0685255f20eae1e18fc20d62bb982fc523b6a19600951`.
No Svelte implementation was copied; no CPU-parity claim follows from this work.

## Verification and limits

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build; 864/864 tests in 69 files, no skips/cancellations | full-036ff40c4eb747aebf131a3caeda99ce |
| Browser | Native Enter, keyed moves/isolated retirement, remount, reset, late results/errors, ordinary stop | browser-a0e3bd93c661487b98c770cf202b941f |
| Native editor | 50 checks; Docker/Xvfb with Workspace Trust intact | native-complete-adaf0dd407ef47a4b2494ecb0726f877 |
| Existing delivery | Nine graphs structurally equivalent with unchanged raw/gzip sizes | proof-18e9bf1aaa134decb82fb7a5133f2e83 |
| Example delivery | OwnedSearch: 6392 JS bytes/2306 gzip-9 bytes; host interface differs | example-cost-f883711ea0bd4040bcb8eb568ecb1e23 |
| Public transfer | Check/build; 160/160 tests with exact source hashes | promotion-200218763b2642a498a3915685b05881 |

Evidence and producers are retained under `elnor/.elnor/mvp/component-disposal/`.
The promotion retains before/candidate archives, original documentation and hashes.
The native run retains the existing 1 GiB memory, CPU/pids limits and owned-container
cleanup; it opens no desktop editor and bypasses no trust controls. Delivery
measurements are not CPU results or equivalent-host workload comparisons.

The browser provider is in-memory and deliberately ignores abort to expose late
completion behavior. This does not prove HTTP/server cancellation, persistence,
multiuser consistency, all browsers, or independent human authoring acceptance.
Automatic operation state, async cleanup, reactive watch effects and broader
lifecycle APIs remain outside this contract.

The later [async write study](ASYNC-WRITES.md) exercises a different application
policy: single-flight, captured intent data, explicit same-key retry, and local
retirement without claiming remote rollback. It leaves the core unchanged and
uses a controlled in-memory provider rather than a persistent backend.
