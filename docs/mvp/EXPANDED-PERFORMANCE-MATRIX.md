# Expanded performance baseline

**Controlled startup follow-up:** [foreground-ready-v2](CONTROLLED-STARTUP.md)
now checks visibility before navigation and throughout readiness across all
four families. Its 24 pairs/336 fresh-context starts retain substantial A/A
wall variation despite passing visibility checks. The startup table below
remains the original provisional cohort; no wall ranking is accepted from
either dataset. Runtime, memory, delivery and tooling records below remain.

**Measured: 2026-11-12.** Four new synthetic workload families complement the
existing 100/1000-row list studies. This is broader coverage, not a
representative product application, universal ranking or parity verdict.

The controls are React 19.3.1 and Svelte 5.57.3 on Edge 157.0.4341.42.
The compiler/runtime remain the validated `run-RuBGXZ` implementation.

Frozen fixture: `matrix-vWhA85`. Complete study: `run-72d12d53290b404a846f0827492f29ac` under
`elnor/.elnor/mvp/framework-comparison/matrix-studies/`.

## Coverage and decision boundary

| Family | Workload |
|---|---|
| Small | One counter with local state |
| Form | Six fields, derived summary/validity, conditional validation and recovery |
| Composition | Six prop/event relay layers plus named/default slots |
| Localized | 24 independent child states; update the middle one, preserve other values/identities |

Each family compares Elnor with itself (A/A), React and Svelte in both
initial orders, alternating active isolated contexts per action/round.
Two warmups precede seven samples per action. Mount, updates and unmount
are distinct operations. Every operation starts from a prepared fixture.
The shared driver, expected-state and schema/identity checks are retained.
Input value attributes are normalized to the real value property; this
exception is explicit. Other element/attribute/text structure and actual input
values must match across frameworks.

## Reading the baseline

The small counter, form, composition and independent-state cases now expose
different costs from list creation/clear. Some control differences change sign
between the two orders. Even identical code varies: these tables are diagnostic
observations, not proof that a small difference is an optimization.

DOM and listener counts return to their loaded/unmounted baseline after eight
cycles in all twelve family/framework cases. Heap usage increases in these
runs; neither those increases nor stable DOM/listener counts prove or disprove
general leaks. The raw per-cycle heap/counter observations remain visible.

Startup wall medians include large delays for some entries alongside much
smaller CPU medians. Foreground activation is recorded for timed interactions,
but this initial startup collector activates the page after navigation/readiness
timing and does not record visibility throughout that window. **No startup
wall-time ranking is accepted.** Foreground-controlled startup is a separate
follow-up; the original observations are retained without removing outliers or
attributing a cause. Editor response and independent human DX also remain open.

Evaluate future changes across these families **and** the existing list
matrix, delivery, lifecycle, tooling and DX/correctness. No weighted
aggregate score or numeric tolerance is invented here. Winning one list
operation is insufficient evidence for a global core optimization.

## Paired runtime CPU

Renderer TaskDuration medians in ms, threadTicks. Each table value is
a seven-sample median. A is Elnor; B is the named framework (also Elnor
for A/A). Positive delta means B used more CPU. Compare within a pair;
different control groups run in different owned browsers.

### aa

| Family | Action | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| counter | mount | 0.984 | 0.837 | -14.94% | 1.082 | 1.019 | -5.82% |
| counter | increment | 0.831 | 0.804 | -3.25% | 1.092 | 1.149 | +5.22% |
| counter | unmount | 0.816 | 0.809 | -0.86% | 0.869 | 0.909 | +4.60% |
| form | mount | 1.631 | 1.826 | +11.96% | 1.408 | 1.523 | +8.17% |
| form | edit-one | 1.633 | 1.832 | +12.19% | 1.578 | 1.605 | +1.71% |
| form | edit-all | 1.862 | 1.901 | +2.09% | 1.934 | 1.745 | -9.77% |
| form | invalid | 1.713 | 1.695 | -1.05% | 1.695 | 1.594 | -5.96% |
| form | recover | 1.499 | 1.491 | -0.53% | 1.389 | 1.390 | +0.07% |
| form | unmount | 0.949 | 0.964 | +1.58% | 0.879 | 0.921 | +4.78% |
| composition | mount | 1.075 | 1.027 | -4.47% | 1.013 | 1.147 | +13.23% |
| composition | relay | 0.803 | 0.794 | -1.12% | 0.825 | 0.847 | +2.67% |
| composition | unmount | 0.733 | 0.763 | +4.09% | 0.722 | 0.760 | +5.26% |
| localized | mount | 2.082 | 2.077 | -0.24% | 1.923 | 1.896 | -1.40% |
| localized | local-update | 1.054 | 1.035 | -1.80% | 1.000 | 1.079 | +7.90% |
| localized | unmount | 0.975 | 1.097 | +12.51% | 0.979 | 0.976 | -0.31% |

### react

