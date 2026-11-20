# Cleanup collector experiment

The runtime candidate was rejected. The retained runtime is byte-identical to
`matrix-fFpgAM/runtime-source.mjs`; the compiler is unchanged. Seven additional
mount-disposer regression tests are retained. This study does not update the
historical React/Svelte timing comparison or establish production readiness.

## Change and verdict

The candidate deferred creation of `cleanAll`'s error array until the first
exception, preserving callback order, falsey thrown values and nested aggregates.
The prior scope snapshot/reverse and mount disposal implementation were unchanged.
An earlier separate mount-release helper was discarded after delivery-only builds
grew by 38–46 gzip bytes (`matrix-kCrD4M`); it received no timing cohort.

The lazy collector reduced instrumented source-expression counts, but broad CPU
results were mixed and native allocation sampling did not establish consistent
savings. Small entries grew by 3–4 gzip bytes. This is insufficient evidence to
change the retained core.

## Protocol and evidence

Baseline: `matrix-fFpgAM` / `run-JnrvVQ`.
Rejected candidate: `matrix-ISrQ2M` / `run-ubLhD6`.
Evidence: `cleanup-array-study/final-587c0c293e1b4b9b998733bf4f9cb40d`.
The candidate passed 579 tests, check and build in 50 serial contained phases
(`test-runs/run-fa25c0884a234b3bbb33cbe0e74f7d21`). The restored runtime gate is
`test-runs/run-66aef17d832d4bf4a97c51c274d8e3c8`; its final result must be consulted.

All expensive phases ran serially in Windows Jobs: CPU 10%, commit 768 MiB,
24 processes, host free memory >=4 GiB, kill on owner close. Browser phases used
45-second wall/12-second idle limits; Node phases used 60/60 seconds. Edge
157.0.4341.42 ran headless with its sandbox enabled. No guard was relaxed.
The global core study used 16 paired cases (840 measured action windows); lists
used 8 paired cases (784 windows), including A/A controls and both AB/BA orders.
CPU below is trace ThreadTime for the small apps and TaskDuration with threadTicks
for lists. These are diagnostic measurements under the resource cap, not user
interaction latency or universal framework rankings. Positive changes are slower.

## Small-app CPU

Each cell contains baseline milliseconds → other milliseconds (percent change).
A/A rows expose variation in the same protocol.

| Group | Workload | Action | Order | Baseline → other ms (change) |
|---|---|---|---|---|
| aa | counter | mount | AB | 1.066 → 1.049 (-1.6%) |
| aa | counter | increment | AB | 0.917 → 0.882 (-3.8%) |
| aa | counter | unmount | AB | 0.833 → 0.839 (+0.7%) |
| aa | counter | mount | BA | 1.037 → 1.082 (+4.3%) |
| aa | counter | increment | BA | 0.912 → 0.976 (+7.0%) |
| aa | counter | unmount | BA | 0.934 → 0.871 (-6.7%) |
| candidate | counter | mount | AB | 1.014 → 0.928 (-8.5%) |
| candidate | counter | increment | AB | 0.905 → 0.880 (-2.8%) |
| candidate | counter | unmount | AB | 0.842 → 0.784 (-6.9%) |
| candidate | counter | mount | BA | 1.084 → 1.069 (-1.4%) |
| candidate | counter | increment | BA | 0.904 → 0.889 (-1.7%) |
| candidate | counter | unmount | BA | 0.825 → 0.856 (+3.8%) |
| aa | form | mount | AB | 1.461 → 1.391 (-4.8%) |
| aa | form | edit-one | AB | 1.247 → 1.213 (-2.7%) |
| aa | form | edit-all | AB | 1.226 → 1.177 (-4.0%) |
| aa | form | invalid | AB | 1.220 → 1.185 (-2.9%) |
| aa | form | recover | AB | 1.132 → 1.291 (+14.0%) |
| aa | form | unmount | AB | 0.921 → 0.908 (-1.4%) |
| aa | form | mount | BA | 1.256 → 1.372 (+9.2%) |
| aa | form | edit-one | BA | 1.252 → 1.145 (-8.5%) |
| aa | form | edit-all | BA | 1.168 → 1.240 (+6.2%) |
| aa | form | invalid | BA | 1.106 → 1.112 (+0.5%) |
| aa | form | recover | BA | 1.225 → 1.119 (-8.7%) |
| aa | form | unmount | BA | 0.864 → 0.858 (-0.7%) |
| candidate | form | mount | AB | 1.267 → 1.351 (+6.6%) |
| candidate | form | edit-one | AB | 1.082 → 1.192 (+10.2%) |
| candidate | form | edit-all | AB | 1.195 → 1.182 (-1.1%) |
| candidate | form | invalid | AB | 1.114 → 1.090 (-2.2%) |
| candidate | form | recover | AB | 1.165 → 1.125 (-3.4%) |
| candidate | form | unmount | AB | 0.926 → 0.899 (-2.9%) |
| candidate | form | mount | BA | 1.373 → 1.308 (-4.7%) |
| candidate | form | edit-one | BA | 1.134 → 1.090 (-3.9%) |
| candidate | form | edit-all | BA | 1.365 → 1.198 (-12.2%) |
| candidate | form | invalid | BA | 1.141 → 1.103 (-3.3%) |
| candidate | form | recover | BA | 1.107 → 1.113 (+0.5%) |
| candidate | form | unmount | BA | 0.879 → 0.898 (+2.2%) |
| aa | composition | mount | AB | 1.148 → 1.276 (+11.1%) |
| aa | composition | relay | AB | 0.946 → 1.046 (+10.6%) |
| aa | composition | unmount | AB | 0.862 → 0.899 (+4.3%) |
| aa | composition | mount | BA | 1.211 → 1.278 (+5.5%) |
| aa | composition | relay | BA | 0.993 → 1.046 (+5.3%) |
| aa | composition | unmount | BA | 0.882 → 0.890 (+0.9%) |
| candidate | composition | mount | AB | 1.180 → 1.216 (+3.1%) |
| candidate | composition | relay | AB | 1.017 → 0.971 (-4.5%) |
| candidate | composition | unmount | AB | 0.881 → 0.888 (+0.8%) |
| candidate | composition | mount | BA | 1.133 → 1.192 (+5.2%) |
| candidate | composition | relay | BA | 0.924 → 1.039 (+12.4%) |
| candidate | composition | unmount | BA | 0.828 → 0.931 (+12.4%) |
| aa | localized | mount | AB | 2.068 → 2.199 (+6.3%) |
| aa | localized | local-update | AB | 1.153 → 1.133 (-1.7%) |
| aa | localized | unmount | AB | 0.986 → 1.060 (+7.5%) |
| aa | localized | mount | BA | 1.829 → 1.811 (-1.0%) |
| aa | localized | local-update | BA | 1.042 → 1.010 (-3.1%) |
| aa | localized | unmount | BA | 0.876 → 0.911 (+4.0%) |
| candidate | localized | mount | AB | 1.875 → 1.913 (+2.0%) |
| candidate | localized | local-update | AB | 1.013 → 1.040 (+2.7%) |
| candidate | localized | unmount | AB | 0.944 → 0.875 (-7.3%) |
| candidate | localized | mount | BA | 1.952 → 1.956 (+0.2%) |
| candidate | localized | local-update | BA | 1.118 → 1.063 (-4.9%) |
| candidate | localized | unmount | BA | 0.918 → 0.993 (+8.2%) |

