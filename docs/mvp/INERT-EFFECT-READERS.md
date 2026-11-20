# Releasing successful inert effect readers

**Retained for earlier release of captures. No general CPU speedup is established.**
After a successful effect run with no dependencies, Elnor now clears its read
callback. The effect object, dependency Set, owner registration and disposer remain.
No Surface API, DOM strategy, scheduler queue or owner interface changes.

A run removes its previous subscriptions before collecting new ones. After a
successful run without reads, no cell can schedule that effect again. Failed runs
do not take the new path. Disposal remains responsible for cleanup, including
nested resources, immediate/foreign owners and pending effects.

## Svelte contrast

The read-only reference is Svelte 5.57.3 at commit
`0156c5fe38b53b72675e2a7f04535de015fdeed1`, supplied locally. In
`packages/svelte/src/internal/client/reactivity/effects.js`, `create_effect`
can omit an effect from its tree after checking dependencies, teardown, DOM,
child count and preservation flags. This suggested questioning what an inert
effect must retain. Elnor does not adopt that effect tree or its implementation:
it keeps its own Set-based subscriptions and all cleanup registrations, releasing
only the read function after successful zero-dependency execution. This differs
from earlier rejected experiments changing effect construction or empty-Set
traversal. No Svelte checkout changes or Svelte builds were made.

## Retention and correctness

Two private cohorts pass 34 existing dependency/scheduler/recovery tests each.
Sixteen additional baseline/candidate checks cover nested effects, foreign owner
registration, immediate cleanup, tracked error recovery and four capture cases.
The candidate releases a constant reader's payload and a reader that stops reading
cells while its owner remains alive. A reactive reader and a queued reader that
throws before reading remain positive retained controls. All release on disposal.

An uninstrumented native Edge 157.0.4341.42 diagnostic independently checks both
payloads and detached Text nodes, with 12 forced collections before and after
disposal. The baseline retains all four before disposal; the candidate releases
the two inert cases and retains the two reactive controls. Neither retains them
after disposal. This demonstrates reachability in these probes, not exact saved
bytes, whole-application heap reduction or a guaranteed GC schedule.

Three public regressions discriminate the change: the baseline has two expected
failures and one passing error control; the candidate passes all three. The final
project verification passes **586 tests, check and build in 51 serial phases**.

## Broad CPU comparison

Fresh normal baseline fixtures use the previous retained runtime, not stale graph
outputs. The candidate matrix explicitly overrides both served runtime and copied
checked graph. The list fixture uses the supported runtime-source override: its
served runtime/bundle are the candidate, while its raw checked graph remains the
baseline. Source and bundle hashes are retained separately.

Four small workloads have A/A controls and baseline/candidate AB/BA pairs; lists
cover 100 and 1,000 rows, seven actions, A/A and AB/BA. Values below are renderer
thread ms for small workloads and TaskDuration ms for lists. Negative change
means lower measured CPU. Do not combine these metrics or subtract A/A noise.
Paired medians are descriptive, without a statistical acceptance threshold.

| Workload/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| counter/mount | 1.015 → 0.894 (-11.9%) | 1.108 → 1.011 (-8.8%) | 1.477 → 1.365 (-7.6%) | 1.125 → 0.970 (-13.8%) |
| counter/increment | 0.806 → 0.806 (-0.0%) | 0.973 → 1.078 (+10.8%) | 1.222 → 1.494 (+22.3%) | 0.887 → 0.871 (-1.8%) |
| counter/unmount | 0.746 → 0.831 (+11.4%) | 1.002 → 0.904 (-9.8%) | 1.193 → 1.316 (+10.3%) | 0.910 → 0.886 (-2.6%) |
| form/mount | 1.231 → 1.154 (-6.3%) | 1.747 → 1.746 (-0.1%) | 1.448 → 1.334 (-7.9%) | 1.851 → 1.647 (-11.0%) |
| form/edit-one | 1.025 → 1.083 (+5.7%) | 1.371 → 1.447 (+5.5%) | 1.282 → 1.337 (+4.3%) | 1.566 → 1.660 (+6.0%) |
| form/edit-all | 1.178 → 1.277 (+8.4%) | 1.685 → 1.509 (-10.4%) | 1.277 → 1.296 (+1.5%) | 1.359 → 1.652 (+21.6%) |
| form/invalid | 1.097 → 1.034 (-5.7%) | 1.505 → 1.498 (-0.5%) | 1.106 → 1.252 (+13.2%) | 1.472 → 1.477 (+0.3%) |
| form/recover | 1.015 → 1.124 (+10.7%) | 1.518 → 1.663 (+9.6%) | 1.117 → 1.174 (+5.1%) | 1.756 → 1.577 (-10.2%) |
| form/unmount | 0.859 → 0.799 (-7.0%) | 0.941 → 1.034 (+9.9%) | 0.872 → 0.906 (+3.9%) | 1.072 → 1.174 (+9.5%) |
| composition/mount | 1.130 → 1.189 (+5.2%) | 1.267 → 1.266 (-0.1%) | 1.261 → 1.333 (+5.7%) | 1.690 → 1.813 (+7.3%) |
| composition/relay | 1.001 → 0.982 (-1.9%) | 0.916 → 1.008 (+10.0%) | 0.962 → 0.975 (+1.4%) | 1.593 → 1.541 (-3.3%) |
| composition/unmount | 0.883 → 0.804 (-8.9%) | 0.863 → 0.954 (+10.5%) | 0.857 → 0.889 (+3.7%) | 1.353 → 1.249 (-7.7%) |
| localized/mount | 2.068 → 2.214 (+7.1%) | 2.764 → 2.418 (-12.5%) | 2.522 → 2.030 (-19.5%) | 2.143 → 2.035 (-5.0%) |
| localized/local-update | 1.181 → 1.164 (-1.4%) | 1.445 → 1.315 (-9.0%) | 1.183 → 1.236 (+4.5%) | 1.155 → 1.146 (-0.8%) |
| localized/unmount | 1.060 → 0.980 (-7.5%) | 1.269 → 1.128 (-11.1%) | 0.991 → 1.138 (+14.8%) | 0.955 → 1.029 (+7.7%) |

