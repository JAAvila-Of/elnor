# Component events in sequential regions

The private backend now compiles declared component events, parent action
handlers and event relays into per-instance namespaces. This preserves Surface
syntax and uses the existing TypeScript binder, indexed readers and dependency
collector. Events do not require a virtual DOM or a render traversal.

Generated namespace functions read the incoming handler packet at emission time.
Inherited handlers, getters, receiver identity, optional calls, payload evaluation
order and replacement handlers retain the general renderer's behavior. Child
handler packets check their owner before entering an action, and again after
evaluating arguments. Retired keyed children cannot update their former parent.
The current root emission can finish if its payload disposes the root.

The private compiler selects an `emits` runtime capability. Graphs without events
prune this support and avoid allocating handler packets. Owned children without
events retain their three-argument mounting path. Ordinary props named `emit`
remain ordinary props. Slots and unsupported callback expressions retain the
general renderer; an emit in an action must be its last nonempty statement.
The existing event grammar accepts one payload parameter; tuple payload tests
exercise evaluation order without changing that grammar.

Validation: 448 backend tests in three serial batches (222, 143, 83), including
21 event controls, and 71 unchanged public compatibility tests. Four typechecked
Edge fixtures compare both renderers across 64 mount/update/dispose cycles under
the existing CSP and sandbox. They cover direct handlers, a relay, an action
emission and keyed children with edited inputs. All completed Jobs verified the
existing CPU, memory and process bounds and cleaned up their process trees.
A preceding combined batch reached the 60-second supervisor limit; splitting
the complete suite preserved coverage and the original limits.

The real workload audit now selects four of five entries: counter, form,
localized updates and the shared keyed list. Composition still falls back
because its Card supplies named and default slots, even though its event relay
chain is now supported. Selection is not a CPU performance measurement. The
keyed private bundle is 29,244 bytes raw / 9,275 gzip, versus 8,064 / 3,288 for
the public general renderer in this audit; delivery remains an unresolved cost.

Svelte's local event implementation was inspected as a contrast for handler
receivers, reactive context boundaries and callback cleanup. Elnor keeps its
own component contract and region ownership checks. This iteration changes only
the private backend and its private compiler capability emission. Public core
sources remain unchanged. Fresh timings against React and Svelte must use this
revision and the full workload matrix before claiming a speed improvement.

The subsequent [full comparison](REGION-BACKEND-EVENT-COMPARISON.md) now records
that measurement. It exposes creation and cleanup gaps at 1,000 rows; broader
admission has not established a global CPU improvement.
