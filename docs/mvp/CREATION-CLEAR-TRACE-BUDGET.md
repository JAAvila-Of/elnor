# Creation and clear trace budgets



This diagnostic separates recorded renderer CPU intervals without summing nested

events. It changes no runtime, compiler, browser flags, scheduling, DOM, CSS or

production benchmark collector. The normal [current core comparison](CURRENT-CORE-COMPARISON.md)

remains the source for unprofiled framework timings. These instrumented captures

must not replace that ranking or be pooled with normal samples.



## Main observation



In the two fresh Elnor 1,000-row creation captures, rendering stages account for

about **68–73% of captured CPU**, and script-associated intervals about **22–25%**.

In clear, script-associated intervals account for about **67–69%**. This supports

separate diagnoses of creation and teardown; it does not identify one specific

runtime helper to optimize. Script-associated intervals include native DOM calls,

model/driver work and engine work nested within script, so they are not pure JS.

They cannot be treated as the savings available from Rust or a code rewrite.



## Method and accounting



The exact frozen fixture is `run-ZZn7ZX`, with compiler/runtime hashes checked

against the 62-phase current-core refresh and active source. Twelve fresh owned

browser cases cover 100/1,000 rows × Elnor/React/Svelte × two repetitions. The

second repetition reverses framework order. Each original `trace` case warms

create/clear twice, captures each once and verifies state and keyed identity.

Original categories remain `toplevel,accessibility,blink,devtools.timeline,v8`;

streams reject data loss and are capped at 8 MiB per action. Accessibility stays

enabled. The 32 existing post-timing create traces are analyzed separately.



The renderer is identified by CrRendererMain metadata and a FunctionCall URL

matching the framework entry. Complete events with `tts` and `tdur` define CPU

intervals. A sweep over their union assigns each covered interval once, with

priority GC → accessibility → rendering indicators → script-associated → other.

Four synthetic controls check nesting, duplicates, disjoint gaps and invalid

intervals. The disjoint categories sum to the captured CPU union in every trace.



Rendering indicators include style/layout, prepaint, paint and compositing phase

events listed exactly in the retained analyzer. Script indicators include

FunctionCall, v8.callFunction, EvaluateScript, RunMicrotasks and the Blink

microtask checkpoint. Unknown events remain other. Events without CPU clocks

are counted but cannot be assigned independently; their work may remain in a

clocked parent. This is a classification of recorded intervals, not a complete

semantic decomposition of every browser operation.



The CPU union and the CDP TaskDuration metric use different capture boundaries.

Their difference is not labeled as missing runtime work or idle time. Likewise,

the trace wall span includes tracing/protocol boundaries. Inclusive framework

FunctionCall unions are retained separately in JSON and are not added to the

disjoint totals. No accessibility/GC/rendering cost is subtracted to manufacture

a faster framework score.



## Fresh instrumented captures



All values are milliseconds. Script includes native DOM within script. CPU union

is the sum of the five disjoint categories; Task is the separate CDP metric.



| Rows | Framework | Repeat | Action | Task | CPU union | Script | Render | AX | GC | Other |

|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---:|

| 100 | elnor | 0 | create | 4.979 | 4.731 | 1.242 | 2.413 | 0.004 | 0.321 | 0.751 |

| 100 | elnor | 0 | clear | 2.132 | 2.095 | 0.867 | 0.407 | 0.003 | 0.000 | 0.818 |

| 100 | react | 0 | create | 5.308 | 5.090 | 1.583 | 2.695 | 0.004 | 0.000 | 0.808 |

| 100 | react | 0 | clear | 2.439 | 2.379 | 1.205 | 0.385 | 0.003 | 0.000 | 0.786 |

| 100 | svelte | 0 | create | 8.330 | 8.072 | 1.984 | 3.955 | 0.004 | 1.273 | 0.856 |

| 100 | svelte | 0 | clear | 2.081 | 2.039 | 0.876 | 0.346 | 0.004 | 0.000 | 0.813 |

| 1000 | elnor | 0 | create | 44.868 | 43.104 | 9.446 | 31.381 | 0.003 | 1.409 | 0.865 |

| 1000 | elnor | 0 | clear | 4.854 | 4.804 | 3.221 | 0.337 | 0.004 | 0.531 | 0.711 |

