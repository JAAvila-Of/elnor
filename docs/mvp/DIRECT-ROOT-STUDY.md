# Direct roots and exclusive teardown study

The retained candidate constructs eligible keyed rows as detached root elements and releases verified exclusive-region owners directly. It removes temporary fragment bookkeeping while preserving Surface syntax, native listeners, separate expression effects, live readonly props, keyed identity and external mount disposers.

## Eligibility and lifecycle

A direct row must have exactly one container root. Descendants may be containers, text, buttons or inputs. Slots, conditional/list blocks, child components and multiple roots retain the existing fragment path. The ordinary graph compiler propagates the proven shape of imported views. No benchmark file name, row count or model property is special-cased.

The root has no staging parent until reconciliation inserts it. Root element creation, expression reads, effect installation and listener registration remain staged in source order; later siblings are not created early. The runtime validates a detached Element, owns it through the existing row scope, and releases subscriptions/listeners on partial failure. Public mount still preserves prior target children and returns a disposer.

Exclusive clearing keeps its existing actual-root and recursive native-cleanup checks. It attempts every row owner, collects errors in order, and performs the collective DOM removal in finally. User cleanup callbacks or foreign siblings retain ordinary teardown. This removes wrapper callbacks and arrays that previously attempted suppressed per-row DOM removals.

## Profiling and rejected alternatives

Diagnostic counters and 4096-byte heap sampling ran separately from timings. Counters count explicit constructor/method calls, not total allocation bytes. Heap sampling perturbs execution and reports a sample of live objects by default; it does not establish peak memory, exact allocation percentages or CPU causality. See [CDP HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/).

The original reactive probe found 1000 cells/scopes, 2000 effects and 2000 dependency Sets for creation of 1000 rows; every new effect read one cell. Both inline-edge variants eliminated those dependency Set constructions but regressed large creation, so they were removed. A shared-run-method variant was also removed. The active runtime retains its original effect and dependency representation.

Reactive profiles: `diagnostics/run-7d2ff29258ee4a119826ad2f63f67793` and `diagnostics/run-b347e0b242ec48eaa4df2ea7176714fa`. The worker rejects allocation-instrumented fixtures for timing; fault injection `diagnostics/run-b542fa8df9954511bd643d60be27c168` verified rejection before browser launch and zero remaining owned processes.

DOM profiles `diagnostics/run-dc2ed09d35da4e66aac97e073c45812a` and `diagnostics/run-9acf35160c0147fb8fe072483aca5d6c` confirmed that 1000-row creation changes from 1000 fragment constructions/appends to zero, while both variants construct 3000 elements and 2000 Text nodes. Appending 100 rows removes 100 fragment constructions/appends. These are JS-visible DOM call counts, not a comparison of all native allocations across frameworks.

## Timing protocol

All tables report renderer CPU TaskDuration medians in ms using threadTicks, two warmups and seven measured rounds per fresh process. Four-process studies have 28 samples per operation/variant and balanced order; confirmation has two processes, 14 samples and reversed second order. Each case uses sandboxed headless Edge, GPU disabled, 10% aggregate Job CPU, 768 MiB commit, 24 processes, 45 seconds wall time and a 12-second progress deadline. Controls/shared assets, collector hashes, browser identity and zero owned processes after cleanup are checked by the summary tool. Compare variants within each table; do not combine different cohorts or clocks into a new speedup.

Source and data identifiers below are relative to `elnor/.elnor/mvp/framework-comparison/`. Raw summaries retain min/max and per-process medians. Small differences and changing rank against Svelte/React do not establish general superiority.

## Inline single-dependency storage — rejected

