# Exclusive lists with native component trees

The private compiler now admits exclusive sequential lists whose rows contain
components with a proven native cleanup tree. This covers a native row wrapper,
a direct component root and native component trees spanning multiple modules.
Surface and both runtime sources are unchanged.

The compiler distinguishes cleanup shape from construction shape. The existing
`nativePlain` proof still decides detached versus fragment construction, keeping
the general generator's factory order and observable parent relationships. A
separate traversal follows component imports to prove native cleanup shape.
Eligible plans still independently validate expressions, props, events and slots.
Structural child bodies and unproven component graphs retain fallback.

The additional traversal rejects cycles, limits component depth and bounds its
work to 4096 node visits. The prior plain-native-row path remains unchanged.
Branching acyclic graphs cannot cause unbounded expansion of this new proof.

The runtime's existing geometry guard remains mandatory. It requires live row
frames, one row root each, expected parents and no foreign siblings. If that
guard fails, cleanup uses the existing individual row path. Eligible bulk clear
retires child listeners, tasks and subscriptions before replacing the parent's
children once. Retained row subtrees keep their contents and stop reacting.
Captured root snapshots still support cleanup when listener removal or DOM
replacement fails.

Validation includes 408 backend tests, with 21 focused controls for this
extension, and 71 unchanged public compatibility tests. Differential controls
cover lifecycle, every queued observation round, native factory/insertion/
cleanup order, preserved row subtrees, foreign siblings, combined failures,
retry, external dependency release, recursive graphs and branching graphs.
Three typechecked Edge fixtures compare the general baseline and candidate
through 48 mount/update/dispose cycles under the existing CSP and sandbox.

The local Svelte each implementation provided a contrast through its guarded
controlled-anchor clear path. Elnor retains its own geometry checks and its
cleanup-before-replacement order; no runtime code was copied or replaced.

This is an admission extension, not a new CPU measurement. Open collections
and child event boundaries remain separate work for the shared real keyed-list
application. The latest React/Svelte timings still describe the older v17
comparison revision.

The fresh five-workload audit still selects counter, form and localized updates
(3/5). The shared keyed list now passes the exclusive component-row cleanup
proof and reaches `collection-provenance-not-closed` for `model.rows`.
Composition retains its child-event boundary fallback. No admission guard was
removed for open collections or component events.

The [open list follow-up](REGION-BACKEND-OPEN-LISTS.md) subsequently admits
externally supplied arrays without a closed-shape assumption. Component events
remain a separate admission boundary.