| 1000 | react | 0 | create | 27.409 | 25.459 | 5.468 | 19.313 | 0.004 | 0.000 | 0.674 |

| 1000 | react | 0 | clear | 5.312 | 5.238 | 4.058 | 0.363 | 0.004 | 0.000 | 0.813 |

| 1000 | svelte | 0 | create | 23.920 | 21.966 | 4.296 | 17.006 | 0.002 | 0.000 | 0.662 |

| 1000 | svelte | 0 | clear | 3.500 | 3.431 | 2.252 | 0.456 | 0.003 | 0.000 | 0.720 |

| 100 | svelte | 1 | create | 5.183 | 4.924 | 1.336 | 2.435 | 0.006 | 0.422 | 0.725 |

| 100 | svelte | 1 | clear | 2.096 | 2.043 | 0.864 | 0.370 | 0.004 | 0.000 | 0.805 |

| 100 | react | 1 | create | 4.554 | 4.319 | 1.139 | 2.480 | 0.004 | 0.000 | 0.696 |

| 100 | react | 1 | clear | 2.495 | 2.418 | 1.096 | 0.517 | 0.003 | 0.000 | 0.802 |

| 100 | elnor | 1 | create | 4.464 | 4.250 | 1.057 | 2.209 | 0.004 | 0.335 | 0.645 |

| 100 | elnor | 1 | clear | 1.684 | 1.631 | 0.695 | 0.285 | 0.003 | 0.000 | 0.648 |

| 1000 | svelte | 1 | create | 23.140 | 21.140 | 3.788 | 16.636 | 0.002 | 0.000 | 0.714 |

| 1000 | svelte | 1 | clear | 3.260 | 3.214 | 2.018 | 0.485 | 0.002 | 0.000 | 0.709 |

| 1000 | react | 1 | create | 30.174 | 28.188 | 5.988 | 21.388 | 0.004 | 0.000 | 0.808 |

| 1000 | react | 1 | clear | 4.922 | 4.839 | 3.625 | 0.363 | 0.004 | 0.000 | 0.847 |

| 1000 | elnor | 1 | create | 38.029 | 35.982 | 9.067 | 24.601 | 0.003 | 1.496 | 0.815 |

| 1000 | elnor | 1 | clear | 5.093 | 5.003 | 3.445 | 0.401 | 0.004 | 0.445 | 0.708 |



Fresh traced creation costs differ materially from normal timed windows. For

example, Elnor 1,000-row TaskDuration is about 38–45 ms here versus about 20 ms

in its normal Svelte comparison pairs. Trace overhead, warmup/GC, host load and

capture conditions are not isolated causes. No cross-cohort speedup or regression

is inferred. Raw repetitions are retained without excluding outliers.



## Normal windows: CPU and frame window are different quantities



These are the already-captured Elnor side of both Svelte pairs in the current

normal benchmark, not new timing samples. The frame window contains two

requestAnimationFrame callbacks and a geometry read; it is not click-to-pixel

latency. CPU collection also includes protocol boundaries. No subtraction of

the two clocks is used to calculate exact waiting time.



| Rows | Order | Action | Task CPU ms | Thread CPU ms | Frame window ms |

|---:|---|---|---:|---:|---:|

| 100 | AB | create | 4.026 | 4.160 | 29.900 |

| 100 | AB | clear | 1.212 | 1.289 | 29.500 |

| 100 | BA | create | 3.768 | 3.879 | 29.700 |

| 100 | BA | clear | 1.157 | 1.230 | 29.900 |

| 1000 | AB | create | 19.863 | 19.937 | 31.200 |

| 1000 | AB | clear | 3.469 | 3.549 | 29.100 |

| 1000 | BA | create | 20.177 | 20.250 | 30.600 |

| 1000 | BA | clear | 3.759 | 3.848 | 29.200 |



## Existing post-timing creation cross-check



The previous paired study has uneven framework counts: Elnor is also present in

A/A and control pairs. Medians/ranges below are descriptive cross-checks, not

new balanced timing comparisons. They are not pooled with the fresh captures.

Detailed group, order, label and source references remain in summary JSON.



| Rows | Framework | Captures | Captured CPU median (range) | Script median | Render median | AX median |

|---:|---|---:|---:|---:|---:|---:|

