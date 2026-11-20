# Region backend: architectural implementation plan

Status: the [first experimental vertical slice](REGION-BACKEND-FIRST-SLICE.md) is
implemented privately; later stages and promotion remain pending. Surface and
the supported public contracts remain requirements. This supersedes the working
approach of producing isolated runtime-helper candidates as the main performance
workstream. It does not supersede the evidence or rejection of earlier trials.

## Objective and architectural basis

Build a coherent Elnor compiler/runtime path whose unit is a DOM region: structure,
state dependencies, update instructions, events and disposal are planned together.
The first implementation must run a complete component lifecycle. A faster
helper, fewer callbacks or a standalone cloning probe is not that milestone.

The retained Svelte contrast identifies a combination of reusable DOM templates,
compiler-selected update units, different static/live prop representation,
derived nodes, event handling and effect/DOM lifetime ownership. The six generated
pairs in [the architecture study](RENDER-PLAN-ARCHITECTURE-STUDY.md) are the concrete
reference. Svelte does not establish a theoretical performance ceiling.

The proposed Elnor design combines a reusable DOM blueprint, compiler-proven
dependency masks and region-owned resources. A shared update unit should not
cause unrelated getter reads. The general path retains dynamic tracking and
current ownership semantics when the compiler cannot prove eligibility.

## Pipeline

```text
Surface source
  -> existing parser and original-source type checking
  -> component/region plan with source spans and explicit proof failures
  -> region blueprint + state slots + dependency masks + event instructions
  -> generated region renderer
  -> shared scheduler and one region lifetime

unknown or unsupported proof
  -> existing generator/runtime path for the entire component initially
```

There is no new application syntax, annotation, user optimization flag, VDOM,
compiler dependency install or Rust migration. Parser, checker, editor projection,
preview entry points and public mount/renderOwned interfaces stay in place.
Backend selection is an internal compilation decision. General rendering remains
available in the same build, with explicit reasons when optimization is declined.

## Region plan

The current private render plan is a starting point, not yet an optimizing IR.
Extend it with the following records before implementing the backend:

| Record | Required information |
|---|---|
| Structure | Fixed native tags/classes, dynamic node slots, root/anchor boundaries, source spans |
| State | Initializer proof, allowed writes, escaping references, indexed storage |
| Binding | Read dependencies, unknown calls/getters/coercions, evaluation order, DOM observation contract |
| Owner | Public/inherited versus internally created, exposure/override hazards, required registration protocol |
| Updates | Binding masks for each state slot, initial execution, dirty invalidations and follow-up writes |
| Resources | Native listeners, nested regions, dynamic reactions and disposal order/error obligations |
| Fallback | Machine-readable proof failure with its original-source location |

A type annotation does not prove purity, immutability or absence of a Proxy.
Direct property reads and opaque calls are not promoted to pure expressions.
Literal initialization does not prove that a state never changes. Calcs and
structural scopes require their own analysis rather than automatic inlining.

## First vertical slice

The initial backend covers closed scalar-state regions: static native structure,
literal state initialization, direct state text, native buttons and text inputs,
with bounded primitive-only action expressions. The acceptance fixtures are a
counter, multiple independent fields, a two-input editor and a static section.
The slice includes creation, updates, disposal, rollback and remounting.

The proof excludes runtime component imports, props, emitted events, slots,
calcs, conditionals, loops, unknown calls/property accesses, action parameters or
locals, and this/arguments/eval exposure initially. Unsupported programs continue
to compile through the current backend. These are optimization eligibility
conditions, not new Surface restrictions or a claimed final framework subset.

The prototype must recognize at least those complete fixtures before any CPU
study. It must not grow a series of independent caption/queue/cleanup experiments
while leaving the region path incomplete.

## Creation

The compiler emits a static blueprint plus references to dynamic node slots.
One factory creates a region instance; dynamic state is not installed on a shared
prototype. Cross-document behavior, cached prototype integrity and import without
document are explicit tests. Unknown tags, namespaces and unsupported content
models use the general backend.

A template strategy may embed only compiler-escaped static text, fixed tags and
classes. Runtime values are written through DOM properties, never interpolated
into HTML. The existing restrictive CSP is unchanged; no eval, Function or
security-policy relaxation is permitted. Template construction is validated as
part of the region path, including uncached work and delivery, not adopted from
an isolated clone benchmark.

Creation must stage rollback so errors preserve pre-existing host nodes and
release any resources already installed. Eager construction is not selected for
opaque reads that can observe partially built DOM; the earlier whole-tree
observability counterexample remains a mandatory exclusion/control.

## State and updates

