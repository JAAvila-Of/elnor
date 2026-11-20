# Direct compiled events: private experiment

**Not integrated.** The candidate removes emitted per-instance event objects and
forwarders for a conservative subset, but does not consistently improve list
creation/clear or establish global benefit. Production retains the compiler and
runtime validated by the 610-test gate. Svelte parity remains open.

## Mechanism, eligibility and reference

TypeScript's binder proves which references resolve to the component's emit
binding. Only direct, nonoptional calls to a declared event use a shared runtime
dispatcher. If any use exposes, reads or mutates the emitter differently, the
entire component keeps its original event object and calls. Shadowed locals and
each variables remain independent. Components with state or calc declarations
keep the original path because their initializers precede the emitter's temporal
dead zone. The helper performs optional handler lookup after arguments have
already evaluated, preserving the handler receiver, return and thrown values.

The Svelte reference remains local commit
`0156c5fe38b53b72675e2a7f04535de015fdeed1`, version 5.57.3. Its component visitor
builds event handlers and conditionally supplies an events object. This supplied
a contrast for questioning event machinery, not code to transplant. Elnor's
symbol proof, whole-component fallback and initializer restriction are its own
design. No Svelte source changes or builds were performed.

The candidate preserves native DOM listeners, independent text reactions and
the original state/calc contexts. An AST probe checks generated RowView and the
minified served entry: one emitter object and one arrow forwarder become zero,
while both empty state/calc contexts remain. This isolates the change from the
previously rejected empty-context experiment. Source expression counts are not
physical allocated-byte measurements.

## Directed correctness and broad controls

Each variant passes 98 directed tests: 16 new event cases, 42 hygiene cases,
31 initialization cases and 9 detached-row cases. Tests cover argument evaluation
without handlers, lookup/argument errors including thrown undefined, handler
replacement and receiver, return values, opaque emitter identity and mutation
across fragments, shadowing, escaped names and state/calc initialization TDZ.
Eight list pairs, four application preflight cases and sixteen broad pairs
also pass their behavioral checks. Eight cycles per variant/workload (64 total)
return nodes/listeners to their own recorded unmounted baseline.

The rejected candidate did not run the full project gate or independent human
DX/compile-throughput study. No universal absence of leaks is claimed.

## Timing protocol

All cells below are **renderer ThreadTime milliseconds**, baseline → candidate
(relative change). A/A uses the candidate on both labels. Both AB/BA orders use
two warmups, seven measured rounds and alternating isolated active pages.
TaskDuration remains separately retained in raw/summary JSON. Accessibility
stays enabled; post-timing AX observations are not subtracted. These are paired
descriptive medians, not significance tests, end-user latency or a global score.

## Lists