Fixture `run-F0wHX0`; study `studies/run-ea461bf80ae744e6b7dc3358a64aba16`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.426 | 3.156 | 3.094 | 3.125 |
| 100 | Update | 1.241 | 1.207 | 1.403 | 1.213 |
| 100 | Select | 1.071 | 1.053 | 1.237 | 1.088 |
| 100 | Append | 1.487 | 1.465 | 1.683 | 1.434 |
| 100 | Swap | 1.278 | 1.239 | 3.091 | 1.281 |
| 100 | Remove | 1.403 | 1.415 | 1.618 | 1.435 |
| 100 | Clear | 1.163 | 1.080 | 1.247 | 1.106 |
| 1000 | Create | 20.563 | 21.874 | 17.277 | 17.388 |
| 1000 | Update | 3.350 | 3.426 | 3.967 | 3.422 |
| 1000 | Select | 1.980 | 1.898 | 2.604 | 1.980 |
| 1000 | Append | 4.544 | 4.272 | 4.601 | 4.263 |
| 1000 | Swap | 2.515 | 2.412 | 20.274 | 2.420 |
| 1000 | Remove | 3.303 | 3.110 | 3.991 | 3.236 |
| 1000 | Clear | 3.358 | 3.155 | 3.566 | 2.808 |

## Compact getter with single-dependency storage — rejected

Fixture `run-oK1J7Q`; study `studies/run-2f67144eca7c4985bf0eb99076a96a61`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.606 | 3.325 | 3.364 | 3.382 |
| 100 | Update | 1.324 | 1.328 | 1.612 | 1.322 |
| 100 | Select | 1.180 | 1.106 | 1.408 | 1.190 |
| 100 | Append | 1.626 | 1.569 | 1.936 | 1.706 |
| 100 | Swap | 1.377 | 1.343 | 3.468 | 1.407 |
| 100 | Remove | 1.492 | 1.450 | 1.844 | 1.556 |
| 100 | Clear | 1.225 | 1.258 | 1.438 | 1.251 |
| 1000 | Create | 19.693 | 24.997 | 18.760 | 18.811 |
| 1000 | Update | 3.454 | 3.662 | 4.094 | 3.316 |
| 1000 | Select | 2.001 | 2.091 | 2.702 | 1.983 |
| 1000 | Append | 4.237 | 4.584 | 4.752 | 4.472 |
| 1000 | Swap | 2.447 | 2.691 | 19.388 | 2.470 |
| 1000 | Remove | 3.196 | 3.426 | 4.099 | 3.220 |
| 1000 | Clear | 3.186 | 3.325 | 3.844 | 2.786 |

## Shared effect execution method — rejected

Fixture `run-2tIREH`; study `studies/run-3a77df640980467d80c2555172e1ba96`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.518 | 3.285 | 3.133 | 3.319 |
| 100 | Update | 1.214 | 1.219 | 1.420 | 1.291 |
| 100 | Select | 1.076 | 1.094 | 1.254 | 1.105 |
| 100 | Append | 1.519 | 1.528 | 1.705 | 1.559 |
| 100 | Swap | 1.297 | 1.276 | 3.212 | 1.308 |
| 100 | Remove | 1.437 | 1.433 | 1.622 | 1.437 |
| 100 | Clear | 1.158 | 1.091 | 1.292 | 1.102 |
| 1000 | Create | 19.928 | 20.505 | 17.855 | 19.094 |
| 1000 | Update | 3.404 | 3.404 | 4.058 | 3.391 |
| 1000 | Select | 2.025 | 2.035 | 2.660 | 1.969 |
| 1000 | Append | 4.232 | 4.407 | 4.627 | 4.198 |
| 1000 | Swap | 2.431 | 2.430 | 19.567 | 2.528 |
| 1000 | Remove | 3.225 | 3.231 | 3.822 | 3.302 |
| 1000 | Clear | 3.360 | 3.346 | 3.739 | 2.651 |

## Direct roots before teardown refinement — intermediate