For the proven closed slice, primitive state lives in region-indexed storage.
The compiler emits dependency masks and direct update instructions; dynamic
subscription Sets and effect/disposer closures are not created for each text.
The existing scheduler is the intended shared queue: a region is an update job,
using its established invalidation, failure and disposal behavior. Do not create
a second independent microtask scheduler without a demonstrated need.

A write marks affected state slots dirty, then enqueues the region once. Updates
visit only the bindings selected by those dirty slots. Dirty invalidations are
not cleared merely because the value returns to its previous value before flush.
For example, value=1 followed by value=0 must still consume the queued update as
the current runtime does. Multiword masks avoid introducing a new user-visible
state-count limit.

Dynamic text continues to compare with the actual native node value when its
binding runs. Unrelated bindings are not reevaluated solely because they share a
region. The getter-independence and external-text-repair controls remain in force.
Private-state selection is a proof boundary, not permission to weaken the public
text helper or group arbitrary user expressions.

Input updates preserve current native-value comparison, independent state and
the untouched-empty-input behavior documented by the native input counterexample.
State-writing actions keep TypeScript expression semantics; the initial proof
admits only the cases the lowering explicitly supports.

## Lifetime

One region owns its update job, node references, native listeners and child
resources. Static text is part of the blueprint and does not acquire an ordinary
per-caption reactive lifetime merely to be initialized. The first closed slice
does not expose an inherited owner or invoke user registration callbacks.

Public renderOwned with a foreign or overridden owner remains on the current
path. No new properties are read on an arbitrary owner and own is not silently
skipped on that path. Future internal component composition must carry owner
provenance explicitly; a runtime object shape or type name is not proof.

Disposal cancels the region job, releases listeners/resources in the required
order, removes its DOM and drops references. Cleanup failure must not prevent
remaining cleanup. Retained callbacks, pending jobs, repeated disposal, rollback
and remounts are part of the lifecycle tests. An early-release optimization that
only changes retention while preserving all creation work is not the endpoint.

## Extending the same backend

| Stage | Architectural extension |
|---|---|
| First vertical slice | Closed scalar-state regions, text, buttons, inputs and complete lifetime |
| Component composition | Internal child regions with explicit prop/owner provenance; general boundaries retain fallback |
| Derived state | Dependency ordering, initialization/error behavior and a proven update strategy |
| Conditional and keyed regions | Region tree, keyed identity/reuse, child insertion/removal and nested rollback |
| Opaque expressions | Independent tracking or general-path integration preserving observable reads and cleanup |

The extensions belong to one backend branch and one region model. Earlier
rejected clone/layout/props trials are constraints and controls; they are not
pieces to concatenate and assume additive gains. Do not claim that every dynamic
JavaScript program will collapse to the closed-region representation.

## Validation and promotion

1. Produce inspectable region plans and generated code for the complete first
   slice. Check fallback reasons on the existing examples/matrix/list sources.
2. Validate native behavior end to end, including invalidations that return to
   the old value, independent fields, input defaults, queued disposal, rollback,
   remounts, host-node preservation and the general public-owner path.
3. Extend the same backend to composition/derived/conditional/keyed cases needed
   for meaningful broad coverage. Keep existing semantic counterexamples.
4. Run required compiler/runtime/project checks and measure compilation,
   delivery, memory/lifetime and normal application CPU separately. Source maps
   and original-source diagnostics are part of DX, not optional cleanup.
5. Compare the completed path with Svelte/React on equivalent multi-family
   workloads using bounded serial Jobs and contemporaneous A/A controls. Retain
   cold/warm and normal-frame boundaries; no pooled ranking or invented margin.

No production adoption occurs merely because a source counter falls or one
benchmark improves. There is no universal percentage threshold in this proposal.
The decision must address broad behavior, DX/security, resource/delivery costs
and reproducible performance evidence for the implemented coverage.

## Current disposition

