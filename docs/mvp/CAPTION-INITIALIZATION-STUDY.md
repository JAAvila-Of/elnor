# Caption initialization and literal emission

**Later implementation follow-up:** [separate literal helpers](SPLIT-CAPTION-HELPERS.md)
preserve this allocation optimization and restore the original dynamic helpers.
The measurements and optional-hint implementation below describe the frozen
source from this study; its prior document revision is retained internally.

Reviewed 2026-11-12. **Retained as a supported-MVP allocation and compiler-work optimization. No CPU speedup or competitive parity is established.**

The compiler recognizes selected closed primitive captions with the TypeScript AST. It emits their values directly, bypassing binding rewrites that cannot change a literal. A conservative prefix check avoids parsing obvious identifiers. Property reads, calls, concatenations, assertions and other expressions retain ordinary rewriting and reactivity. Surface syntax is unchanged.

The runtime initializes these captions through its existing ownership registration. A small activation callback cancels the initial write when registration disposes immediately. The callback has its own context and captures no Text node or read function. Native and foreign owners use the same `own` protocol; no new owner properties or scope fields are queried. Ordinary four-argument calls remain covered, and the optional fifth argument is a compiler-only hint. Dynamic conversion, external-text repair, listener cleanup, registration errors and LIFO order remain tested.

This replaces the rejected ownership check described in [the first literal study](LITERAL-CAPTION-STUDY.md). The earlier candidate stays rejected.

## Functional checks

The final source passes **570 Node tests across 48 files, check and build: 50 serial contained phases**. Fifteen literal tests cover primitive normalization, disposed/native/foreign/overridden/proxy owners, ownerless calls, exact registration errors, LIFO/listeners, escapes, templates, null, numbers and shadowed `undefined`. The five existing owner regression tests remain.

The four native expanded preflights perform 45 framework/action checks. The list preflight performs 42 checks across 100/1000 rows and Elnor/React/Svelte. A separate Edge probe passes seven ownership/conversion cases and a controlled GC check: two isolated activation callbacks do not retain detached Text nodes before disposal, while two ordinary reactive controls do; all four release them after disposal. Button listener cleanup still owns its button until cleanup; the probe isolates the caption callback. These are bounded checks, not a proof of no leaks.

## Constructor counts and delivery

Counts come from instrumented diagnostic copies with a fake DOM, equal initial visible output and empty roots after disposal. They are constructor calls, not allocated bytes or CPU timings. Cells, scopes and cleanup registrations are unchanged. The activation callback replaces an effect cleanup; it is not free. `scope()` is byte-identical to the baseline.

| Workload | Effects / dependency Sets, baseline → final | Cleanup registrations | Entry gzip bytes, baseline → final |
|---|---:|---:|---:|
| counter | 3 → 1 | 4 | 1441 → 1508 |
| form | 12 → 11 | 19 | 2042 → 2101 |
| composition | 12 → 3 | 13 | 1794 → 1862 |
| localized | 73 → 48 | 97 | 1652 → 1718 |

Other zero-dependency effects remain, including property-based captions. Delivery increases are a measured tradeoff, not a bundle-size improvement.

## Compiler work

The count-only generation probe verifies the following rewrite invocations. Each source component is compiled once; the localized Leaf is instantiated 24 times in the runtime workload. These figures are not elapsed-time improvements.

| Workload | Source components | Binding rewrite passes, baseline → final |
|---|---:|---:|
| counter | 1 | 6 → 4 |
| form | 1 | 13 → 11 |
| composition | 8 | 28 → 19 |
| localized | 2 | 31 → 29 |

An earlier warm generation probe showed coarse CPU steps, zero-valued short samples and large A/A variation. It is retained as a limited diagnostic and supplies no accepted compiler speedup, cold build or editor feedback latency result.

## Expanded paired CPU

The final cohort has 16 browser cases: four workloads × baseline A/A and baseline/final × AB/BA. Each action has two warmup rounds and seven measured rounds per label: 840 measured windows. Visible isolated pages alternate, with values, identities and equal DOM schemas verified. The table uses renderer **ThreadTime milliseconds**. A/A percentages describe variability; they are neither subtracted nor an acceptance margin. All actions are included.

| Workload / action | AB baseline → final ms | BA baseline → final ms | A/A difference AB / BA |
|---|---:|---:|---:|
| counter / mount | 0.968 → 0.894 | 1.010 → 0.975 | +1.7% / -1.8% |
| counter / increment | 1.022 → 0.911 | 0.956 → 0.897 | -7.9% / +1.5% |
| counter / unmount | 0.770 → 0.747 | 0.829 → 0.858 | -0.6% / +5.5% |
| form / mount | 1.777 → 2.102 | 1.907 → 1.603 | -7.1% / -23.6% |
| form / edit-one | 1.801 → 1.914 | 1.749 → 1.814 | -10.1% / -5.1% |
| form / edit-all | 2.006 → 1.974 | 1.893 → 1.910 | +1.6% / -8.4% |
| form / invalid | 1.851 → 1.825 | 1.825 → 1.880 | -9.9% / -5.0% |
| form / recover | 1.372 → 1.504 | 1.548 → 1.611 | -7.3% / -2.4% |
| form / unmount | 1.019 → 0.991 | 1.040 → 1.026 | -21.2% / +3.4% |
| composition / mount | 1.336 → 1.240 | 1.206 → 1.210 | -2.6% / +4.8% |
| composition / relay | 1.097 → 1.052 | 1.007 → 1.029 | -4.1% / +10.1% |
| composition / unmount | 0.954 → 0.935 | 0.961 → 0.956 | -3.4% / -3.1% |
| localized / mount | 2.183 → 2.188 | 2.075 → 2.086 | +3.6% / +4.5% |
| localized / local-update | 1.427 → 1.207 | 1.518 → 1.308 | +18.7% / +104.3% |
| localized / unmount | 1.092 → 1.067 | 1.087 → 1.116 | -8.9% / +18.6% |