| 100 | elnor | 12 | 3.569 (3.412–4.630) | 0.739 | 2.218 | 0.004 |

| 100 | react | 2 | 3.734 (3.472–3.995) | 0.901 | 2.173 | 0.004 |

| 100 | svelte | 2 | 4.213 (3.907–4.519) | 0.803 | 2.375 | 0.005 |

| 1000 | elnor | 12 | 24.317 (19.844–38.023) | 5.744 | 16.718 | 0.003 |

| 1000 | react | 2 | 27.481 (22.555–32.407) | 5.376 | 15.212 | 0.004 |

| 1000 | svelte | 2 | 28.421 (25.203–31.639) | 5.018 | 18.882 | 0.007 |



## Outcome, evidence and next boundary



This resolves a measurement limitation: sparse sampled frames are complemented

by 24 fresh and 32 existing complete-event traces, with explicit nonoverlapping

CPU accounting. It does not prove that all rendering is unavoidable or that a

specific owner, prop, dependency or listener operation dominates teardown.

Any optimization still needs its own isolated evidence, lifetime/error tests,

and the broad application/list matrix. Previously rejected

[scope loops](SCOPE-DISPOSAL-STUDY.md), [lazy cleanup collectors](LAZY-CLEANUP-STUDY.md),

[prop adapters](REGION-OPTIMIZATION.md) and [grouped insertions](GROUPED-INSERTION-FEASIBILITY.md)

must not be revived solely from a broad script category.



Evidence: `trace-budget-study/run-660dde4207de455eb1deed9456c837f3`. Fresh cases retain original collectors,

source/assets, limits and trace bytes. This directory retains the analyzer,

producer, report, summaries and verification hashes. All 12 expensive phases ran

serially in the existing Windows Jobs: CPU10%,768MiB commit,24 processes,

host free >=4GiB,wall45s/idle12s,kill-on-owner-close; sandboxed headless

Edge157.0.4341.42, GPU disabled. Every phase ended with zero owned processes.

The last complete core gate remains 581 tests/check/build; it was not rerun

for this diagnostic-only work. Source hashes remain identical to that retained

compiler/runtime and the current benchmark fixtures. No production readiness or

competitive-parity verdict changes.


## Operation counts and local Svelte source cross-check

A separate private, source-instrumented copy of the frozen Elnor graphs runs with
FakeDOM. It records source constructor and method calls, never CPU or bytes.
It checks create/clear row counts, empty unmounts and inert repeated unmounts.
Copies cannot supply normal timing evidence. The collector counts selected
runtime operations, not all allocations: Maps, closures, engine internals and
browser-native costs are not comprehensively measured. FakeDOM counts are not a
native browser profile. The native trace study above supplies separate evidence.

| Workload | Rows | Phase | Cells | Scopes | Effects | Own registrations | Cleanup calls | Effects disposed | Listener removals | Dependency delete attempts | Cleanup snapshots |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| counter | — | mount | 1 | 1 | 1 | 4 | 0 | 0 | 0 | 0 | 0 |
| counter | — | unmount | 0 | 0 | 0 | 0 | 6 | 1 | 1 | 1 | 1 |
| form | — | mount | 8 | 1 | 11 | 19 | 0 | 0 | 0 | 0 | 0 |
| form | — | unmount | 0 | 0 | 0 | 0 | 23 | 11 | 6 | 16 | 1 |
| composition | — | mount | 1 | 1 | 3 | 13 | 0 | 0 | 0 | 0 | 0 |
| composition | — | unmount | 0 | 0 | 0 | 0 | 15 | 3 | 1 | 2 | 1 |
| localized | — | mount | 24 | 1 | 48 | 97 | 0 | 0 | 0 | 0 | 0 |
| localized | — | unmount | 0 | 0 | 0 | 0 | 99 | 48 | 24 | 24 | 1 |
| list | 100 | mount | 1 | 1 | 3 | 17 | 0 | 0 | 0 | 0 | 0 |
| list | 100 | create | 100 | 100 | 200 | 300 | 0 | 0 | 0 | 3 | 0 |
| list | 100 | clear | 0 | 0 | 0 | 0 | 300 | 200 | 100 | 203 | 100 |
| list | 100 | unmount | 0 | 0 | 0 | 0 | 621 | 203 | 106 | 203 | 101 |
| list | 1000 | mount | 1 | 1 | 3 | 17 | 0 | 0 | 0 | 0 | 0 |
| list | 1000 | create | 1000 | 1000 | 2000 | 3000 | 0 | 0 | 0 | 3 | 0 |
| list | 1000 | clear | 0 | 0 | 0 | 0 | 3000 | 2000 | 1000 | 2003 | 1000 |
| list | 1000 | unmount | 0 | 0 | 0 | 0 | 6021 | 2003 | 1006 | 2003 | 1001 |