The initialization-callback retirement candidate is stopped and remains private.
Its evidence is retained; it is not the region backend. Public compiler/runtime
remain 70abd192/ae44708c. This document specifies the implementation target and
gates; the linked progress report records the first slice. No speedup or parity
result is established. The [composition report](REGION-BACKEND-COMPOSITION.md)
records the next integrated step on the same backend. The
[derived report](REGION-BACKEND-DERIVED.md) extends that same plan with ordered
pure calc tasks and equality-gated propagation. The
[conditional report](REGION-BACKEND-CONDITIONAL.md) adds activation groups,
anchors and branch lifetimes within that frame. The
[keyed report](REGION-BACKEND-KEYED.md) adds row frames, cross-frame dependencies
and DOM ranges, including a retained general-renderer regression. The
[tracking report](REGION-BACKEND-TRACKING.md) adds independent variable-read
collection and a runtime cell bridge while preserving the opaque mount boundary.
The [sequential report](REGION-BACKEND-SEQUENTIAL.md) adds ordered native
construction for eligible opaque captions within the same region engine.
The [scope report](REGION-BACKEND-SCOPED.md) extends those instructions to opaque
conditional predicates, fragment construction and nested branch lifetimes.
The [opaque row report](REGION-BACKEND-OPAQUE-EACH.md) extends the same indexed
model to plain native keyed rows, with sequential construction and shared
scheduler task tickets preserving observable microtask rounds.
The [sequential composition report](REGION-BACKEND-OPAQUE-COMPOSITION.md) adds
module-local child frames and deferred primitive prop getters, preserving the
parent scope's construction and cleanup order.
The [composed row report](REGION-BACKEND-COMPOSED-ROWS.md) extends those frames
to components inside stable native keyed rows, preserving fragment construction,
item updates and editable state during keyed movement.
The [component row report](REGION-BACKEND-COMPONENT-ROWS.md) transfers the actual
root from an owned child frame to its keyed row, retaining the general
generator's detached or fragment construction mode.
The [exclusive cleanup report](REGION-BACKEND-EXCLUSIVE.md) restores bulk removal
for sequential lists with plain native rows, guarded by actual DOM geometry and
error-recovery snapshots.
The [direct dispatch report](REGION-BACKEND-DISPATCH.md) adds compiler-emitted
scalar invalidation masks and static runtime entry selection, with real-workload
delivery and descriptive CPU comparisons against the previous private revision.
The [real form report](REGION-BACKEND-FORM.md) adds eager dynamically tracked
calc tasks using the existing expression rewriter. It increases real selection
coverage while recording the form's unresolved CPU and delivery costs.
The [runtime capability report](REGION-BACKEND-CAPABILITIES.md) removes named
context accessors from generated readers and selects emitted runtime helpers
from graph capabilities, reducing form delivery while retaining mixed CPU results.
The [action argument report](REGION-BACKEND-ACTION-ARGUMENTS.md) extends private
region admission to proven button arguments and plain action parameters,
preserving event-time evaluation and general-effect subscriptions.
The [external action expression report](REGION-BACKEND-OPAQUE-ACTIONS.md)
extends sequential actions to supported assignments with external RHS calls,
including parameter binding and an own-property fix for `__proto__` shorthand.
The [state initializer report](REGION-BACKEND-STATE-INITIALIZERS.md) admits
external initial values and prop snapshots without creating calc reactions,
with ownership checks after initializer calls.
The [action default report](REGION-BACKEND-ACTION-DEFAULTS.md) admits supported
parameter defaults with per-call evaluation, prior-parameter references and
conditional dependency tracking, without runtime changes.
The [component cleanup report](REGION-BACKEND-COMPONENT-CLEANUP.md) extends the
exclusive-list proof through native component trees while preserving detached/
fragment construction and the runtime's existing geometry checks.
The [open list report](REGION-BACKEND-OPEN-LISTS.md) admits externally supplied
arrays and dynamic key/item reads, preserves iterator behavior and closes
disposal paths before reconciliation accesses released nodes.
The [component event report](REGION-BACKEND-COMPONENT-EVENTS.md) adds owned
handlers and event relays, admitting the real keyed list while retaining the
slot fallback in composition and recording the remaining delivery cost.
The [frame task study](REGION-BACKEND-FRAME-TASKS.md) partitions task resources
by their existing owner. Its private candidate improves 1,000-row creation in
two cohorts but retains a swap regression, so global promotion remains pending.
The [layout ablation report](REGION-BACKEND-FRAME-LAYOUTS.md) records an
inconclusive swap attribution and rejects compiled frame-layout metadata after
a full comparison found mixed CPU results and larger bundles.
The [forwarding-row report](REGION-BACKEND-FORWARD-ROWS.md) replaces a proven
iteration-only frame with an item context while preserving the child frame.
Correctness and retention checks pass; append/clear improve in two cohorts,
but a selection regression and extra delivery bytes keep it experimental.
The [local-write report](REGION-BACKEND-LOCAL-WRITES.md) rejects a shared setter
after a full matrix and a separate repeated-selection contrast failed to show
a material gain. The [deferred reconciliation report](REGION-BACKEND-LAZY-RECONCILIATION.md)
instead postpones maps and placement work until keys diverge. Its stable-order
route improves repeated selection, while creation/append/swap tradeoffs keep the
revision private.
The [Map lookup ablation](REGION-BACKEND-MAP-LOOKUP.md) evaluates removing cached
row keys and sharing a pure helper. Correctness passes, but the full matrix
rejects that variant; the preceding private candidate is restored exactly.
The [shared-helper-only contrast](REGION-BACKEND-SHARED-CACHED-HELPER.md)
preserves cached keys and the helper body. Its full matrix does not establish a
useful gain, so it is also rejected and the helper-placement hypothesis closed.