CPU results are mixed. This work does not assert equivalence, statistical significance, a global speedup or a new React/Svelte timing ranking. Startup is excluded, and frame windows are not presented as application latency.

## Expanded retained heap

Separate post-timing probes use eight interacted mount/unmount cycles per label in each workload: 64 cycles. Values below are mounted GC heap above each loaded, unmounted baseline, including driver/browser behavior. DOM nodes and listeners return to baseline after every cycle. Some post-cycle heap growth remains; these deltas are not allocated bytes or proof of no leak.

| Workload | Baseline bytes | Final bytes |
|---|---:|---:|
| counter | 2120 | 1720 |
| form | 7772 | 7560 |
| composition | 6732 | 4848 |
| localized | 41320 | 36704 |

## Lists and the rejected default-parameter variant

The final list cohort has eight action-interleaved browser cases, candidate A/A and baseline/final in both orders at both sizes: 784 measured windows. Keyed identity, expected values and post-timing schema equality pass. Separate AX observations are retained; AX is not subtracted. The existing list protocol reports **TaskDuration milliseconds with threadTicks**, distinct from the ThreadTime table above.

| Rows / action | AB baseline → final ms | BA baseline → final ms | A/A difference AB / BA |
|---|---:|---:|---:|
| 100 / create | 8.212 → 7.811 | 8.689 → 8.239 | -5.2% / -3.3% |
| 100 / update | 1.927 → 1.828 | 1.717 → 1.849 | -3.9% / -0.5% |
| 100 / select | 1.244 → 1.263 | 1.271 → 1.267 | -9.2% / +11.5% |
| 100 / append | 2.471 → 2.310 | 2.401 → 2.467 | +1.2% / -5.3% |
| 100 / swap | 1.692 → 1.715 | 1.792 → 1.763 | +10.2% / -3.4% |
| 100 / remove | 2.540 → 2.088 | 2.089 → 2.236 | -17.2% / -14.7% |
| 100 / clear | 2.386 → 2.293 | 2.231 → 2.142 | +3.2% / +0.6% |
| 1000 / create | 74.386 → 70.766 | 100.066 → 103.302 | +0.7% / -0.2% |
| 1000 / update | 6.072 → 6.942 | 8.329 → 8.081 | +18.9% / -4.9% |
| 1000 / select | 2.079 → 2.184 | 2.475 → 2.282 | +28.1% / -14.7% |
| 1000 / append | 10.974 → 10.228 | 10.473 → 10.214 | -3.4% / -3.9% |
| 1000 / swap | 3.521 → 3.492 | 3.519 → 3.477 | +4.6% / -1.3% |
| 1000 / remove | 6.972 → 7.397 | 7.066 → 7.419 | -7.8% / +6.6% |
| 1000 / clear | 10.205 → 9.669 | 13.441 → 10.917 | +6.3% / -10.6% |

An earlier version used `literal=false` in two runtime signatures. Its small-app heap fell, but the global check found a roughly 32 KiB penalty with 1000 rows and higher removal CPU in one cohort. That version is not retained. An isolated runtime changing only those two initializers reduced mounted heap by 32752 bytes. Final helpers omit the initializers and document optionality with JSDoc. This observation does not prove why CPU changed.

A separate native GC diagnostic compares the following single-context observations. Small differences include loaded code, JIT and driver behavior; they are not heap confidence intervals. Nodes/listeners agree, return after clear, and agree again after unmount/cycles.

| Phase | Baseline heap bytes | Rejected defaults bytes | Final heap bytes |
|---|---:|---:|---:|
| empty | 1303996 | 1299060 | 1298804 |
| 1000-rows | 3235824 | 3266872 | 3233540 |
| cleared | 1508752 | 1504188 | 1502636 |
| unmounted | 1480068 | 1481164 | 1480064 |
| after-3-mount-dispose-cycles | 1512292 | 1517460 | 1516452 |

## Evidence and limits

All expensive phases are serial, under the existing Windows Job controls: CPU 10%, commit 768 MiB, 24 processes, host free memory at least 4 GiB, browser wall/idle 45/12 seconds, Node build/test limits 60/60 seconds, and owned process cleanup. No limit or coverage was reduced.

The strict readers validate raw samples, order, clocks, assets, source identities and supervisors. The list reader explicitly pins this compiler/runtime pair; the historical runtime-only reader remains unchanged. Earlier studies are retained separately and never pooled with the final cohort.

- Final source fixtures: `matrix-CPpXYS` and `run-MrFoKU`.
- Final gate: `test-runs/run-18c253a9b9754b8ba3100eafb00f1c56`.
- Expanded pairs: `core-studies/run-16511b9d310f4ad3af5d2c08ce55d05c`.
- List pairs: `interleaved-studies/run-5113be59bbdf4624858d97069c81e0ff`.
- Complete producer, counts, rewrite probe, native checks, GC and verification: `caption-registration-study/final-87d91b50d892464d93dca01a7a48424a`.
- Previous defaults cohort: `caption-registration-study/final-cb7df5210e4b406fb739fe081fac141f`; initial cohort and form-only follow-up remain under the same study parent.
- Workspace-relative evidence paths are under `elnor/.elnor/mvp/framework-comparison`; they are internal, not public downloads.

This is a supported-MVP core step. Competitive CPU acceptance margins, representative applications/devices, fresh competitor timings, independent human DX and production readiness remain open.
