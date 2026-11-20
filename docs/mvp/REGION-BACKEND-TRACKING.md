# Region backend: independent variable-dependency tracking

This extends [keyed lifetimes](REGION-BACKEND-KEYED.md) in the same private
backend. It integrates a real dependency collector rather than treating every
possible read in an expression as an active dependency. Public compiler/runtime
files, Surface syntax and user configuration remain unchanged.

## Integrated behavior

Proven primitive captions and conditional predicates can use ternary expressions,
`&&`, `||` and `??`. The compiler marks only those tasks as dynamically tracked.
Each execution replaces its indexed subscriptions with the slots actually read,
including reads through internal props and across parent/row frames. Inactive
branches no longer schedule the caption or cause it to repair unrelated native
text. Static tasks continue using compiler-selected dependency indices/masks.

Dynamic tasks also have an internal reaction bridge to ordinary runtime cells.
Cell notifications enqueue the owning region frame, not a second independently
scheduled effect. A task can combine indexed reads and external cell reads in
one job. Obsolete subscriptions are removed; reads made before a failure remain
subscribed for recovery. Self-invalidation remains pending for the next shared
round. Disposal removes both kinds of subscription and invalidates the task's
activation token.

The reverse bridge is lazy: when a general effect reads indexed state, the frame
creates an ordinary cell bridge only for that slot. Writes notify it as well as
indexed subscribers. This preserves action reads when a button is dispatched
from a general effect and lets nested general effects observe indexed state
without subscribing the parent region task. Normal untracked reads allocate no
such bridge. Slot/group disposal drops bridge references.

Tracking contexts restore in `finally`, including nested reactions and errors.
Nested general effects do not contaminate the outer task's cell dependencies;
nested region collectors keep indexed ownership separate. Static task execution
and static calc initialization suspend an enclosing collector. Child state
initialization retains the existing conditional/each dependency behavior.

Svelte's `update_reaction` was studied for dependency replacement, handling reads
before a throw, and restoring the previous reaction/context. Elnor implements
this through its existing cell collector and indexed frame subscriptions.
No Svelte source was copied.

## Opaque boundary remains explicit

The reaction bridge is exercised with opaque callback functions at the private
runtime-plan level, including coercion reads, failures, nested effects and
disposal during a read. This does **not** promote arbitrary Surface calls into
the cloned blueprint path. An unknown call may observe partially mounted DOM,
and eager blueprint construction would change that observation.

A retained Surface counterexample reads the DOM between an earlier caption and
a later sibling. It stays on the original sequential renderer and observes only
the earlier content. Ordinary opaque calls/imports/getters, dynamically tracked
state or calc initialization, and dynamic key expressions retain whole-root
fallback. Integrating arbitrary calls into the optimized mounting sequence is
still pending; this report does not claim universal opaque-expression support.

## Evidence and next gates

Private revision `region-backend/review-v6` records source identities, the tests,
native comparison, GC controls and serial contained Jobs. The initial test run
demonstrates missing compiler coverage in v5. A later observer probe incorrectly
fed a JavaScript module into the Surface-only fixture helper; the corrected probe
uses a global observing callback in valid Surface and retains the same partial
mounting assertion. Both failed runs remain recorded.

A further red test exposed the missing indexed-to-general direction: the
previous experimental path omitted the action read subscription during effect
dispatch. The lazy reverse bridge corrects both scalar and task-based frames.
That red run is also retained; no public source is changed by this correction.

The final revision passes 114 backend tests (22 added here) and 71 unchanged
compatibility tests. Twenty checked/built Surface scenarios pass in sandboxed
headless Edge across 200 recorded DOM stages and 320 lifecycle cycles. Nineteen
use the frozen baseline; the retained keyed-range regression uses its explicitly
identified corrected general-runtime control. A previous successful browser
cohort predates the reverse bridge and is retained separately, not pooled into
the final revision's counts.

Sixteen GC mount controls and three additional lifetime controls pass with
19 disposers retained. The extra controls cover a hidden branch, a removed row
with button/input callbacks retained, and an opaque reaction with its external
source and general-effect bridge still alive. Disposed DOM collects and later
source writes do not resurrect it. This establishes those lifetime cases, not
heap size or allocation throughput.

All 51 expensive Jobs are serial: 48 pass and three red/probe attempts are
retained. Every Job verifies CPU10%, commit768MiB, 24 processes, host-free4GiB,
kill-on-owner-close and zero owned processes after cleanup. Node heap is192MiB;
browser wall/idle limits are45/12 seconds and offline60/60. No CPU benchmark or
full release gate ran.

Earlier reviewed sources are frozen under `revisions/v1` through `revisions/v5`.
The general-renderer range correction from v5 remains experimental with its own
public promotion gate. Compiler/editor DX, delivery, allocation, large-program
frame storage, broad CPU comparisons and opaque mounting integration remain
required. No new speed, React/Svelte ranking or production-readiness result is
established.

The [sequential mounting report](REGION-BACKEND-SEQUENTIAL.md) subsequently
integrates eligible opaque captions in native trees while preserving their
partial-DOM observations. This tracking revision is frozen under `revisions/v6`;
opaque structural/composed mounting still requires further integration.