| Rows | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| 100 | create | 10.298 → 9.548 (-7.3%) | 9.599 → 8.646 (-9.9%) | 9.265 → 9.244 (-0.2%) | 9.575 → 10.001 (+4.4%) |
| 100 | update | 2.056 → 2.022 (-1.7%) | 1.909 → 1.996 (+4.6%) | 2.159 → 2.206 (+2.2%) | 2.010 → 2.031 (+1.0%) |
| 100 | select | 1.401 → 1.452 (+3.6%) | 1.418 → 1.397 (-1.5%) | 1.548 → 1.428 (-7.8%) | 1.541 → 1.446 (-6.2%) |
| 100 | append | 2.448 → 3.012 (+23.0%) | 2.592 → 2.527 (-2.5%) | 2.657 → 2.585 (-2.7%) | 2.569 → 2.877 (+12.0%) |
| 100 | swap | 1.950 → 2.182 (+11.9%) | 1.933 → 1.831 (-5.3%) | 1.919 → 1.945 (+1.4%) | 2.183 → 2.185 (+0.1%) |
| 100 | remove | 2.390 → 2.702 (+13.1%) | 2.111 → 2.048 (-3.0%) | 2.427 → 2.397 (-1.2%) | 2.316 → 2.388 (+3.1%) |
| 100 | clear | 2.578 → 2.457 (-4.7%) | 2.335 → 2.253 (-3.5%) | 2.456 → 2.533 (+3.1%) | 2.523 → 2.502 (-0.8%) |
| 1000 | create | 101.576 → 102.579 (+1.0%) | 107.047 → 105.306 (-1.6%) | 98.862 → 103.710 (+4.9%) | 105.707 → 105.513 (-0.2%) |
| 1000 | update | 8.762 → 8.487 (-3.1%) | 9.228 → 9.214 (-0.2%) | 8.921 → 8.732 (-2.1%) | 8.631 → 8.657 (+0.3%) |
| 1000 | select | 2.549 → 2.841 (+11.5%) | 3.118 → 3.330 (+6.8%) | 2.949 → 2.713 (-8.0%) | 3.082 → 3.004 (-2.5%) |
| 1000 | append | 11.453 → 11.514 (+0.5%) | 15.726 → 15.074 (-4.1%) | 13.092 → 13.260 (+1.3%) | 15.446 → 15.225 (-1.4%) |
| 1000 | swap | 4.387 → 4.163 (-5.1%) | 4.651 → 4.459 (-4.1%) | 4.273 → 4.631 (+8.4%) | 4.436 → 4.553 (+2.6%) |
| 1000 | remove | 8.355 → 8.787 (+5.2%) | 9.649 → 9.638 (-0.1%) | 7.576 → 7.682 (+1.4%) | 9.448 → 8.332 (-11.8%) |
| 1000 | clear | 13.171 → 12.838 (-2.5%) | 14.540 → 13.766 (-5.3%) | 12.199 → 13.390 (+9.8%) | 14.064 → 13.572 (-3.5%) |

Selection uses lower observed CPU in both orders at both sizes. At 1,000 rows,
creation is +4.9%/-0.2%, clear +9.8%/-3.5% and swap +8.4%/+2.6%. These do not
show a consistent improvement of the targeted creation and clear gaps.

## Broader applications

| Workload | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| counter | mount | 1.146 → 1.236 (+7.9%) | 1.083 → 1.067 (-1.5%) | 1.103 → 1.009 (-8.5%) | 1.123 → 1.066 (-5.1%) |
| counter | increment | 0.973 → 0.982 (+0.9%) | 0.958 → 1.013 (+5.7%) | 1.215 → 0.911 (-25.0%) | 1.044 → 1.080 (+3.4%) |
| counter | unmount | 0.981 → 0.916 (-6.6%) | 0.886 → 0.856 (-3.4%) | 0.930 → 0.925 (-0.5%) | 0.936 → 0.951 (+1.6%) |
| form | mount | 1.487 → 1.958 (+31.7%) | 1.529 → 1.530 (+0.1%) | 1.515 → 1.941 (+28.1%) | 1.839 → 1.786 (-2.9%) |
| form | edit-one | 1.964 → 1.907 (-2.9%) | 1.928 → 1.879 (-2.5%) | 1.834 → 1.765 (-3.8%) | 1.768 → 1.903 (+7.6%) |
| form | edit-all | 2.261 → 2.095 (-7.3%) | 2.168 → 2.031 (-6.3%) | 1.925 → 1.889 (-1.9%) | 2.095 → 2.024 (-3.4%) |
| form | invalid | 1.974 → 1.945 (-1.5%) | 1.877 → 1.946 (+3.7%) | 1.808 → 1.908 (+5.5%) | 1.797 → 1.808 (+0.6%) |
| form | recover | 1.651 → 1.604 (-2.8%) | 1.637 → 1.503 (-8.2%) | 1.464 → 1.590 (+8.6%) | 1.468 → 1.625 (+10.7%) |
| form | unmount | 1.071 → 1.043 (-2.6%) | 0.993 → 1.017 (+2.4%) | 0.967 → 0.960 (-0.7%) | 1.003 → 0.985 (-1.8%) |
| composition | mount | 1.475 → 1.612 (+9.3%) | 1.297 → 1.295 (-0.2%) | 1.319 → 1.243 (-5.8%) | 1.367 → 1.403 (+2.6%) |
| composition | relay | 1.388 → 1.247 (-10.2%) | 1.115 → 1.364 (+22.3%) | 1.036 → 1.128 (+8.9%) | 1.178 → 1.253 (+6.4%) |
| composition | unmount | 0.904 → 0.991 (+9.6%) | 0.982 → 0.935 (-4.8%) | 1.003 → 0.958 (-4.5%) | 1.003 → 0.997 (-0.6%) |
| localized | mount | 2.169 → 2.057 (-5.2%) | 2.329 → 2.389 (+2.6%) | 2.337 → 2.360 (+1.0%) | 2.662 → 2.255 (-15.3%) |
| localized | local-update | 1.445 → 2.150 (+48.8%) | 1.255 → 1.306 (+4.1%) | 2.619 → 1.157 (-55.8%) | 1.346 → 1.307 (-2.9%) |
| localized | unmount | 1.186 → 1.227 (+3.5%) | 1.168 → 1.188 (+1.7%) | 1.243 → 1.334 (+7.3%) | 1.131 → 1.345 (+18.9%) |

