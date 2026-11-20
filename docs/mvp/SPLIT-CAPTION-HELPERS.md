# Separate helpers for literal captions

Reviewed 2026-11-12. **Retained for separate compiler entrypoints, the original dynamic API/code path and measured delivery benefits. No global CPU speedup or parity is established.**

This follows [caption initialization](CAPTION-INITIALIZATION-STUDY.md). The baseline is the previously retained `matrix-CPpXYS` / `run-MrFoKU`, not the older pre-specialization core. The compiler now selects `literalText` / `literalButton` for AST-proven primitive captions and `text` / `button` for other expressions. The literal binding-rewrite shortcut remains. Surface syntax is unchanged.

`text` and `button` recover their original four parameters and exact function bodies. The ordinary path contains no literal flag or dispatch branch. The literal helpers retain the separate activation context, cancellation through `own`, normalization and native listener cleanup. Scopes gain no fields or checks. Generated modules and their matching runtime are published together; frozen builds retain their own runtime.

## Verification

The complete gate passes **572 Node tests, check and build in 50 serial phases**. Two new end-to-end name-collision cases exercise actions named after the inserted literal-helper aliases, alongside the existing literal, ownership, conversion and cleanup tests.

Native checks retain the four expanded preflights (45 framework/action checks), list preflight (42 checks at 100/1000 rows), seven ownership/conversion checks and a controlled GC probe. Isolated literal activation callbacks release detached Text nodes before disposal; reactive controls retain them until disposal. All four release after disposal. This does not claim that a live button listener releases its button before cleanup or prove absence of leaks.

Two earlier gate attempts remain failed: one refused launch below the 4 GiB host-free floor, and a retry passed check before its build was terminated for host-memory-pressure. The supervisor left no owned processes after termination. After memory recovered, a fresh full gate completed. Limits and coverage were unchanged.

## Work and delivery

Diagnostic copies confirm equal effects, dependency Sets, cells, scopes, cleanup registrations and initial visible output. Binding rewrite counts also remain 4/11/19/29 for counter/form/composition/localized. The earlier allocation optimization is preserved; these counts are not a new allocation reduction. Scope and dynamic-helper source blocks are checked against the original implementation.

| Workload | Effects, before → split | Cleanup registrations | Entry gzip bytes, before → split | Brotli bytes, before → split |
|---|---:|---:|---:|---:|
| counter | 1 → 1 | 4 | 1508 → 1503 | 1322 → 1316 |
| form | 11 → 11 | 19 | 2101 → 2103 | 1837 → 1839 |
| composition | 3 → 3 | 13 | 1862 → 1854 | 1632 → 1630 |
| localized | 48 → 48 | 97 | 1718 → 1709 | 1504 → 1478 |

These small entry-size changes are specific to the frozen builds, including their diagnostic filename strings. They are not a universal per-helper saving.

Supplemental checked Surface controls isolate fully literal and fully property-based captions. Both variants are bundled with the same minification settings and logical source filename. They test delivery shapes, not runtime speed or representative application weights.

| Delivery control | Raw bytes, before → split | Gzip bytes, before → split | Brotli bytes, before → split |
|---|---:|---:|---:|
| static-only | 2383 → 1916 | 1044 → 874 | 911 → 764 |
| dynamic-only | 2380 → 2210 | 1046 → 979 | 914 → 863 |

## Expanded CPU: all actions

Sixteen fresh-browser pairs cover four workloads, baseline A/A and before/split in AB/BA, with two warmup and seven measured rounds per action/label: 840 measured windows. Pages alternate while visible, and values, identity and equal DOM schemas are checked. The table uses renderer **ThreadTime milliseconds**. A/A differences describe variability; they are not subtracted or used as an acceptance margin.

| Workload / action | AB before → split ms | BA before → split ms | A/A difference AB / BA |
|---|---:|---:|---:|
| counter / mount | 1.141 → 0.972 | 1.073 → 1.078 | +1.3% / -7.3% |
| counter / increment | 1.073 → 1.070 | 1.015 → 1.169 | -9.3% / +5.8% |
| counter / unmount | 0.995 → 0.926 | 0.912 → 0.940 | +9.7% / +3.1% |
| form / mount | 1.907 → 1.938 | 1.930 → 1.979 | -10.3% / +4.0% |
| form / edit-one | 1.913 → 2.019 | 1.708 → 2.019 | +12.5% / -4.5% |
| form / edit-all | 2.223 → 1.965 | 1.957 → 2.011 | +3.2% / +3.9% |
| form / invalid | 1.843 → 1.836 | 1.714 → 1.808 | +2.1% / +1.7% |
| form / recover | 1.637 → 1.714 | 1.568 → 1.598 | -7.2% / +3.5% |
| form / unmount | 1.059 → 1.111 | 0.956 → 0.999 | -4.9% / +7.2% |
| composition / mount | 1.165 → 1.129 | 1.223 → 1.260 | -1.7% / +1.6% |
| composition / relay | 0.964 → 1.070 | 0.921 → 1.319 | -14.2% / +3.6% |
| composition / unmount | 0.837 → 0.813 | 0.943 → 0.905 | +4.2% / -5.9% |
| localized / mount | 2.122 → 2.115 | 2.506 → 2.452 | +10.1% / -3.2% |
| localized / local-update | 1.315 → 1.254 | 1.450 → 1.367 | -9.8% / -5.4% |
| localized / unmount | 1.203 → 1.145 | 1.199 → 1.222 | -13.3% / +4.1% |

## Composition follow-up

The initial relay medians rose by +11.0% AB and +43.2% BA. A separate four-pair composition follow-up keeps the same fixtures, A/A and both orders. It is not pooled with the full cohort. Its relay difference changes direction, with substantial A/A variation. This does not establish either a regression or equivalence.