Creating 1,000 rows invokes 1,000 subscriber-Set and 2,000 effect-Set constructors,
creates 2,000 effects and registers 3,000 owned cleanups. Clearing invokes 3,000
cleanup callbacks, 2,000 effect disposals, 1,000 listener removals, 2,003 dependency
delete attempts and 1,000 cleanup snapshots. These operations overlap: an effect
disposer is itself an owned cleanup callback; the counts must not be added into
one work/CPU total. Three dependency removals belong to rerunning outer effects.
Normal full unmount has different wrapper cleanup work and is shown separately.
These counts establish scale, not which individual operation costs the most.

### Reference source and limits

The supplied local Svelte checkout is clean at commit
`0156c5fe38b53b72675e2a7f04535de015fdeed1`, package version 5.57.3. The benchmark
still uses the existing pinned npm package; it was not rebuilt from this checkout.
After newline normalization, `effects.js`, `runtime.js` and `dom/blocks/each.js`
match the installed package. `reactivity/sources.js` differs in development
inspection/source-stack tracking, so the whole checkout is not described as
byte-identical to the control. Raw/normalized comparison metadata is retained.
No Svelte source, branch, dependency installation or generated output was changed.
The local performance-investigation guide informs the targeted comparison and
self/inclusive distinction; its branch-switching benchmark command was not
needed for this read-only reference study.

The mechanisms below are paraphrased observations of that source, not transplanted
implementation or evidence that changing a data structure alone improves Elnor.

| Observed Svelte mechanism | Relevant Elnor difference | Transfer boundary |
|---|---|---|
| Effect lifetime is represented as an explicit parent/child/sibling structure; destruction removes dependencies and releases references intrinsically (`reactivity/effects.js`, create/destroy/unlink functions). | Elnor's generic scope stores cleanup functions for effects and listeners. The measured list clear executes 3,000 callbacks. | Study compact bookkeeping only with independent design and equivalent `own`/LIFO/error/reentry behavior; do not adopt the effect tree wholesale. |
| Dependency updates preserve a stable prefix and remove only a changed suffix (`runtime.js`, update_dependencies/remove_reactions). | Elnor currently unlinks and reconnects dependencies when an effect runs. | A future reuse experiment needs conditional/nested reads, exceptions and scheduling tests. It would not automatically eliminate the once-per-lifetime removals counted in clear. |
| Compiler update statements can share a template effect (`compiler/.../shared/utils.js`, build_render_statement). | Elnor's two row captions have separate reactive effects. | Grouping can alter read frequency, side effects and dynamic dependencies; source similarity does not prove equivalent Elnor semantics. |
| Controlled each blocks can clear a container once, with guards for transitions and pending batches (`dom/blocks/each.js`, pause_effects). | Elnor already has guarded exclusive clearing, with native-only cleanup checks and owner-before-DOM behavior. | Repeating the rejected primitive-clear variants is not justified by this resemblance. Elnor must preserve its own observable cleanup order. |

Elnor already releases callbacks/mount references and guards exclusive DOM cleanup.
The useful next question is which part of its native resource bookkeeping is
material in clear, while preserving the generic ownership protocol. Neither a
new linked tree nor dependency-array representation is selected by this study.
No speedup, Rust migration benefit or new core readiness claim is made here.

Counter evidence: `trace-budget-study/counts-16ce893f564240a0b4a061f39a6ea0e3`; 16 checked observations in one
serial contained Node phase (CPU10%,768MiB,24 processes,60s wall/idle,4GiB host
free,kill-on-owner-close). Its result, worker, original instrumenter/FakeDOM hashes,
Svelte commit/file hashes and exact prior/revised report bytes are retained.
