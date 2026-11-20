# Reactions reused as cleanup resources: private experiment

Analysis date: 2026-11-14.

**Rejected for production.** This representation removes the explicit resource
frames from the previous experiment and avoids 4,000 source function constructions
in 1,000 rows. Creation at that size uses 1.3%/1.7% less thread CPU in the captured
AB/BA pairs, but creation at 100 rows is mixed. Clear uses more CPU in both orders
at both sizes. Some application mounts improve while their unmounts worsen, and
every measured bundle grows. The declared broad creation condition is unmet;
there is no additional confirmation or product-parity claim. Public core sources
remain identical to the implementation validated by 610 tests.

## Mechanism and prior experiments

The reaction object itself is the cleanup payload. A native owner's existing
cleanup array stores the reaction followed by a private marker at the original
registration point. On reverse traversal, a shared dispatcher disposes that
reaction. The compiler hoists one native-registration identity lookup per generated
owner boundary, passing the result to dynamic text/button/input helpers. Container
descendants reuse that lookup; each/if/slot render callbacks resolve their own
owner. Unlike the previous fixed-layout selector, this also covers direct form
bindings beside structural blocks.

There is no per-region frame, values array, module-level slot layout or auxiliary
registration object/function per scope. A private WeakMap maps a native owner to
its existing cleanup array, which gains own/disposed/hasResources metadata. That
registry, property access, added reaction field and dispatcher still cost work.
Each reaction entry needs two stack positions instead of the old callback's one.
This is a reduction in explicit source structures, not proof of fewer engine
allocations or retained bytes.

Listeners keep their existing per-element callback registration and cleanup
closures. Public effect/computed/text/button/input helpers retain their original
paths. The generated route keeps independent dependency Sets and scheduler entries,
normal native event scheduling, five-argument renderOwned, props adapters and
initialization behavior. Foreign or overridden owners receive callable cleanup
callbacks through their own method, with its receiver and original access order.
Own is re-read for each resource so replacing/restoring it during earlier reads
does not bypass the override. Registration remains interleaved with user resources;
there is no coarse region callback or fused reactive expression.

The earlier compact-DOM-reaction variant used per-binding WeakMap discovery and
an auxiliary registration object/function per scope. The compiled-lifetime variant
added frames/arrays and three-position entries for all planned resources. This
experiment instead hoists discovery, reuses existing storage and leaves listener
cleanup alone. It was built from the unchanged production compiler/runtime, not
by incorporating either rejected candidate into the public core.

Svelte remains a read-only reference at local commit
0156c5fe38b53b72675e2a7f04535de015fdeed1 (5.57.3), rechecked during this study.
Its create_effect/destroy_effect in
packages/svelte/src/internal/client/reactivity/effects.js makes effect records and
dependency/lifetime disposal explicit. Elnor preserves its own interleaved owner
stack, error order and native listeners rather than adopting Svelte's effect tree
or contracts. No Svelte source, build or branch was changed. Its investigation
guide informed a single mechanism with directed checks before broader timing.

## Correctness and diagnostic-counter control

Each variant passes **17 new and 168 existing controls (185)**. These cover real
generated code, one lookup per lifetime boundary, independent keyed instances,
input propagation, ownerless rendering, immediate/foreign/proxy owners, own
replacement and restoration, registration access order, cancellation during reads,
queued failures, listener release, rollback, flat interleaved error order,
initialization and name hygiene. Only a private copy of the literal-caption test
changes two exact text-helper expectations to resourceText; all literal selection
and runtime assertions remain. Public tests are unchanged. This is directed
candidate validation, not a complete candidate gate or proof for arbitrary global
built-in monkeypatches or hostile imports of internal generated-code helpers.

The old diagnostic bundle instrumentation recognized only ordinary effect.run.
The private profile builder additionally instruments runResource with the exact
same counter expression, inside its instrumented-only branch. A separate actual
compiler-output control confirms three effect runs at mount, six after a button
update, nine after an input edit, and no further runs after disposal in both
variants. Source comparison verifies that this profile-counter addition changes
no normal-timing builder behavior. Counter-instrumented runtimes are absent from
all CPU measurements below. This validation establishes counter coverage, not a
performance gain, and does not retroactively change earlier captures.

## Deterministic source work