Fixture `run-j43JYM`; study `studies/run-feed91e11559471b829dff64eee34561`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.313 | 3.154 | 3.180 | 3.206 |
| 100 | Update | 1.270 | 1.228 | 1.441 | 1.310 |
| 100 | Select | 1.089 | 1.080 | 1.300 | 1.102 |
| 100 | Append | 1.542 | 1.500 | 1.700 | 1.494 |
| 100 | Swap | 1.282 | 1.293 | 3.203 | 1.299 |
| 100 | Remove | 1.434 | 1.371 | 1.618 | 1.424 |
| 100 | Clear | 1.181 | 1.148 | 1.305 | 1.094 |
| 1000 | Create | 20.271 | 19.528 | 17.819 | 18.966 |
| 1000 | Update | 3.455 | 3.362 | 4.057 | 3.566 |
| 1000 | Select | 1.958 | 1.948 | 2.691 | 2.030 |
| 1000 | Append | 4.400 | 4.369 | 4.664 | 4.342 |
| 1000 | Swap | 2.517 | 2.453 | 20.516 | 2.503 |
| 1000 | Remove | 3.312 | 3.090 | 4.124 | 3.283 |
| 1000 | Clear | 3.240 | 3.537 | 3.655 | 2.523 |

## Direct roots and owner teardown — retained

Fixture `run-OLDLti`; study `studies/run-fd9b786820c4433da868e648468b4a22`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.393 | 3.212 | 3.260 | 3.168 |
| 100 | Update | 1.266 | 1.257 | 1.467 | 1.297 |
| 100 | Select | 1.072 | 1.058 | 1.322 | 1.128 |
| 100 | Append | 1.495 | 1.493 | 1.736 | 1.579 |
| 100 | Swap | 1.296 | 1.303 | 3.218 | 1.340 |
| 100 | Remove | 1.401 | 1.441 | 1.696 | 1.458 |
| 100 | Clear | 1.168 | 1.061 | 1.289 | 1.131 |
| 1000 | Create | 19.769 | 18.882 | 18.091 | 18.544 |
| 1000 | Update | 3.396 | 3.361 | 3.961 | 3.346 |
| 1000 | Select | 1.972 | 1.962 | 2.676 | 2.050 |
| 1000 | Append | 4.354 | 4.346 | 4.751 | 4.211 |
| 1000 | Swap | 2.496 | 2.413 | 20.022 | 2.397 |
| 1000 | Remove | 3.183 | 3.152 | 4.062 | 3.173 |
| 1000 | Clear | 3.329 | 3.032 | 3.631 | 2.579 |

## Independent confirmation of retained candidate

Fixture `run-OLDLti`; study `studies/run-e27e1dc4ea8940cdaf42c21446345359`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.438 | 2.890 | 3.091 | 3.030 |
| 100 | Update | 1.256 | 1.127 | 1.338 | 1.175 |
| 100 | Select | 1.046 | 0.968 | 1.191 | 1.031 |
| 100 | Append | 1.556 | 1.392 | 1.568 | 1.429 |
| 100 | Swap | 1.288 | 1.167 | 3.091 | 1.204 |
| 100 | Remove | 1.427 | 1.356 | 1.566 | 1.391 |
| 100 | Clear | 1.103 | 0.959 | 1.206 | 1.015 |
| 1000 | Create | 19.420 | 16.939 | 17.108 | 17.269 |
| 1000 | Update | 3.123 | 3.121 | 3.765 | 3.084 |
| 1000 | Select | 1.844 | 1.804 | 2.501 | 1.914 |
| 1000 | Append | 4.101 | 4.000 | 4.475 | 3.851 |
| 1000 | Swap | 2.319 | 2.252 | 19.536 | 2.240 |
| 1000 | Remove | 2.895 | 2.937 | 3.724 | 2.935 |
| 1000 | Clear | 2.951 | 2.820 | 3.899 | 2.298 |

## Retained result and limits

Creation and clear improve against the previous retained base in both the four-process study and confirmation. Their magnitudes differ; these are descriptive synthetic-list results, not accepted product parity or an isolated attribution to each subchange. Clear still trails Svelte at 1000 rows. Some other operations have small adverse differences, and rank against framework controls changes between cohorts.

Creation/clear per-process CPU medians for the retained studies:

- `run-fd9b786820c4433da868e648468b4a22` create: `{'baseline': [19.074, 18.946, 20.999, 19.02], 'candidate': [18.869, 18.895, 18.804, 19.109]}`
- `run-fd9b786820c4433da868e648468b4a22` clear: `{'baseline': [3.677, 3.251, 3.648, 3.161], 'candidate': [3.025, 2.98, 3.257, 2.867]}`
- `run-e27e1dc4ea8940cdaf42c21446345359` create: `{'baseline': [18.289, 22.638], 'candidate': [16.046, 17.065]}`
- `run-e27e1dc4ea8940cdaf42c21446345359` clear: `{'baseline': [2.871, 3.68], 'candidate': [2.818, 2.883]}`

## First creation, memory and delivery

Each cold study uses zero warmups, four fresh processes per variant and alternating order. It measures first row creation after an empty mount, not network load, module evaluation or page startup.

Cold study `cold-studies/run-7c49bf4f45aa4750b2f8522a29c08701`:

- baseline: CPU values `[26.554, 39.883, 26.094, 33.861]`, median `30.207` ms.
- candidate: CPU values `[45.007, 39.147, 23.671, 23.775]`, median `31.461` ms.

Cold study `cold-studies/run-fb71cc0293f24c5a98c8322be3c15ad0`:

- baseline: CPU values `[39.981, 33.422, 27.062, 37.385]`, median `35.404` ms.
- candidate: CPU values `[25.067, 26.607, 25.973, 41.125]`, median `26.290` ms.

Cold medians change direction across these studies and ranges overlap substantially; no general first-creation win is accepted.


Forced-GC observations (one process per variant; not peak memory or a repeated memory comparison):

| Variant | Phase | JS heap bytes | DOM nodes | Listeners |
|---|---|---:|---:|---:|
| baseline | empty | 1302436 | 36 | 19 |
| baseline | 1000-rows | 3220216 | 5036 | 1019 |
| baseline | cleared | 1507756 | 36 | 19 |
| baseline | unmounted | 1479864 | 12 | 13 |
| baseline | after-3-mount-dispose-cycles | 1512764 | 12 | 13 |
| candidate | empty | 1303040 | 36 | 19 |
| candidate | 1000-rows | 3219540 | 5036 | 1019 |
| candidate | cleared | 1506340 | 36 | 19 |
| candidate | unmounted | 1478292 | 12 | 13 |
| candidate | after-3-mount-dispose-cycles | 1511180 | 12 | 13 |

- Memory evidence for baseline: `diagnostics/run-faef902897d64822af616241ed29767a`.
- Memory evidence for candidate: `diagnostics/run-e9ada1002ed84c0693e9e44f7757de9d`.

Bundle sizes (Elnor comparison bundle only):

| Variant | Raw bytes | gzip bytes | Brotli bytes |
|---|---:|---:|---:|
| baseline | 6245 | 2788 | 2500 |
| candidate | 6766 | 2914 | 2626 |

## Verification

Check/build and **508 Node tests across 39 files** passed in `test-runs/run-c37032df5014499aa8f9a06595c40d67`. Preflight `diagnostics/run-e7ac910bda2e457f9a68d2780afac439` passed all 42 framework/size/action checks. The new tests cover inline/imported eligibility, all conservative fallbacks, keyed events/disposal, partial failures, invalid roots, prior target nodes, error aggregation, dynamic dependencies, callback receiver and external owners.

Active runtime/compiler hashes were checked against the retained fixture while producing this report:

- Runtime: `acdbdcae1826b1b4805f36fb3a0be1d16d5d6ea2afdc9fabfdbbfedd85e7645d`
- Compiler: `3920447ad2670f323dada62e8e6847f7aec71b4c28e45c20b877f7a796f46ae3`

The exact report producer is retained under `reports/direct-roots/producer.py`. Source grammar, TypeScript integration and external mount API remain unchanged. Broader workloads, browser/platform coverage, cold/memory repeats and accepted performance margins remain open.
