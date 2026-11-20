# Explicit async search

`OwnedSearch.eln` is the component-owned variant. It declares
`on dispose() => cancel()` and requires only the request prop; ordinary `stop()`
and conditional/keyed child removal invoke local cancellation. Read its
[lifetime contract and evidence](../../docs/mvp/COMPONENT-DISPOSAL.md).

Build the owned variant from the project root:

```sh
npm run build:project -- examples/async-search/OwnedSearch.eln --out .elnor/owned-search
```

The original `AsyncSearch.eln` below retains the earlier explicit-host policy.

`AsyncSearch.eln` is a small application-policy example using ordinary async
actions. Repeated Search submits replace the previous invocation. Current errors
are displayed, Cancel aborts the invocation, and Clear invalidates pending work
before resetting fields. Stale results are discarded even if the request
provider ignores abort.

The host must inject `(query, signal) => Promise<string>` and one immutable
`lifetime: AbortSignal` per mount. Before disposing, it must abort that lifetime
controller and then call the returned mount disposer. A fresh mount needs a fresh
controller. This ownership is explicit; conditional child removal is not wired
automatically. Use Cancel for live interaction, rather than ending the lifetime.

The example requires `AbortSignal.any`. Function/signal props cannot be passed
as JSON preview props. Build it from the project root with:

```sh
npm run build:project -- examples/async-search/AsyncSearch.eln --out .elnor/async-search
```

Import `mount` from that build's generated entry module in an imperative host,
provide the request and lifetime props, and register an optional `loaded` handler.
There is no real backend or persistence in the controlled test fixture.

See the [async policy, host ownership, tests and limits](../../docs/mvp/ASYNC-OPERATIONS.md).
The policy is suitable for replaceable reads; server writes need a separate
concurrency/idempotency contract. It adds no framework operation API.
