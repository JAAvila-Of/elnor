# Region backend: conditional lifetimes

This extends [pure derived dependencies](REGION-BACKEND-DERIVED.md) in the same
private region backend. Surface syntax, parser/checker, public compiler/runtime
and public owner protocols remain unchanged. This is architectural coverage,
not a performance result or production adoption.

## Integrated plan and lifetime

The compiler partitions the existing node blueprint, indexed state and ordered
tasks into activation groups. An `if` contributes a native comment anchor and a
condition task in its parent group. Its branch owns a separate reusable blueprint
forest, state slots, subscriptions, listeners and nested groups. Blueprint caches
remain document-scoped; mounted values and nodes never live on the prototype.

Only active groups initialize state and register tasks. Parent state survives
branch removal; child component state initializes again from current props when
the branch returns. A truthy-to-truthy condition preserves the mounted instance.
Multi-node and nested branches insert at the original anchor without replacing
outside siblings. They use the same region frame and shared scheduler job as
the existing derived path; the older duplicate task executor was removed.

Pending tasks carry their activation token. Deactivating a group cancels its
pending work, removes subscriptions/listeners, clears child values and DOM refs,
and recursively disposes nested groups. Retained callbacks check the old token
and cannot write a later activation. Listener resource records drop native-node
references during cleanup, including cleanup failures.

The existing `when` effect temporarily subscribes to state reads made by child
state initialization. The region preserves those dependencies until the next
condition execution; it does not assume the condition expression describes all
initial subscriptions. Ordered task batches retain the previous calc semantics.

Failed registration or partial insertion rolls back staged branch resources
while preserving the anchor and outside siblings. Cleanup attempts all owned
resources, preserves original causes and permits subsequent retry. Disposal
during activation stops further initialization and insertion.

## Svelte contrast and boundaries

Svelte's `if.js` and `branches.js` separate branch selection, anchor placement and
branch-effect lifetime. Elnor implements its own compiled activation groups and
tokens within its indexed region frame. No Svelte source was copied. Svelte
transitions, hydration and asynchronous batches are not features of this change.

Eligible conditions and contents use the established closed primitive proof.
Opaque conditions/calls, dynamic short-circuit dependency graphs, external props,
slots, unsupported structure and recursive graphs keep the whole-root general
path. Public `renderOwned` and mounts under active external tracking also keep
that path. No annotations or optimization flags are required from users.

## Evidence and remaining work

Private revision `region-backend/review-v4` records final tests, native browser
comparison, lifetime controls, source identities and bounded serial Jobs.
The final revision passes 68 backend tests (19 conditional tests) and 71
unchanged compatibility tests. Thirteen scenarios are checked and built for both
backends, then match across 110 recorded DOM stages and 208 lifecycle cycles in
sandboxed headless Edge. Conditional tests compare queued rounds and 180 mixed
action batches against the general renderer. These are coverage-specific
comparisons, not a proof for arbitrary external effect interleavings.

Ten GC controls retain returned disposers, confirm live nodes remain reachable,
and verify disposed root/button nodes collect. An additional control confirms a
hidden branch collects with the root mounted and its old callback and disposer
retained. This is lifetime evidence, not heap-size or throughput measurement.

All 21 expensive Jobs are serial and have verified cleanup: CPU10%,
commit768MiB, 24 processes, host-free4GiB and kill-on-owner-close. Node uses
heap192MiB; browser wall/idle limits are45/12 seconds and offline60/60. Nineteen
Jobs pass and two retained test attempts fail as described below; every Job
leaves zero owned processes after cleanup.

The first test run intentionally demonstrates that the previous revision rejects
the new cases. A later public-owner test incorrectly assumed immediate foreign
cleanup removes an unowned root container; it was corrected to compare both
renderers and enforce the same own-only protocol. Both failed runs are retained.

Earlier reviewed sources are frozen under `region-backend/revisions/v1`, `v2`
and `v3`; their original seals refer to those archives. The current public
compiler/runtime hashes remain 70abd192/ae44708c.

The [keyed report](REGION-BACKEND-KEYED.md) extends this same backend with row
instances and linked parent dependencies; this conditional revision is frozen
under `revisions/v4`. Independent opaque tracking remains pending.
Broad CPU, compilation, delivery and memory comparison follows
meaningful architectural coverage. No new Svelte/React parity claim is made.