Separate source-counter runs use real compiler output and verify equal DOM/text,
effect counts, event delivery and held-listener cleanup in six scenarios. Counts
describe executed source construction/registration sites, not V8 allocated bytes,
CPU units or user latency. In particular, read closures, dependency Sets, cells,
DOM nodes and native listener work remain.

| Scenario | Run functions A/B | Effect disposers A/B | Listener cleanup functions A/B | Candidate identity lookups | Reused reactions |
|---|---:|---:|---:|---:|---:|
| counter | 1 / 0 | 1 / 0 | 1 / 1 | 1 | 1 |
| form | 11 / 3 | 11 / 3 | 6 / 6 | 1 | 8 |
| composition | 3 / 0 | 3 / 0 | 1 / 1 | 3 | 3 |
| localized | 48 / 0 | 48 / 0 | 24 / 24 | 24 | 48 |
| list-100 | 201 / 1 | 201 / 1 | 100 / 100 | 100 | 200 |
| list-1000 | 2001 / 1 | 2001 / 1 | 1000 / 1000 | 1000 | 2000 |

For the 1,000 rows themselves, cleanup storage uses 5,000 stack positions: two
for each of 2,000 reactions and one for each of 1,000 listener callbacks. The core
uses 3,000 callback positions; the prior frame representation used 9,000 positions,
1,000 frames and 1,000 values arrays with 4,000 slots. These comparisons concern
explicit source representation, not timing pooled across different cohorts. The
form now reuses eight DOM reactions; its three computed/structural effects remain
ordinary. No exact allocation-byte saving was measured.

## Browser method, interruption and retry

All table values are renderer **ThreadTime milliseconds**, A baseline → B candidate
(relative change). They include browser/native work within the window, not only
JavaScript or elapsed user latency. Legacy TaskDuration fields remain separate.
There are two warmups and seven measured observations per action/label, alternating
isolated visible active pages with AB/BA seed order. Headless sandboxed Edge
157.0.4341.42 keeps GPU disabled and accessibility enabled. A/A is descriptive and
never subtracted: list A/A uses candidate/candidate; application A/A uses
baseline/baseline. No statistical significance, equivalence margin or aggregate
framework score is established.

One A/A 1,000 BA case reached the unchanged 45 s wall limit while still progressing
through measured round 5, ending at clear/B. Its last telemetry sample shows
9,612,140,544 host-free bytes, peak Job commit 570,150,912 bytes and 43.734375 total
Job CPU seconds. Those observations do not identify the delay's cause. The Job
closed with zero owned processes left. No result file was written; partial sample
values could not be recovered and do not enter the tables.

A single exact retry was declared and passed with the same sources, fixtures,
sample counts, warmups and limits. The three earlier complete A/A cases were
retained without rerunning; only the five missing cases ran in recovery. All
completed results and the interrupted attempt remain available. Completing only
cases within a wall limit is an additional inference limitation; the retry does
not explain the timeout or constitute an independent confirmation. No full
cohort was repeated to search for favorable creation values.

## Complete list comparison