| Follow-up action | AB before → split ms | BA before → split ms | A/A difference AB / BA |
|---|---:|---:|---:|
| mount | 1.241 → 1.158 | 1.251 → 1.375 | +14.3% / +20.1% |
| relay | 1.219 → 1.000 | 1.155 → 1.372 | +7.7% / +22.5% |
| unmount | 0.914 → 0.880 | 0.952 → 0.969 | -4.7% / +1.7% |

A separate instrumented fake-DOM relay probe checks three successive updates. Both versions execute two effects, issue one notification and enqueue two edges per update, with equal visible output and complete disposal. These are work counts, not attribution of browser CPU. The first follow-up reader correctly refused a mismatched schema identifier; its declared input kind was corrected to the producer, preserving every other check and the original reader revision. Raw data were unchanged.

## Retained heap

Eight post-timing interacted mount/unmount cycles per label and workload give 64 cycles. DOM nodes/listeners return to baseline each time. Mounted GC heap above the loaded, unmounted baseline is:

| Workload | Before bytes | Split bytes |
|---|---:|---:|
| counter | 1720 | 1712 |
| form | 7560 | 7560 |
| composition | 4848 | 4840 |
| localized | 36704 | 36512 |

Differences are small and include loaded code, JIT and driver behavior. They are not allocated-byte measurements or proof of no leak.

A separate single-context 1000-row GC diagnostic retains these values. The before context is the prior study with the same protocol; these are not confidence intervals.

| Phase | Before heap bytes | Split heap bytes |
|---|---:|---:|
| empty | 1298804 | 1299056 |
| 1000-rows | 3233540 | 3233256 |
| cleared | 1502636 | 1502008 |
| unmounted | 1480064 | 1480540 |
| after-3-mount-dispose-cycles | 1516452 | 1518392 |

## List CPU: all actions

Eight browser pairs retain candidate A/A, before/split, both orders and 100/1000 rows: 784 measured windows. Keyed identity and expected values pass. This existing protocol reports **TaskDuration milliseconds with threadTicks**, distinct from ThreadTime above. Separate post-timing AX observations are not subtracted.

| Rows / action | AB before → split ms | BA before → split ms | A/A difference AB / BA |
|---|---:|---:|---:|
| 100 / create | 10.480 → 9.768 | 8.604 → 8.445 | +1.6% / -10.7% |
| 100 / update | 1.999 → 2.102 | 1.964 → 1.927 | +3.0% / +1.6% |
| 100 / select | 1.528 → 1.345 | 1.312 → 1.330 | +9.2% / +6.8% |
| 100 / append | 2.750 → 2.789 | 2.560 → 2.482 | -3.8% / -5.1% |
| 100 / swap | 2.118 → 1.968 | 1.845 → 1.803 | +4.3% / -2.1% |
| 100 / remove | 2.560 → 2.178 | 1.943 → 2.143 | -3.0% / -9.6% |
| 100 / clear | 2.342 → 2.548 | 2.071 → 2.003 | +13.0% / -2.7% |
| 1000 / create | 93.720 → 95.847 | 97.862 → 95.298 | +4.1% / -0.7% |
| 1000 / update | 8.643 → 8.666 | 9.115 → 8.109 | +0.6% / +6.5% |
| 1000 / select | 2.649 → 2.483 | 2.285 → 2.374 | -8.5% / -1.3% |
| 1000 / append | 10.621 → 11.000 | 11.450 → 10.667 | -4.3% / -12.7% |
| 1000 / swap | 3.782 → 3.776 | 3.493 → 3.737 | +13.4% / -0.9% |
| 1000 / remove | 7.563 → 7.920 | 7.500 → 7.699 | +8.0% / -0.1% |
| 1000 / clear | 11.432 → 13.043 | 12.424 → 12.134 | -2.1% / -15.4% |

## Interpretation and evidence

The retained change separates static and dynamic responsibilities, restores the original dynamic helpers and modestly improves delivery in the measured entry/control shapes. It preserves constructor and ownership work. CPU stays mixed: there is no accepted global acceleration, parity margin, statistical significance or new React/Svelte timing ranking. Startup, cold compiler latency, independent human DX and production readiness remain outside this result.

All expensive phases run serially under the existing Windows Job limits: CPU 10%, commit 768 MiB, 24 processes, at least 4 GiB host-free memory, browser wall/idle 45/12 seconds, Node/test 60/60 seconds and owned-tree cleanup. Strict readers validate assets, source identities, raw samples, clocks, order and supervisors. The runtime-only historical list reader remains unchanged; this study pins its compiler/runtime pair explicitly.

- Final fixtures: `matrix-fFpgAM` and `run-JnrvVQ`; baseline `matrix-CPpXYS` / `run-MrFoKU`.
- Full gate: `test-runs/run-ec9d3ab63c3b4792b9ae983b7dd40d64`.
- Expanded cohort: `core-studies/run-f69639e9c52d4256ba8fe5cbe34c95b6`.
- List cohort: `interleaved-studies/run-65cc6c07791d4f358f77fc13943fe6ad`.
- Follow-up: `caption-helper-study/composition-followup-394b2035d116411c90cb40cedfdda7fe`.
- Producers, native checks, constructor/binding counts, delivery controls, relay work and verification: `caption-helper-study/final-fc2a57ee43824446a43fc11faa630a38`.
- Failed resource-limited gates: `run-278374ff17f841ee97cefc480b6e67b1` and `run-da1af5fb8a4846e6b46739f92d98e7f2` under `test-runs/`.
- Evidence paths are workspace-relative under `elnor/.elnor/mvp/framework-comparison`, internal rather than public downloads.
