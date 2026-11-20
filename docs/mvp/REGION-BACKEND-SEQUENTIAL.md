# Region backend: sequential native mounting for opaque captions

This extends [independent tracking](REGION-BACKEND-TRACKING.md) on the same
private compiler/runtime branch. A region can now select a sequential native
construction mode when a caption or button label contains an eligible opaque
read. It retains indexed storage, dependency tasks, the cell bridge and shared
scheduler. It does not route eligible captions back through the general renderer.

## Selection and construction

Closed views retain the blueprint mode. The additional mode accepts a single
native root with closed primitive state/initializers/actions and read expressions
that require ordinary imports, globals or root props. Captions and button labels
can invoke functions or getters whose result cannot be proven statically. Those
reads use independent dynamic tracking, including coercion and prop getters.

The compiler emits construction instructions alongside the existing region plan:
create/append a node, set a literal, initialize a binding, or register a listener.
Inputs preserve their original specialized construction and registration order.
The runtime executes these instructions against the real parent before moving
to later siblings. No pristine clone is constructed for this mode.

This preserves observations of partially mounted DOM: a caption sees earlier
nodes and itself, but not later siblings. Earlier button listeners already work
when a subsequent opaque read invokes them. Tests compare both construction and
listener cleanup order with the frozen general renderer, as well as each queued
observation round. Imports use the existing module planner and original-source
checking pipeline.

Opaque expression lowering reuses the compiler's symbol-aware TypeScript rewrite
and transpilation. A reserved context identifier avoids capturing escaped user
identifiers. The expression reads through indexed cell facades and the original
props object, preserving getter receivers and method calls. Initializer/action
proofs still prevent opaque code from writing or escaping indexed state.

## Ownership and failure

Sequential regions use the existing `mountBoundary` for DOM ownership. Nodes
injected into the host during initial mounting are included in its owned set;
later external siblings are not. A root relocated out of the host during initial
construction retains the same ownership behavior as the general renderer.
The region releases tasks/listeners; the boundary removes the captured DOM set.

Cleanup registrations retain construction order and execute in reverse. Cleanup
errors do not skip other listeners, subscriptions or boundary DOM removal.
Initial failures roll back injected nodes while preserving pre-existing host
nodes. Queued failures retain the dependencies needed for recovery without
discarding other work. Disposal during an opaque read stops later bindings.
Props, facades and private staging callbacks are released on teardown so a held
disposer does not retain mounting context objects.

## Explicit limits

This stage accepts read-only opaque captions in native trees. It excludes inline
functions/accessors, action-function references, assignments, updates, delete,
`arguments`, direct eval/Function references and other lexical/state escape
cases. Array state in this mode, opaque initializers/calcs, and opaque content
inside if/each/component composition retain whole-root general fallback.
These are selection limits, not new Surface language restrictions.

Public `renderOwned` remains the original path, including foreign owner
protocols. Mounts under an already active general reaction keep that path too.
No Surface annotations or optimization flags are added.

Svelte's native element visitor was inspected as a contrast for separating
construction, expressions and event instructions. Its template-based strategy
does not define Elnor's existing partial-mount observation contract. This
implementation uses Elnor's own plan, collector, rewrite and mount boundary;
no Svelte source was copied.

## Evidence and remaining work

Private revision `region-backend/review-v7` records the source snapshot, test
attempts, native browser cohort and lifetime controls. The first red tests
demonstrate missing v6 selection. A migration run retains the old expectation
that the DOM-observation counterexample must fall back; it was updated to require
sequential selection while preserving its exact observed `00Later` result.

The final revision passes 139 backend tests (25 new sequential tests) and 71
unchanged compatibility tests. Twenty-three checked/built Surface scenarios pass
in sandboxed headless Edge across 216 recorded DOM stages and 368 lifecycle
cycles. Three use sequential mode and twenty retain blueprint mode. Twenty-two
compare with the frozen baseline; the keyed-range regression continues using its
explicitly identified corrected general-runtime control.

Nineteen GC mount controls and four additional lifetime controls pass with
23 disposers retained. These cover hidden parts, removed rows with retained
callbacks, opaque/general-cell bridges and sequential props/context release.
This establishes those lifetime cases, not heap-size or allocation throughput.

All 30 expensive Jobs are serial: 28 pass and the two red/migration attempts
remain retained. Every Job verifies CPU10%, commit768MiB, 24 processes,
host-free4GiB, kill-on-owner-close and zero owned processes after cleanup. Node
heap is192MiB; browser wall/idle limits are45/12 seconds and offline60/60. No CPU
benchmark or full release gate ran.

Earlier reviewed sources are frozen under `revisions/v1` through `revisions/v6`.
The public compiler/runtime remain unchanged (70abd192/ae44708c). Opaque
structural/composed mounting remains pending under the parent workstream, along
with full compiler/editor, delivery, allocation, storage and CPU gates. No new
timing, framework ranking or production-readiness result is established.

The [conditional scope report](REGION-BACKEND-SCOPED.md) subsequently extends
this same mode to opaque predicates and nested `if` bodies. This native-tree
revision is frozen under `revisions/v7`; opaque keyed/composed mounting remains
pending.