| Family | Action | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| counter | mount | 0.983 | 1.233 | +25.43% | 1.033 | 1.194 | +15.59% |
| counter | increment | 0.758 | 0.906 | +19.53% | 0.700 | 0.920 | +31.43% |
| counter | unmount | 0.840 | 0.858 | +2.14% | 0.746 | 0.766 | +2.68% |
| form | mount | 1.522 | 1.927 | +26.61% | 1.396 | 1.761 | +26.15% |
| form | edit-one | 1.772 | 1.479 | -16.53% | 1.190 | 1.236 | +3.87% |
| form | edit-all | 1.879 | 2.213 | +17.78% | 1.206 | 1.524 | +26.37% |
| form | invalid | 1.777 | 2.053 | +15.53% | 1.187 | 1.260 | +6.15% |
| form | recover | 1.477 | 1.861 | +26.00% | 1.204 | 1.426 | +18.44% |
| form | unmount | 0.936 | 0.979 | +4.59% | 0.956 | 1.021 | +6.80% |
| composition | mount | 1.165 | 1.387 | +19.06% | 1.049 | 1.544 | +47.19% |
| composition | relay | 0.926 | 1.040 | +12.31% | 0.860 | 1.065 | +23.84% |
| composition | unmount | 0.801 | 0.959 | +19.73% | 0.807 | 0.867 | +7.43% |
| localized | mount | 3.502 | 3.640 | +3.94% | 3.739 | 2.831 | -24.28% |
| localized | local-update | 1.389 | 1.467 | +5.62% | 1.142 | 1.356 | +18.74% |
| localized | unmount | 1.276 | 1.433 | +12.30% | 1.129 | 1.114 | -1.33% |

### svelte

| Family | Action | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| counter | mount | 0.912 | 1.054 | +15.57% | 0.910 | 1.027 | +12.86% |
| counter | increment | 0.893 | 1.016 | +13.77% | 0.890 | 1.028 | +15.51% |
| counter | unmount | 0.723 | 0.792 | +9.54% | 0.789 | 0.860 | +9.00% |
| form | mount | 1.117 | 1.139 | +1.97% | 1.109 | 1.146 | +3.34% |
| form | edit-one | 0.935 | 1.009 | +7.91% | 1.002 | 0.992 | -1.00% |
| form | edit-all | 1.045 | 1.073 | +2.68% | 1.081 | 1.187 | +9.81% |
| form | invalid | 1.040 | 0.960 | -7.69% | 1.005 | 1.010 | +0.50% |
| form | recover | 1.007 | 1.071 | +6.36% | 0.950 | 1.028 | +8.21% |
| form | unmount | 0.766 | 0.727 | -5.09% | 0.783 | 0.771 | -1.53% |
| composition | mount | 1.061 | 1.124 | +5.94% | 1.048 | 1.161 | +10.78% |
| composition | relay | 0.919 | 0.921 | +0.22% | 0.852 | 0.919 | +7.86% |
| composition | unmount | 0.748 | 0.754 | +0.80% | 0.779 | 0.791 | +1.54% |
| localized | mount | 1.858 | 2.061 | +10.93% | 2.562 | 2.945 | +14.95% |
| localized | local-update | 1.075 | 1.101 | +2.42% | 1.446 | 1.733 | +19.85% |
| localized | unmount | 0.992 | 1.019 | +2.72% | 1.316 | 1.223 | -7.07% |

## Startup and lifecycle observations

Three fresh-context local navigations per entry, in a fresh owned
browser per lifecycle case. Includes local HTTP, scripts, mount and
readiness; browser/OS caches are not claimed cold. Wall and renderer CPU
are separate; neither is independent human input-to-pixel latency.

| Family | Framework | Startup wall median ms | Startup CPU median ms |
|---|---|---:|---:|
| counter | elnor | 598.576 | 33.330 |
| counter | react | 111.648 | 59.151 |
| counter | svelte | 69.907 | 36.187 |
| form | elnor | 89.988 | 29.712 |
| form | react | 115.006 | 50.078 |
| form | svelte | 67.893 | 36.829 |
| composition | elnor | 70.599 | 29.026 |
| composition | react | 115.046 | 64.132 |
| composition | svelte | 350.069 | 32.767 |
| localized | elnor | 62.713 | 36.941 |
| localized | react | 110.423 | 50.729 |
| localized | svelte | 524.671 | 35.169 |

Post-GC memory in a separate context. Baseline is modules loaded and
initial app unmounted; final follows eight interacted mount/unmount
cycles. Driver references are released. Counts include framework/browser
resources: deltas are not peak memory or general leak proof.

| Family | Framework | Heap baseline / mounted / final bytes | DOM baseline / final | Listeners baseline / final |
|---|---|---|---|---|
| counter | elnor | 1283984 / 1289004 / 1382468 | 9 / 9 | 13 / 13 |
| counter | react | 1655936 / 1784420 / 2143328 | 10 / 10 | 158 / 158 |
| counter | svelte | 1383756 / 1398796 / 1611612 | 19 / 19 | 13 / 13 |
| form | elnor | 1306716 / 1324464 / 1413924 | 9 / 9 | 13 / 13 |
| form | react | 1797140 / 1849092 / 2192168 | 10 / 10 | 158 / 158 |
| form | svelte | 1460508 / 1479812 / 1689688 | 44 / 44 | 14 / 14 |
| composition | elnor | 1303872 / 1313636 / 1416108 | 9 / 9 | 13 / 13 |
| composition | react | 1790148 / 1837172 / 2170380 | 10 / 10 | 158 / 158 |
| composition | svelte | 1429572 / 1450624 / 1680260 | 73 / 73 | 13 / 13 |
| localized | elnor | 1308512 / 1355428 / 1409676 | 9 / 9 | 13 / 13 |
| localized | react | 1800588 / 1860700 / 2212224 | 10 / 10 | 158 / 158 |
| localized | svelte | 1441500 / 1463312 / 1632232 | 48 / 48 | 13 / 13 |

