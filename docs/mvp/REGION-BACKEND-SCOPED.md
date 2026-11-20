# Region backend: opaque conditional scopes

This extends [sequential native mounting](REGION-BACKEND-SEQUENTIAL.md) in the
same private backend. Eligible opaque predicates and reads inside `if`, including
nested conditions and inputs, now execute through the indexed region frame.
Surface syntax, original checking and public compiler/runtime files are unchanged.

## Construction and scope instructions

Sequential instructions are assigned to their activation group. An `if` creates
its comment anchor before evaluating its predicate, then constructs a new body in
a document fragment. Only after the body completes are its captured nodes
inserted before the anchor. This retains Elnor's existing `when` behavior: opaque
body reads do not see their own detached nodes in the live host, and nested body
reads observe the correct outer construction phase.

Each scope records its controller, child lifetime, bindings, native listeners
and anchor cleanup in registration order. Teardown runs those records in reverse,
including nested child cleanup and anchor removal. The root still delegates DOM
ownership to `mountBoundary`; a branch owns the nodes captured from its fragment.
This includes injected fragment nodes while preserving the existing treatment
of external host siblings and relocated nodes.

A failed build or partial insertion releases staged and inserted content,
subscriptions and listeners while preserving the parent anchor and outside
siblings. Predicate errors clear an active part and retain the predicate's read
dependencies for retry. Body failures retire that body's dependencies. Disposal
during either phase prevents insertion or subsequent subscriptions.

Sequential predicate/binding tasks use actual-read tracking even when their
expression is statically simple. Opaque code may install a native property getter
that reads a cell; that getter read belongs to the binding reaction as it does in
the general renderer. Closed blueprint views retain their existing selection.
Sequential construction uses the general renderer's global document factory;
it does not silently switch factory realms based on the target's ownerDocument.

Svelte's `if.js` was inspected for the separation of branch selection and branch
lifetime. Elnor preserves its own detached construction, scope records and indexed
task model. No Svelte source was copied; transitions/hydration are not added here.

## Selection limits

Opaque `each` and component composition remain whole-root general fallback, as
do state/function escape cases and the opaque initializer/derived/key cases not
yet covered. Public `renderOwned` and mounts under an active general reaction
retain the original path. This is a bounded extension of optimization coverage,
not a restriction or annotation added to Surface.

## Evidence and remaining gates

Private revision `region-backend/review-v8` records the source snapshot, native
comparison, tests and lifetime controls. The first red run shows missing v7
conditional coverage. A migration run retains two old assertions that required
fallback; their replacements require sequential selection and preserve the
runtime behavior being checked. Failed attempts remain retained.

The final revision passes 164 backend tests (25 added here) and 71 unchanged
compatibility tests. Three scoped fixtures verify detached and nested observations,
queued rounds, construction/insertion/cleanup traces and 180 mixed-action batches
against the frozen renderer. Adversarial tests cover predicate/body errors,
partial registration/insertion, cleanup failures, disposal, injected nodes,
empty parts, factory context and native getter dependencies.

Twenty-six checked/built scenarios pass in sandboxed headless Edge across
262 recorded DOM stages and 416 lifecycle cycles: six sequential and twenty
blueprint cases. Twenty-five compare with the frozen baseline; the retained
keyed-range regression uses its explicitly recorded corrected general control.

Twenty-two GC mount controls and five additional lifetime controls pass with
27 disposers retained. The new scoped control confirms a hidden branch collects
while the root, old callback and disposer remain live; invoking the retired
callback does not change state for the next activation. These are lifetime
controls, not allocation-throughput or heap-size measurements.

All 33 expensive Jobs are serial: 31 pass and the two red/migration attempts
remain retained. Every Job verifies CPU10%, commit768MiB, 24 processes,
host-free4GiB, kill-on-owner-close and zero owned processes after cleanup. Node
heap is192MiB; browser wall/idle limits are45/12 seconds and offline60/60. No CPU
benchmark or full release gate ran.

Earlier sources remain frozen under `revisions/v1` through `revisions/v7`.
The public compiler/runtime hashes remain 70abd192/ae44708c. Opaque keyed and
composed mounting remain pending under the parent workstream. Full compiler/editor,
delivery, allocation, storage and broad CPU gates are still required. No new
timing, framework ranking or production-readiness result is established.

The subsequent [opaque row extension](REGION-BACKEND-OPAQUE-EACH.md) adds bounded
keyed row coverage and scheduler tickets for sequential task observation order.
The counts and limits above describe the retained v8 revision.