The broader evidence is mixed. Composition relay is higher by 8.9%/6.4%,
form recovery by 8.6%/10.7%, while other actions improve or change direction.
Small sample counts, A/A variation and engine/host conditions limit attribution;
this does not prove the candidate causes every observed increase. It does not
justify adopting added compiler planning and a runtime export for this target.

## Native allocation diagnostic, separate from CPU

Six fresh sandboxed browser runs use the declared order baseline, candidate,
candidate, baseline, baseline, candidate. Each runs two create/clear warmups,
then samples one 1,000-row create through native HeapProfiler at a 1,024-byte
interval with minor/major-collected objects included. A named allocation positive
control and the driver verification/GC remain in the raw capture. Columns below
are statistical self-size estimates, not exact allocation totals. Bundle-frame
self attribution excludes native/builtin and driver frames; it is not all
application memory and does not include DOM-native allocation.

| Run | Variant | Bundle-frame sampled self bytes | Row-source attribution | Positive control sampled bytes |
| --- | --- | --- | --- | --- |
| 1 | baseline | 2057224 | 194392 | 84008 |
| 2 | candidate | 1851412 | unavailable | 85000 |
| 3 | candidate | 1873512 | unavailable | 86128 |
| 4 | baseline | 1919940 | 179756 | 86856 |
| 5 | baseline | 1892964 | 172528 | 106856 |
| 6 | candidate | 1914432 | unavailable | 98352 |

Bundle-attributed ranges overlap. No named row-source frames appear in the
candidate profiles; this is compatible with inlining or changed attribution,
and is **not zero allocation**. Per-row allocation savings therefore cannot be
computed by subtracting those frames. The first analyzer asserted the presence
of row frames in every profile and failed. That exact reader/failure remains
retained. Its new revision keeps the source, positive-control and nonzero bundle
checks, represents unavailable row attribution as null, and states the limitation.
No capture was rerun to replace that data. These diagnostics do not establish
a CPU speedup, exact saved bytes or a refreshed React/Svelte ranking.

## Resource and provenance audit

The retained cohort has 49 serial supervised phases: 48 pass and one is that
allocation-attribution reader failure. All verify CPU 10%, commit 768 MiB,
24 processes, host free >=4 GiB, kill-on-owner-close, browser 45/12 seconds and
Node 60/60 seconds, ending with zero remaining owned processes. No unrelated
process was stopped and no resource or behavioral check was relaxed.

The strict list reader replaces its runtime-only equal-compiler assumption with
the exact declared compiler/runtime digest for each label/group; every other
control is unchanged. Fixture source snapshots, all site files and dependency
locks are checked. Complete report revisions, source identities, raw profiles,
proofs and supervisor hashes remain in `direct-event-study/verification-v2.json`.

Baseline compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

Baseline runtime: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`

Candidate compiler: `55af7d0cbfa53616533132babd06cdf7787ae3affd6c0c893b4363d47e1548bb`

Candidate runtime: `f96478128e5002a15dc94545c7f675917e3a914ef9f9ff296d810199945d2e85`

Frozen list fixtures: `run-hfalM3`, `run-zT5C4E`.

Frozen matrix fixtures: `matrix-unoxP0`, `matrix-GGVyCd`.