| List size/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| 100/create | 4.174 → 4.490 (+7.6%) | 4.036 → 3.615 (-10.4%) | 5.214 → 5.290 (+1.5%) | 4.717 → 3.893 (-17.5%) |
| 100/update | 1.846 → 1.620 (-12.2%) | 1.338 → 1.627 (+21.6%) | 1.791 → 2.059 (+15.0%) | 1.722 → 1.330 (-22.8%) |
| 100/select | 1.459 → 1.425 (-2.3%) | 1.184 → 1.154 (-2.5%) | 1.708 → 1.618 (-5.3%) | 1.328 → 1.364 (+2.7%) |
| 100/append | 1.803 → 2.187 (+21.3%) | 1.947 → 1.830 (-6.0%) | 2.427 → 2.376 (-2.1%) | 1.738 → 2.074 (+19.3%) |
| 100/swap | 1.589 → 1.620 (+2.0%) | 1.469 → 1.485 (+1.1%) | 1.862 → 1.869 (+0.4%) | 1.486 → 1.554 (+4.6%) |
| 100/remove | 2.018 → 1.919 (-4.9%) | 1.468 → 1.910 (+30.1%) | 2.233 → 2.080 (-6.9%) | 1.597 → 1.744 (+9.2%) |
| 100/clear | 1.324 → 1.511 (+14.1%) | 1.221 → 1.133 (-7.2%) | 1.679 → 1.626 (-3.2%) | 1.375 → 1.414 (+2.8%) |
| 1000/create | 23.202 → 27.367 (+18.0%) | 24.112 → 23.803 (-1.3%) | 20.157 → 22.666 (+12.4%) | 27.591 → 26.374 (-4.4%) |
| 1000/update | 3.904 → 3.982 (+2.0%) | 3.533 → 3.847 (+8.9%) | 3.698 → 3.708 (+0.3%) | 3.989 → 3.696 (-7.3%) |
| 1000/select | 2.324 → 2.327 (+0.1%) | 2.352 → 2.210 (-6.0%) | 1.977 → 1.926 (-2.6%) | 2.207 → 2.336 (+5.8%) |
| 1000/append | 6.314 → 5.823 (-7.8%) | 4.848 → 5.120 (+5.6%) | 4.790 → 4.448 (-7.1%) | 5.486 → 5.710 (+4.1%) |
| 1000/swap | 3.278 → 2.758 (-15.9%) | 2.502 → 2.611 (+4.4%) | 2.748 → 2.618 (-4.7%) | 3.370 → 2.594 (-23.0%) |
| 1000/remove | 3.736 → 4.330 (+15.9%) | 4.405 → 3.394 (-23.0%) | 4.407 → 3.222 (-26.9%) | 4.628 → 3.419 (-26.1%) |
| 1000/clear | 3.996 → 3.817 (-4.5%) | 3.416 → 3.294 (-3.6%) | 3.616 → 3.312 (-8.4%) | 4.020 → 4.553 (+13.3%) |

Results remain mixed: localized mounting is lower in both orders, while composition
mounting is higher in both. List creation changes direction across orders. There
is no justified universal speedup or proven CPU neutrality. This change is retained
for the directly demonstrated release of inert captures; the branch on every
successful effect run is a potential cost to revisit with real applications.
The small-workload memory diagnostic also returns DOM/listener counts to baseline
after eight cycles; its GC heap includes the harness and is not exact allocation.

This is an Elnor-before/after study. It is not a new React/Svelte performance
ranking and does not establish production readiness or parity with either.

## Evidence and reproducibility

All expensive phases ran serially under CPU10%, commit768MiB, 24 processes,
minimum 4GiB host free memory and kill-on-owner-close. Browser limits were 45s/12s
idle; Node limits 60s/60s. The expected failing baseline regression is explicitly
recorded as a failure, not a successful supervisor. No limit was relaxed.

Internal study root: `elnor/.elnor/mvp/framework-comparison/inert-reader-study`.
`freeze.py`, `run-private.py`, `run-native.py`, `run-matrix-trial.py`,
`run-list-trial.py` and `run-regression.py` retain their outputs and producers.
The full gate uses `python elnor/benchmarks/runtime/test-project-windows.py`.
`review.py` verifies source identities, strict matrix summaries, native controls,
supervisor limits and phase nonoverlap. `review-verification.json` identifies the
exact evidence and current source hashes. Historical comparison tables remain
frozen to their stated sources.

Baseline runtime: `9212a50d2bf35c77ff97cf06c79e10eaac1cce879d7cfafa17c9d5aa9087e855`

Retained runtime: `cf122b7f0c52d66aa360b981229f74af36f40740339c4399d5d7a959442821ab`