| Rows | Action | A/A AB | A/A BA | Change AB | Change BA |
|---:|---|---|---|---|---|
| 100 | create | 8.532 → 8.607 (+0.9%) | 9.294 → 9.746 (+4.9%) | 8.888 → 8.838 (-0.6%) | 8.861 → 9.244 (+4.3%) |
| 100 | update | 1.912 → 2.071 (+8.3%) | 2.019 → 2.008 (-0.5%) | 2.090 → 2.040 (-2.4%) | 1.910 → 1.942 (+1.7%) |
| 100 | select | 1.418 → 1.575 (+11.1%) | 1.563 → 1.452 (-7.1%) | 1.481 → 1.429 (-3.5%) | 1.374 → 1.400 (+1.9%) |
| 100 | append | 2.804 → 2.794 (-0.4%) | 2.569 → 3.226 (+25.6%) | 2.473 → 3.048 (+23.3%) | 2.571 → 2.456 (-4.5%) |
| 100 | swap | 2.059 → 1.939 (-5.8%) | 1.910 → 1.893 (-0.9%) | 1.959 → 2.010 (+2.6%) | 1.889 → 1.945 (+3.0%) |
| 100 | remove | 2.290 → 2.227 (-2.8%) | 2.425 → 2.175 (-10.3%) | 2.349 → 2.295 (-2.3%) | 2.351 → 2.222 (-5.5%) |
| 100 | clear | 2.393 → 2.391 (-0.1%) | 2.308 → 2.334 (+1.1%) | 2.179 → 2.424 (+11.2%) | 2.209 → 2.352 (+6.5%) |
| 1000 | create | 108.790 → 107.369 (-1.3%) | 108.109 → 112.301 (+3.9%) | 105.870 → 104.523 (-1.3%) | 106.918 → 105.089 (-1.7%) |
| 1000 | update | 9.279 → 9.354 (+0.8%) | 9.081 → 9.830 (+8.2%) | 8.639 → 8.580 (-0.7%) | 9.510 → 9.232 (-2.9%) |
| 1000 | select | 3.071 → 3.112 (+1.3%) | 2.908 → 3.280 (+12.8%) | 2.854 → 2.998 (+5.0%) | 2.722 → 2.903 (+6.6%) |
| 1000 | append | 12.719 → 12.323 (-3.1%) | 12.553 → 12.103 (-3.6%) | 11.054 → 10.812 (-2.2%) | 12.600 → 11.630 (-7.7%) |
| 1000 | swap | 4.126 → 4.315 (+4.6%) | 4.406 → 4.036 (-8.4%) | 4.131 → 3.953 (-4.3%) | 4.060 → 4.408 (+8.6%) |
| 1000 | remove | 9.208 → 8.374 (-9.1%) | 9.772 → 8.548 (-12.5%) | 7.735 → 9.085 (+17.5%) | 8.834 → 8.162 (-7.6%) |
| 1000 | clear | 12.921 → 14.083 (+9.0%) | 14.866 → 14.555 (-2.1%) | 12.570 → 12.908 (+2.7%) | 12.863 → 12.941 (+0.6%) |

## Complete application comparison

| Workload | Action | A/A AB | A/A BA | Change AB | Change BA |
|---|---|---|---|---|---|
| counter | mount | 1.130 → 1.081 (-4.3%) | 1.240 → 1.138 (-8.2%) | 1.239 → 1.163 (-6.1%) | 0.974 → 1.145 (+17.6%) |
| counter | increment | 1.209 → 0.975 (-19.4%) | 1.165 → 1.197 (+2.7%) | 1.082 → 1.026 (-5.2%) | 1.009 → 1.072 (+6.2%) |
| counter | unmount | 0.953 → 1.060 (+11.2%) | 0.984 → 1.067 (+8.4%) | 1.054 → 1.097 (+4.1%) | 0.912 → 0.979 (+7.3%) |
| form | mount | 1.623 → 1.806 (+11.3%) | 1.907 → 1.584 (-16.9%) | 1.838 → 1.639 (-10.8%) | 2.217 → 1.854 (-16.4%) |
| form | edit-one | 1.833 → 1.897 (+3.5%) | 2.011 → 1.875 (-6.8%) | 2.122 → 2.062 (-2.8%) | 2.089 → 2.186 (+4.6%) |
| form | edit-all | 1.975 → 2.064 (+4.5%) | 1.880 → 1.875 (-0.3%) | 2.256 → 2.158 (-4.3%) | 2.087 → 2.278 (+9.2%) |
| form | invalid | 2.078 → 2.100 (+1.1%) | 1.994 → 1.947 (-2.4%) | 2.047 → 1.956 (-4.4%) | 2.376 → 2.249 (-5.3%) |
| form | recover | 1.655 → 1.610 (-2.7%) | 1.569 → 1.567 (-0.1%) | 1.627 → 1.682 (+3.4%) | 1.907 → 2.013 (+5.6%) |
| form | unmount | 0.999 → 0.993 (-0.6%) | 1.070 → 1.018 (-4.9%) | 1.005 → 1.113 (+10.7%) | 1.147 → 1.227 (+7.0%) |
| composition | mount | 1.392 → 1.388 (-0.3%) | 1.774 → 1.820 (+2.6%) | 1.867 → 1.787 (-4.3%) | 1.307 → 1.305 (-0.2%) |
| composition | relay | 1.157 → 1.175 (+1.6%) | 1.462 → 1.389 (-5.0%) | 1.392 → 1.361 (-2.2%) | 1.037 → 1.057 (+1.9%) |
| composition | unmount | 1.184 → 1.119 (-5.5%) | 1.308 → 1.301 (-0.5%) | 1.292 → 1.213 (-6.1%) | 0.909 → 0.957 (+5.3%) |
| localized | mount | 2.768 → 2.337 (-15.6%) | 2.200 → 2.442 (+11.0%) | 2.863 → 2.661 (-7.1%) | 2.642 → 2.535 (-4.0%) |
| localized | local-update | 1.477 → 1.366 (-7.5%) | 1.184 → 1.238 (+4.6%) | 1.390 → 1.299 (-6.5%) | 1.421 → 1.473 (+3.7%) |
| localized | unmount | 1.226 → 1.236 (+0.8%) | 1.137 → 1.049 (-7.7%) | 1.167 → 1.217 (+4.3%) | 1.176 → 1.304 (+10.9%) |