## List CPU

| Group | Rows | Action | Order | Baseline → other ms (change) |
|---|---:|---|---|---|
| aa | 100 | create | AB | 3.253 → 3.548 (+9.1%) |
| aa | 100 | create | BA | 4.019 → 3.600 (-10.4%) |
| aa | 100 | update | AB | 1.305 → 1.290 (-1.1%) |
| aa | 100 | update | BA | 1.577 → 1.251 (-20.7%) |
| aa | 100 | select | AB | 1.135 → 1.094 (-3.6%) |
| aa | 100 | select | BA | 1.127 → 1.087 (-3.5%) |
| aa | 100 | append | AB | 1.576 → 1.584 (+0.5%) |
| aa | 100 | append | BA | 1.625 → 1.513 (-6.9%) |
| aa | 100 | swap | AB | 1.335 → 1.271 (-4.8%) |
| aa | 100 | swap | BA | 1.606 → 1.384 (-13.8%) |
| aa | 100 | remove | AB | 1.567 → 1.510 (-3.6%) |
| aa | 100 | remove | BA | 1.500 → 1.638 (+9.2%) |
| aa | 100 | clear | AB | 1.326 → 1.141 (-14.0%) |
| aa | 100 | clear | BA | 1.213 → 1.189 (-2.0%) |
| aa | 1000 | create | AB | 22.034 → 23.436 (+6.4%) |
| aa | 1000 | create | BA | 19.431 → 20.347 (+4.7%) |
| aa | 1000 | update | AB | 3.649 → 3.424 (-6.2%) |
| aa | 1000 | update | BA | 3.334 → 3.395 (+1.8%) |
| aa | 1000 | select | AB | 1.977 → 2.119 (+7.2%) |
| aa | 1000 | select | BA | 2.037 → 2.092 (+2.7%) |
| aa | 1000 | append | AB | 4.691 → 4.156 (-11.4%) |
| aa | 1000 | append | BA | 4.272 → 4.236 (-0.8%) |
| aa | 1000 | swap | AB | 2.769 → 2.470 (-10.8%) |
| aa | 1000 | swap | BA | 2.606 → 2.616 (+0.4%) |
| aa | 1000 | remove | AB | 3.364 → 3.413 (+1.5%) |
| aa | 1000 | remove | BA | 3.094 → 3.376 (+9.1%) |
| aa | 1000 | clear | AB | 3.677 → 3.983 (+8.3%) |
| aa | 1000 | clear | BA | 3.453 → 3.535 (+2.4%) |
| change | 100 | create | AB | 3.254 → 3.490 (+7.3%) |
| change | 100 | create | BA | 3.662 → 3.269 (-10.7%) |
| change | 100 | update | AB | 1.284 → 1.230 (-4.2%) |
| change | 100 | update | BA | 1.254 → 1.231 (-1.8%) |
| change | 100 | select | AB | 1.086 → 1.116 (+2.8%) |
| change | 100 | select | BA | 1.021 → 1.059 (+3.7%) |
| change | 100 | append | AB | 1.558 → 1.554 (-0.3%) |
| change | 100 | append | BA | 1.430 → 1.500 (+4.9%) |
| change | 100 | swap | AB | 1.306 → 1.375 (+5.3%) |
| change | 100 | swap | BA | 1.273 → 1.312 (+3.1%) |
| change | 100 | remove | AB | 1.444 → 1.415 (-2.0%) |
| change | 100 | remove | BA | 1.360 → 1.573 (+15.7%) |
| change | 100 | clear | AB | 1.091 → 1.190 (+9.1%) |
| change | 100 | clear | BA | 1.145 → 1.219 (+6.5%) |
| change | 1000 | create | AB | 21.008 → 22.172 (+5.5%) |
| change | 1000 | create | BA | 18.846 → 20.386 (+8.2%) |
| change | 1000 | update | AB | 3.812 → 3.533 (-7.3%) |
| change | 1000 | update | BA | 3.308 → 3.443 (+4.1%) |
| change | 1000 | select | AB | 1.934 → 1.891 (-2.2%) |
| change | 1000 | select | BA | 2.036 → 1.921 (-5.6%) |
| change | 1000 | append | AB | 4.424 → 4.613 (+4.3%) |
| change | 1000 | append | BA | 4.155 → 4.798 (+15.5%) |
| change | 1000 | swap | AB | 2.805 → 2.463 (-12.2%) |
| change | 1000 | swap | BA | 2.477 → 2.682 (+8.3%) |
| change | 1000 | remove | AB | 3.301 → 3.360 (+1.8%) |
| change | 1000 | remove | BA | 3.182 → 3.213 (+1.0%) |
| change | 1000 | clear | AB | 3.409 → 3.774 (+10.7%) |
| change | 1000 | clear | BA | 3.318 → 3.346 (+0.8%) |

