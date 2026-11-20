# Region backend: pure derived dependencies

This extends [fixed composition](REGION-BACKEND-COMPOSITION.md) on the same
private compiler/runtime branch. It adds no Surface syntax or user flags and
does not promote the backend to production.

## Execution model

The compiler assigns indexed storage to state and calc values. It proves pure
primitive expressions, records direct dependency indices, and emits ordered
calc/binding tasks in component initialization and UI registration order.
Initializers execute before listeners and initial binding updates. Forward or
self references retain the original general renderer and its `ELN-INIT` errors.
Parent calcs can supply live child props and seed independent child state.

Regions containing calcs use one indexed pending-task set per region and ordered
subscriber arrays per value. They do not create a general effect and subscriber
Set for every calc or caption. The same region blueprint, listeners, lifetime,
rollback and scheduler integration serve both scalar and derived regions.

A state write updates state immediately and queues dependent tasks. A calc keeps
its cached value until its queued execution, matching Elnor's current behavior:
an action that changes state and then reads its calc sees the prior calc value.
Calc outputs notify dependents only when `Object.is` reports a change. Captured
task batches consume earlier invalidations; later ones remain pending for the
next shared flush. Subscriber order is maintained as tasks execute. Disposal
cancels the region and clears pending tasks, subscriptions, values and DOM refs.

The Svelte contrast is its lazy derived nodes, dependency tracking and output
equality/version checks in `reactivity/deriveds.js`. Elnor retains queued calc
semantics rather than adopting lazy reads. The implementation is independent;
no Svelte source was copied or executed for this change.

## Proof boundary

Pure arithmetic, comparisons and unary expressions over proven primitive state,
earlier calcs and internal props are eligible. Opaque calls/property access,
conditional expressions and derived graphs containing short-circuit expressions
retain general dynamic tracking. So do external props, slots, event callbacks,
recursive graphs and unsupported structure. Action writes target state, not
calcs. This is optimization coverage, not a restriction of the language.

The public `renderOwned` and mounts within an active tracking context keep the
general path. The existing parser, checker, editor projection and public
compiler/runtime files are unchanged.

## Validation and limits

The final revision passes 49 backend tests, including 19 new tests for chains,
diamonds, parent/child dependencies, cached action reads, unchanged outputs,
`NaN`, signed zero, initialization errors, disposal and recovery. Tests compare
each queued round with the original backend, including a 67-calc chain and
180 deterministic mixed-action batches across three scenarios. These comparisons
cover the tested closed graphs, not arbitrary external effect interleavings.

The first derived test run had two incorrect expected values in a diamond
fixture (the right branch multiplies by three). Both backends agreed; the
fixture and its dependent failure assertion were corrected. That failed run is
retained along with the two successful revisions. No implementation test was
removed or weakened.

The same 71 unchanged compatibility tests pass. Ten scenarios are checked/built
for both backends and match in sandboxed headless Edge across 68 recorded DOM
stages and 160 lifecycle cycles. Seven GC controls confirm mounted root/button
nodes stay live and become collectable after disposal, with all seven returned
disposers retained. These are lifetime controls, not heap-size measurements.

The final revision audit verifies all 16 serial Jobs (15 pass, one retained
fixture failure), the archived earlier revisions and unchanged public source
hashes. Expensive commands run under contained Windows Jobs: CPU10%,
commit768MiB, 24 processes, host-free4GiB, kill-on-owner-close, Node heap192MiB;
browser wall/idle45/12 seconds and offline60/60. No CPU benchmark, framework
ranking, full release gate or public adoption is claimed.

Evidence: private `region-backend/review-v3`. Previous revisions remain frozen
under `region-backend/revisions/v1` and `revisions/v2`; their seals describe those
archived sources. [Conditional lifetimes](REGION-BACKEND-CONDITIONAL.md) have
since been integrated in the same backend; this derived revision is frozen under
`revisions/v3`. Keyed lifetimes and independent opaque tracking remain pending
before broad performance measurement.