Form and localized mounts have lower medians in both initial orders, but their
unmounts have higher medians in both. Those captures remain separate actions;
there is no accepted workload-frequency weighting that converts them into a net
application benefit. The CSV/JSON retain all 116 action contrasts, the seven raw
values per label, lower/higher paired-round counts and leave-one-round-out ranges.
Those deletion ranges describe sensitivity, not confidence intervals. Small
sequential samples and order/drift limit inference. The earlier frozen production
versus React/Svelte ranking is a separate cohort and is not recalculated here.

## Lifecycle and delivery

All 64 mount/action/unmount cycles across four application families and two
variants return DOM nodes and native listener counts to their own post-import
baseline. GC heap includes the driver/browser and these cycles prove neither
exact allocation savings nor universal absence of leaks. No separate list
allocation-byte or sustained-retention advantage is established.

| Bundle | Raw bytes A/B | Gzip bytes A/B | Brotli bytes A/B |
|---|---:|---:|---:|
| elnor.mjs | 8050 / 8972 | 3260 / 3560 | 2944 / 3209 |
| counter-elnor.mjs | 3447 / 4012 | 1521 / 1742 | 1343 / 1549 |
| form-elnor.mjs | 6220 / 7138 | 2212 / 2508 | 1936 / 2209 |
| composition-elnor.mjs | 4973 / 5566 | 1877 / 2113 | 1654 / 1865 |
| localized-elnor.mjs | 4547 / 5114 | 1727 / 1942 | 1500 / 1708 |

## Verification and disposition

Independent code re-extracts all raw ThreadTime series from 24 completed cases,
recomputes all 116 contrasts and their medians, paired directions and LOO ranges
(812 round pairs and 1,624 action windows), and checks exact source/fixture/site hashes, worker snapshots,
test counts, the two helper-name expectations and profile-counter control.
All 65 Jobs including the audit retain verified CPU 10%, commit 768 MiB,
24 processes, host free >=4 GiB and kill-on-owner-close. Browser limits remain
45 s wall/12 s idle; Node/offline limits are 60 s wall/idle. There are 64 successful
Jobs and one retained timeout, all with zero owned descendants after cleanup;
their intervals are serial.

This candidate remains private and is rejected for production. It meets the
representation-reduction prediction but not the declared broad creation condition,
and clear, several unmounts and all measured delivery sizes provide adverse
evidence. No additional confirmation was requested merely to improve the result.
The public compiler/runtime are unchanged, so their prior 610-test gate was not
rerun. Current-source framework comparisons remain in
[CURRENT-CORE-COMPARISON.md](CURRENT-CORE-COMPARISON.md); the previous representation
is documented in [COMPILED-LIFETIME-STUDY.md](COMPILED-LIFETIME-STUDY.md).

Private evidence under `elnor/.elnor/mvp/framework-comparison/direct-resource-study/`:

- Directed controls: `controls-948b398255df40c59d0d95f524da2225`.
- Existing controls: `existing-f1b59c3da768423fb55d6156727f60fb`.
- Source work: `counts-624847b632644d6b9e6d7822c6491ade`.
- Diagnostic counter control: `profile-control-7f5c7ff583cc4fc0bcf0296413b95a5f`.
- Initial interrupted trial: `trial-dcab7983213d48c2a080001e4d2a1411`.
- Complete recovery: `recovery-0967db103a8c4a549c94c613f44d2407`.
- Exact report, raw recomputation and audit: `review-14510818fcb243e0883ee9ee4a0545b8`
  (`analysis.json`, `contrasts.csv`, `verification.json`, `timeout-evidence.json`,
  `report.md`, producer/reviewer snapshots and `seal.json`).

Current editorial revision: `report-v2.md` and `seal-v2.json` in the audit folder. The original report and seal remain retained.