## Memory, delivery and allocation diagnostics

Mounted post-GC heap deltas were identical: counter 1,712 bytes; form 7,560;
composition 4,840; localized updates 36,512. Live heap does not measure transient
allocation. Entry gzip bytes changed: counter 1,503→1,507; form 2,103→2,106;
composition 1,854→1,857; localized updates 1,709→1,712. Generated fixture filenames
can affect compression; these are observed delivery sizes.

The private source-instrumented probe passed 26 rows. Successful unmount collector
array counts changed counter 2→0, form 3→0, composition 2→0, localized 2→0;
list clear 100→0 / 1,000→0; list unmount 204→0 / 2,004→0. Calls were unchanged.
Each tested throwing path retained 2 collector arrays in both implementations.
Only `cleanAll` was counted: snapshots and other region collectors remain.
Instrumentation can alter optimization and does not measure actual V8 bytes.

A separate uninstrumented native probe prepared 4,000 real scopes, each with two
callbacks, warmed three batches, then sampled disposal with interval 128 and both
collected-object options enabled, followed by GC. Six fresh pages ran ABBAAB.
Scope `splice` samples were a positive control. Inlining can omit function frames:
all six final profiles attributed zero bytes directly through `cleanAll` stacks.
Total sampled bytes were baseline [136076,133108,140324], candidate
[219088,140152,139644]. Splice samples remained approximately 123–130 KiB.
This isolated sampling result does not establish a reduction, exact allocated
bytes, or whole-application memory behavior. Raw profiles are retained in
`cleanup-array-study/sampling-33e00c2314cd448d880fdc40d259174f`.
The first attempt stopped on an overly frame-specific positive-control assertion;
its evidence is preserved in `sampling-3b1b5d29c3a241af8c96f907eefbd536`.
The corrected control requires actual splice samples, allowing inlined frames;
the workloads and containment limits were unchanged.

## Correctness and retained coverage

The candidate native probe passed nine named checks, including owner-before-DOM
cleanup, falsey thrown values, first DOM-removal failure, nested aggregate order,
idempotence, detached caption WeakRefs and reactive positive controls. Detached
literal captions were collectible before disposal; reactive controls remained
until disposal; all were collectible afterward. Public matrix/list preflights
also passed. Native candidate evidence does not imply a new comparative speed win.

Seven public regression tests add falsey owner failures, simultaneous DOM failures,
first-removal stop behavior and nested AggregateError identity/order. They exercise
the restored implementation as well as the rejected candidate. Existing LIFO,
reentrancy, ownership release and retention tests remain intact.

No React/Svelte timing cohort was refreshed. Future work should target a measured
cost that survives optimization and improves several workloads, while preserving
Surface semantics and observable cleanup behavior.