## Application delivery

Production entry bundles; shared driver/CSS are separate. Not standalone
runtime package sizes or general application download budgets.

| Entry | Raw bytes | Gzip bytes | Brotli bytes |
|---|---:|---:|---:|
| composition-elnor.mjs | 4776 | 1794 | 1562 |
| composition-react.mjs | 225112 | 69474 | 59818 |
| composition-svelte.mjs | 49159 | 18159 | 16418 |
| counter-elnor.mjs | 3222 | 1441 | 1286 |
| counter-react.mjs | 223810 | 69264 | 59629 |
| counter-svelte.mjs | 45157 | 17024 | 15418 |
| form-elnor.mjs | 5820 | 2042 | 1786 |
| form-react.mjs | 224931 | 69451 | 59761 |
| form-svelte.mjs | 51565 | 19282 | 17377 |
| localized-elnor.mjs | 4322 | 1652 | 1430 |
| localized-react.mjs | 223975 | 69334 | 59719 |
| localized-svelte.mjs | 46216 | 17375 | 15665 |

## Tooling, separately

Checked Surface project build plus owned publication, three calls per
family in one sequential shared Node process. First-per-fixture is not
cold CLI startup; repeated builds are not incremental HMR. CPU is Node
process CPU, not renderer threadTicks. No competitor tooling comparison
is inferred. Saved-error recovery and editor/human DX still need their
separate evidence; the historical [development measurements](DEVELOPMENT-MEASUREMENTS.md)
remain labeled as such.

| Family | Call | Wall ms | Process CPU ms |
|---|---:|---:|---:|
| counter | 0 | 446.649 | 986.000 |
| counter | 1 | 555.969 | 639.000 |
| counter | 2 | 408.142 | 407.000 |
| form | 0 | 249.039 | 297.000 |
| form | 1 | 341.853 | 360.000 |
| form | 2 | 223.246 | 234.000 |
| composition | 0 | 390.365 | 500.000 |
| composition | 1 | 448.539 | 547.000 |
| composition | 2 | 428.540 | 469.000 |
| localized | 0 | 335.805 | 312.000 |
| localized | 1 | 265.512 | 422.000 |
| localized | 2 | 327.428 | 360.000 |

## Verification and limits

The complete study passes **40 browser phases**, **45 preflight checks**,
**1260 timed action samples**, **36 startup samples** and **96 memory
cycles**. Sources/assets, versions, schemas, action order/visibility,
clock fields, traces and cleanup are independently checked by the summary
reader. Frame-window distributions and separate post-timing AX traces
remain in raw/summary JSON. AX duration is inclusive and not subtracted
from total CPU; a later trace cannot certify every earlier sample.

All heavy work is serial, with CPU 10%, 768 MiB job commit, 24 processes,
4 GiB minimum free host memory, owned-tree cleanup and sandboxed headless
Edge with GPU disabled. Browser limits remain 45 seconds wall/12 seconds
progress; build has 60 seconds. Every completed phase reports zero owned
processes. Host load is not isolated or attributed to a single cause.

Small sample counts and A/A variation limit small-change claims. These
synthetic synchronous workloads do not cover network data, large apps,
general async error recovery, all Surface syntax, device/browser matrices,
full editor latency or independent human DX. No core source optimization
or Rust migration is made by expanding the suite.

Protocol and commands: [expanded harness](../../benchmarks/matrix/README.md).
Existing [current list comparison](CURRENT-CORE-COMPARISON.md) and
[performance target](PERFORMANCE-TARGET.md) remain separate evidence.

## Retained validation history

The builder/preflight record is
`matrix-studies/run-463fd1aed6e349a2bd6df580fe38aa43`. Its build succeeds under
the unchanged 60-second Job bounds, followed by all four preflights.
Two earlier build attempts remain retained: the first refused unsupported
`output` Surface tags (the fixtures use supported `strong` in all frameworks),
and the second was terminated by the 4 GiB host-free-memory guard. Neither is
counted as a passing build. The core grammar and resource limits were unchanged.

`matrix-validation/run-d53011d9c6c347bb9dcfaba2ee518404` separately verifies that
a corrupted asset and an unknown workload are rejected before browser launch.
Those worker exits are deliberately nonzero, not successful benchmark cases.
The first negative-validator attempt expected assertion source text that Node
did not include; the corrected validator matches both actual/expected asset
digests, the rejection and the absence of browser launch. Its earlier failed
validator record remains at
`matrix-validation/run-9b8acf5effaa486fb0813bb941f7ade8`.
