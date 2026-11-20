# Local typed operation prototype

`operation.ts` is an example-local helper, not a stable Elnor SDK API. It exposes
explicit latest and single-flight policies. `ManagedSearch.eln` uses latest with
Cancel; `ManagedSave.eln` uses single-flight and keeps its own immutable intent,
receipt validation and provider replay contract.

Use `policy: "single-flight", cancellable: true` for one active request with
Cancel, such as a remote validation check.
Pass a typed function as `work` to infer the operation's input and result and
call `run(input)`. Pass work to `run(input, work)` when the caller chooses it.

Both examples publish OperationState into a Surface state and register
`on dispose() => operation.dispose()`. Construction is lazy. Use the synchronous
success callback for owned state/event commits; an awaited run outcome does not
authorize later UI changes. Operational errors resolve typed error outcomes;
publish/success callback failures reject and are handled separately by the views.

```sh
npm run build:project -- examples/operations/ManagedSearch.eln --out .elnor/managed-search
npm run build:project -- examples/operations/ManagedSave.eln --out .elnor/managed-save
```

An imperative host injects request for search, or persist/createKey for save,
and calls ordinary stop() on retirement. Function props cannot be supplied through
JSON preview props. The write provider must implement its own replay/durability
contract; neither local abort nor this helper guarantees remote rollback.

See [API, error/lifetime contract, editor/browser evidence and measured tradeoffs](../../docs/mvp/OPERATION-HELPER.md).
The original [OwnedSearch](../async-search/OwnedSearch.eln) and
[OwnedSave](../async-save/OwnedSave.eln) remain available for comparison.
