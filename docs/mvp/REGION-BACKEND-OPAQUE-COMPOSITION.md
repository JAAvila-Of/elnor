# Region backend: sequential component frames

This extends [opaque keyed rows](REGION-BACKEND-OPAQUE-EACH.md) within the same
private backend. Eligible composed children now use indexed sequential frames;
their opaque expressions remain in their original modules. Surface syntax,
checking and the public compiler/runtime sources remain unchanged.

## Module and lifetime boundaries

Closed composition retains its existing inline blueprint plan. Sequential
composition instead emits a component instruction at the original construction
point. Required child modules export an internal owned-render helper with a
sequential descriptor. Transitive helpers are selected through the existing
canonical graph/module mapping; ordinary imports and public `renderOwned` keep
their original behavior. Expressions are not moved into the parent's lexical
scope, and native trees are not cloned under an opaque parent.

Each invocation creates a separate frame, state namespace, task collection and
native construction sequence. Props use enumerable read-only getters, preserving
deferred evaluation through nested components. The current child reaction records
the actual parent slots read by these getters, without creating a general effect
or a per-state bridge cell for that indexed read. Subscription handles carry
their owning group, so task indices from different module plans are not confused.

The parent records the child's disposer before child initialization. Its scope
cleanup runs that record in reverse registration order alongside local bindings,
listeners and structural controllers. Conditional parents own their captured
fragment nodes; the outer mount boundary owns the root DOM. Cancellation before
activation constructs nothing. Failed child builds release staged reactions and
listeners, while later parent invalidation can retry the same conditional anchor.

Sequential frames use the shared scheduler's task tickets. Closed plans retain
bare subscription handles and one job per frame. Original public-owner rendering
continues to use the general renderer.

Child calc initialization runs outside the parent's active collector, then its
own task subscribes to the proven fixed dependencies. Ordinary child state
initializers retain their temporary reads within the surrounding conditional
effect. These two initialization paths must not be conflated: an extra predicate
call is observable even when the final DOM text is unchanged.

## Bounded selection

Component prop expressions must have proven primitive provenance. Internal child
helpers may forward those primitive props lazily to further children. Calls,
callbacks, arrays and object-valued prop expressions retain whole-root fallback.
This prevents unknown code from receiving private collection references through
this optimization path.

Child initializers or derived initializers with unproven dynamic prop reads,
slots/events, recursive graphs, non-native root shapes and composed row bodies
remain fallback. Plain child state, local derived tasks, inputs and actions
reading proven primitive props are covered. No new annotation or language
restriction is imposed on applications that take the general route.

Svelte's component lifetime and prop getter mechanisms were read as contrast.
Elnor uses its existing module graph, detached conditional construction, indexed
slot collector and scheduler. No Svelte source was copied; hydration, transitions
and writable prop binding are outside this change.

## Validation and remaining gates

Private revision `region-backend/review-v11` retains source hashes, producers,
failed attempts and final controls:

- 222 backend tests pass, including 32 added here, together with 71 unchanged
  public compatibility tests.
- 33 checked/built scenarios pass in sandboxed headless Edge across 336 recorded
  DOM stages and 528 lifecycle cycles. Thirteen use sequential construction and
  twenty use blueprints. Thirty-two compare with the frozen renderer; the
  existing keyed-range regression keeps its explicitly corrected general control.
- 29 GC mount controls and seven additional lifetime controls pass with 36
  disposers retained. The new composition control verifies that hidden child
  DOM collects while the parent, old callback and disposer remain live; that
  callback cannot mutate the next child activation.

Tests compare native construction/insertion/cleanup traces and scheduler rounds,
including mixed parent/child batches. They cover deferred construction reads,
module identity, sibling isolation, nested forwarding, local derived tasks,
external cells, failure/retry, partial registration, cleanup errors, cancellation,
hygienic helper names, fallback guards and original public-owner rendering.
Retained failing attempts expose missing coverage, cross-plan task/group lookup
and a context-dependent caption incorrectly emitted as a module-level literal.

All 93 expensive Windows Jobs are serial: 86 pass; four failing test attempts and three supervisor-stopped Jobs
remain retained. Each verifies CPU10%, commit768MiB, 24 processes, host-free4GiB,
kill-on-owner-close and zero owned processes after cleanup. Node heap is192MiB;
browser wall/idle limits are45/12 seconds and offline60/60. Final producers are
`run-opaque-composition.py`, `run-native.py`, `run-regressions.py` and
`run-retention.py` in the private revision. The three supervisor stops were
host-memory-pressure safeguards, with no owned processes left behind. No limits
were increased. Builds use an inventory and nine serial batches of four cases
(the last has one), with checksummed manifests merged only after every case
completes. The final browser cohort retains seven completed cases and continues
the remaining 26 through `resume-native.py`, using the identical checked fixture,
source hashes and bundle manifest. Failed folders are not overwritten, and no
scenario is dropped.

Earlier revisions remain frozen under `revisions/v1` through `revisions/v10`
with their original seals. Public compiler/runtime hashes remain
70abd192/ae44708c. No CPU benchmark or full release gate ran. These checks establish
behavior and lifetime coverage, not CPU speed, heap-size, allocation throughput
or Svelte parity. Compiler/editor, emitted-code size, broad performance and
public-promotion gates remain open, together with the unsupported prop and row
cases above.

The retained calc isolation counterexample was discovered after the v10 gate.
It checks predicate call count, not only final text. Its correction preserves
ordinary state initializer dependencies and is exercised by both unit controls
and the new `opaque-composition-derived-scope` browser scenario.

The subsequent [stable composed row extension](REGION-BACKEND-COMPOSED-ROWS.md)
integrates eligible components inside a native row root. Counts and selection
limits above describe the retained v11 revision.
