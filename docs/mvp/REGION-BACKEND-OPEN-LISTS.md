# Externally supplied arrays in sequential regions

The private region backend now admits collections such as `model.rows` without
assuming an element shape or a pure producer. Closed collections keep their
existing path. An array state whose assignments no longer prove a fixed shape
uses the open path instead of retaining an invalid closed-record assumption.

Collection, key and item expressions use the existing TypeScript binder and
dynamic dependency collector. Native captions can read unknown fields and
getters. Simple item/field references can feed component props and native
action arguments while retaining their live getter behavior. Whole item values
are not treated as proven primitives. Direct invocation of an item as a
function and the existing unsupported lexical constructs retain fallback.

The runtime still requires an array and rejects duplicate keys. It does not
copy, normalize or proxy the supplied data. Method receivers, iterator access,
key identity, error recovery and the language's existing state semantics remain
intact. This does not introduce deep mutation tracking or general iterable
support. A nonexclusive list no longer performs an extra `length` read that the
general renderer does not make.

A key context is local to one list execution, rather than allocated for each
element or cached on the region. It supplies the current item, indexed state
reads and props. The props reference is captured before user-controlled array
access, so disposal inside a getter cannot invalidate the current key's lexical
environment. Reconciliation checks disposal after iteration and after row
removal, before accessing nodes that cleanup may already have released.

Validation includes 427 backend tests, with 19 focused controls, and 71 unchanged
public compatibility tests. Controls cover keyed reuse, every queued round,
external key and field dependencies, method/prop receivers, heterogeneity,
invalid arrays, duplicate and throwing keys, retry, stale native events, Proxy
access order, disposal in empty-array iteration and parent disposal during row
removal. The complete suite runs in serial bounded Jobs with unchanged limits.

Five typechecked Edge fixtures compare the general baseline and candidate in
80 mount/update/dispose cycles under the existing CSP and sandbox. They cover
native rows, live record props and edited child inputs, an initially empty
array, method keys and row action arguments. The checked empty-array fixture
uses an imported TypeScript element type; the direct unit fixture retains raw
`[]` to test provenance downgrade. No parser or typechecking rules were relaxed.

The fresh real-workload audit still selects counter, form and localized updates
(3/5). The shared keyed-list app now passes external collection admission and,
like composition, reaches `child-slots-or-events-not-proven`. Component events
remain separate work. The general compiler/runtime and public core sources are
unchanged; the private region compiler/runtime contain this extension.

The local Svelte each implementation was used as a contrast for evaluating
collection values and keys during reconciliation. Elnor retains its own binder,
collector, ownership and cleanup order. The reduced number of key contexts is
an implementation fact, not a measured CPU improvement. New React/Svelte
timings remain pending until the real workload uses the new backend.
