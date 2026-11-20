# Shared native callback identity: primitive feasibility

**Not adopted. No Elnor core change or new framework ranking.** A shared callback
with WeakMap routing registers native listeners more slowly in both sizes and
orders of the decision cohort. Summed register/release CPU is mixed at the larger
size. The native listener counter still increases by 1,000 for each 1,000-target
variant. This does not justify a compiler/runtime prototype of this mechanism.

## Hypothesis and primary-source contrast

The question was whether reusing the JavaScript callback passed to addEventListener
could avoid per-handler native wrapper work while retaining one registration on
each element. It differs from prior emitter-object specialization, AbortController
cancellation and resource-layout changes. No event delegation is introduced.

The frozen Chromium reference is `f2700724f59fb554eb19a4f827b1d256e2a13286`. Its [JSEventListener factory](https://raw.githubusercontent.com/chromium/chromium/f2700724f59fb554eb19a4f827b1d256e2a13286/third_party/blink/renderer/bindings/core/v8/js_event_listener.h) allocates an object for a non-null listener, and its [callback-interface generator](https://raw.githubusercontent.com/chromium/chromium/f2700724f59fb554eb19a4f827b1d256e2a13286/third_party/blink/renderer/bindings/scripts/bind_gen/callback_interface.py) emits allocation in Create. These factories do not support assuming one native wrapper per shared JS function. This source revision is not established as the exact vendor source of the tested Edge binary; the counter observations below are separate empirical evidence, not an exact allocation census.

The local Svelte reference remains commit
0156c5fe38b53b72675e2a7f04535de015fdeed1 (5.57.3), with events.js retained by hash.
Its delegated path stores handlers on elements, while on/create_event wrap native
handlers to manage order relative to delegated events. This experiment retains
ordinary per-element native listeners and does not copy or evaluate that design.
Svelte was inspected only; no source, dependency or branch changes were made.

## Primitive and measurement boundary

A creates one distinct handler function per button. B retains those same distinct
handlers in a WeakMap keyed by button and registers one shared dispatcher function
on every button. The dispatcher looks up this and invokes the row handler with
the native receiver/event via Reflect.apply. Both variants physically remove one
native listener per target. B additionally deletes its map entry. There are no
node expando properties, Elnor effects, owners, reactive cells, reconciliation,
DOM insertion/layout or framework mounting in the measured windows.

Each phase operates on four detached groups of 100 or 1,000 targets: 400 or
4,000 listeners per measured register/release phase. Nodes and fresh row-handler
functions are prepared outside each transaction's timing, equally in both
variants. The shared map/dispatcher are module-level. Map set/delete happen inside
B's timed phases. Original row handlers are still necessary, so this design does
not eliminate their construction; it excludes construction from both windows.
Verification clicks and forced GC occur outside the timing windows.

Two warmup rounds precede seven measured rounds per label. A/B transaction order
alternates each round and AB/BA seed order is reversed in a separate fresh browser
case. A/A uses the unique-handler variant twice. Each case uses one active,
visible page in a fresh sandboxed headless Edge 157.0.4341.42 with GPU disabled.
Accessibility is enabled; no rendering or AX categories are subtracted.

Tables use renderer **ThreadTime milliseconds**, not TaskDuration, elapsed user
latency or pure native self time. Each phase has its own CDP window including
protocol/evaluation overhead. Sum is the median of each round's register plus
release values, not the sum of the two phase medians. Raw TaskDuration and
ScriptDuration are retained separately. Neither A/A variation nor warmup values
are subtracted. No significance test or equivalence margin is claimed.

## Revisions and decision cohort

V1 uses a per-target helper with a mode branch. All nine cases pass, but that
unnecessary per-target branch and its JIT feedback can confound the primitive
comparison. Before the second cohort, separate register/release loops and one
variant choice per batch were declared. V2 is the decision cohort; V1 remains
exploratory. Sources, raw cases and both tables remain separate, with no pooled
medians or further repetition to search for favorable values. Native events,
metadata work, sizes, warmups, rounds, GC placement and limits are unchanged.

### V2: separate native loops

| Listeners per phase | Phase | A/A AB: A → B ms | A/A BA: A → B ms | Routed AB: A → B ms | Routed BA: A → B ms |
|---:|---|---|---|---|---|
| 400 | register | 0.331 → 0.317 (-4.2%) | 0.379 → 0.387 (+2.1%) | 0.377 → 0.482 (+27.9%) | 0.373 → 0.442 (+18.5%) |
| 400 | release | 0.338 → 0.291 (-13.9%) | 0.344 → 0.348 (+1.2%) | 0.436 → 0.403 (-7.6%) | 0.354 → 0.495 (+39.8%) |
| 400 | sum | 0.718 → 0.634 (-11.7%) | 0.713 → 0.705 (-1.1%) | 0.867 → 0.937 (+8.1%) | 0.727 → 0.913 (+25.6%) |
| 4000 | register | 0.697 → 0.715 (+2.6%) | 0.726 → 0.787 (+8.4%) | 0.853 → 0.973 (+14.1%) | 0.793 → 1.055 (+33.0%) |
| 4000 | release | 0.543 → 0.563 (+3.7%) | 0.562 → 0.560 (-0.4%) | 1.393 → 0.964 (-30.8%) | 0.961 → 0.909 (-5.4%) |
| 4000 | sum | 1.242 → 1.288 (+3.7%) | 1.320 → 1.332 (+0.9%) | 2.216 → 2.039 (-8.0%) | 1.841 → 1.916 (+4.1%) |

At 4,000 listeners, B's registration medians are 14.1%/33.0% higher; summed-phase
medians are -8.0%/+4.1%. At 400 listeners, registration and summed phases are
higher in both orders. Individual release results are not interpreted as a
whole-application improvement. The optimistic primitive omits production guard,
owner integration, click-routing CPU and application rendering costs.

### V1: exploratory per-target helper

| Listeners per phase | Phase | A/A AB: A → B ms | A/A BA: A → B ms | Routed AB: A → B ms | Routed BA: A → B ms |
|---:|---|---|---|---|---|
| 400 | register | 0.286 → 0.287 (+0.3%) | 0.270 → 0.260 (-3.7%) | 0.303 → 0.330 (+8.9%) | 0.321 → 0.350 (+9.0%) |
| 400 | release | 0.281 → 0.253 (-10.0%) | 0.331 → 0.269 (-18.7%) | 0.267 → 0.302 (+13.1%) | 0.270 → 0.329 (+21.9%) |
| 400 | sum | 0.554 → 0.533 (-3.8%) | 0.629 → 0.518 (-17.6%) | 0.604 → 0.632 (+4.6%) | 0.591 → 0.653 (+10.5%) |
| 4000 | register | 0.799 → 0.766 (-4.1%) | 0.837 → 0.785 (-6.2%) | 0.803 → 0.949 (+18.2%) | 0.827 → 1.070 (+29.4%) |
| 4000 | release | 0.635 → 0.623 (-1.9%) | 0.650 → 0.629 (-3.2%) | 1.224 → 0.847 (-30.8%) | 0.644 → 0.952 (+47.8%) |
| 4000 | sum | 1.496 → 1.416 (-5.3%) | 1.534 → 1.419 (-7.5%) | 2.046 → 1.843 (-9.9%) | 1.418 → 1.992 (+40.5%) |

## Native behavior and retention

Both cohorts pass eight native checks per variant: capture/bubble ordering,
stopPropagation, stopImmediatePropagation, nested dispatch, self-removal,
independent-target removal, disabled clicks and shadow-root receiver/target.
Timing transactions also verify every target's handler/event identity after
registration and no delivery after removal. These are synthetic native events
and element.click checks, not trusted-input or all-browser coverage.

The native-counter probe holds 1,000 detached targets per variant. It collects
garbage outside measurement before reading counters. Values are the CDP
Memory.getDOMCounters jsEventListeners counter, not allocated bytes or a census
of every wrapper type:

| Cohort | Baseline | Unique group active | Unique + shared groups active | Both removed |
|---|---:|---:|---:|---:|
| v1-exploratory | 13 | 1013 | 2013 | 13 |
| v2-branch-once | 13 | 1013 | 2013 | 13 |

The increment is 1,000 for both variants, and counts return to their own baseline
after removal/collection. Sharing function identity did not reduce this counter.

Four WeakRef probes inspect handler/payload/node reachability, with eight explicit
CDP collections at each inspection boundary. Active resources are positive
controls. After removal, unique and correctly cleaned shared handlers/payloads
are released even while their node remains deliberately held. A deliberately
leaky shared-map control retains the handler/payload while the node is held;
deleting that entry releases them. An unheld shared target is released too.
These probes detect the need for map cleanup; they do not establish byte savings
or a universal GC schedule.

A separate observation exposes a compatibility boundary: a wrapper around
addEventListener can retain the callback it observed and invoke it after removal.
The original distinct callback still executes; the shared dispatcher executes
nothing after its map entry was deleted (observed call counts 1 versus 0). A
production optimization would need to preserve or explicitly guard this path,
as well as removal-method failure behavior, before claiming compatibility. This
study contains no such core integration or fallback. Public Elnor behavior stays
unchanged.

## Audit and outcome

There are 18 complete browser cases: two behavior cases and sixteen timing cases,
224 measured transactions (112 matched transaction-round pairs), 448 CDP phase
windows and 48 derived phase/sum contrasts. Sum contrasts reuse the two measured
phases and are not independent observations. The CSV/JSON retain all seven raw
values per label and deletion-of-one-round sensitivity ranges. Those ranges are
not confidence intervals; small sequential samples, GC/JIT state, host/browser
variation and common-page ordering limit inference. No samples were removed.

Three arithmetic controls include a nonadditive-median example. A separate
median implementation checks all calculations against statistics.median. Source,
fixture, worker, primary-reference and unchanged core hashes, sample order,
visibility, native checks, retention controls and all supervisor records are
verified. The 18 serial browser Jobs pass with CPU 10%, commit 768 MiB,
24 processes, host free >=4 GiB, kill-on-owner-close, 45 s wall/12 s idle and zero
owned descendants after cleanup. The offline audit uses 60 s wall/idle in the
same resource envelope. No Rust work, dependency install or desktop app ran.

The routing design is not pursued for production: it fails to show a consistent
primitive advantage and adds a map/lifetime/observability contract. No framework
matrix or complete Elnor test gate was rerun for this native-only rejection.
The core remains byte-identical to [the frozen comparison](CURRENT-CORE-COMPARISON.md).
This closes this callback-sharing hypothesis; it neither proves every event
optimization impossible nor establishes Elnor/Svelte parity.

Private evidence under `elnor/.elnor/mvp/framework-comparison/shared-native-callback-study/`:

- Primary-source snapshot: `references-a87b9b046af340c095bc7e7cb49c099a`.
- V1 exploratory cohort: `run-8e41cbc777fc4166a929631ac9185d14`.
- V2 decision cohort: `run-f45a668aa4694e87a65c18962474d174`.
- Exact report, recomputation and audit: `review-af1a20e693014558ab2b9fc8bea8201a` (`analysis.json`, `contrasts.csv`, `report.md`, producer/reviewer snapshots and `verification.json`).
