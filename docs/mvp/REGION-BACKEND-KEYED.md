# Region backend: keyed identity and row lifetimes

This extends [conditional lifetimes](REGION-BACKEND-CONDITIONAL.md) on the same
private backend. It adds no Surface syntax or optimization flags. Public
compiler/runtime files remain unchanged; promotion and broad performance gates
are still pending.

## Integrated ownership and dependencies

An each node contributes an anchor, collection/key instructions and a row
blueprint group. Each live key owns an instance of that group: local indexed
state, tasks, nested conditional parts, listeners and a cancellable scheduler
job. State captured from the parent resolves to its owning frame; subscriptions
link directly to indexed tasks across frames. Updating an item under the same
key preserves the row instance and local input state. Removing and later
reinserting a key creates a fresh instance.

Rows use explicit DOM ranges, including conditional nodes added after initial
mount. Reconciliation reuses Elnor's existing longest-increasing-subsequence
ordering helper to retain already ordered ranges. It neither recreates retained
rows nor calls the general renderer for eligible row bodies. Staged row frames
walk their own sibling range instead of copying the entire parent's child list
for every move. Staged row frames
are owned before registration so parent disposal cancels in-flight work.
Duplicate keys and insertion/registration/cleanup failures reset both committed
and staged rows while preserving outside content. Retained callbacks cannot
mutate a later activation or parent state after row removal.

Svelte's each implementation was studied for key-to-instance lookup, reactive
item values, branch ownership and movement. Elnor uses its own frame/subscription
model and its existing ordering helper. No Svelte implementation was copied.

## Provenance boundary

The first eligible collections are closed array literals and state initialized
and replaced exclusively with such literals. Items are primitives or uniformly
shaped records with own primitive fields. Spreads, accessors, methods, nested
objects, unknown fields, opaque mutations and escaped collections retain the
general path. Types alone do not establish this proof. Keys and row reads use
proven primitive expressions; array values are not treated as primitive captions.
This bounds optimization eligibility rather than changing the language.

The current frame representation retains global plan indices; storage compaction,
delivery cost and large-program allocation behavior remain measurement gates.
This implementation does not establish a speed or memory advantage.

## Discovered general-renderer defect

Mixed reorder/show actions exposed an existing defect: a multi-node row's
initial node snapshot excludes conditional nodes inserted later. Reordering
could separate them from their row. The new range model preserves them.

The experimental general runtime is corrected too: dynamic multi-node rows use
live ranges, preserve that getter when creating row records and capture an
in-flight move for rollback. The test retains the frozen baseline's wrong result
and requires both corrected general rendering and region rendering to produce
the right grouped DOM. A first range-fix attempt still spread the getter into a
snapshot; the retained tests caught that and the final correction preserves it.

Most comparisons continue to use the unchanged baseline. Mixed conditional-row
batches use the corrected general runtime as their reference, explicitly. The
native `keyed-range-recovery` fixture records its corrected-runtime override and
hash; it is not reported as agreement with the defective frozen runtime.

## Validation and next gates

Private `region-backend/review-v5` records the final source snapshot, tests,
native browser cohorts, lifetime controls and all failed attempts. Earlier
reviewed sources remain frozen under `revisions/v1` through `revisions/v4`.

The final revision passes 92 backend tests (24 added here) and 71 unchanged
compatibility tests. Seventeen checked/built Surface scenarios pass in sandboxed
headless Edge: 160 recorded DOM stages and 272 lifecycle cycles. Sixteen use the
frozen baseline; the range-regression scenario uses the explicitly recorded
corrected general runtime. Mixed-action tests cover 180 batches across keyed
families; the conditional-row family uses the corrected general reference.

Thirteen GC controls verify live root/button nodes remain reachable and disposed
nodes collect with returned disposers retained. Two additional controls verify
hidden branch and removed row collection while the parent remains mounted,
including retained button/input callbacks. These are lifetime controls, not
allocation or heap-size measurements.

All 44 expensive Jobs are serial: 41 pass and three failed attempts are retained
(two test runs and one browser-control resolution error). The first Edge
regression control selected a runtime outside the published generation and thus
still bundled the frozen runtime. The corrected producer explicitly overrides
esbuild loading of the manifest-resolved runtime and records both hashes without
changing the published baseline build. The final cohort passes.

Every Job verifies CPU10%, commit768MiB, 24 processes, host-free4GiB,
kill-on-owner-close and zero owned processes after cleanup. Node heap is192MiB;
browser wall/idle limits are45/12 seconds and offline60/60. No CPU benchmark or
full release gate ran.

The [tracking report](REGION-BACKEND-TRACKING.md) integrates independent
variable-dependency collection and verifies its opaque boundary on the same
backend. This keyed revision is frozen under `revisions/v5`.

Opaque mounting integration remains pending, followed by full
compiler/editor, delivery, lifetime and multi-family performance gates. The
general-renderer range correction also needs its public promotion checks.
No new timing, React/Svelte ranking or production-readiness claim is made.
