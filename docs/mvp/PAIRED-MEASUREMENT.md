# Paired measurement investigation

Sixteen complete pairs compare identical current Elnor fixtures (A/A), the previous and current core, and current Elnor against React and Svelte. Sharing one browser per pair does not eliminate double-digit A/A differences. This protocol is retained as a diagnostic tool; no small CPU improvement, regression, general superiority or product parity is accepted from this cohort.

The runtime and compiler remain unchanged from the structural-recovery gate. The active correctness fixture is `run-BknsXh`; `run-ukbjyh` is the earlier scheduler-only correctness fixture used for the change comparison. Their fixes remain justified by reproduced defects and functional tests, not by favorable timing selection.

## Protocol

Study `paired-studies/run-5c3f6c5da3904914bff4d1a0e9727d8b` uses one fresh sandboxed headless Edge per pair and a fresh context per variant. Variants run consecutively, then the order reverses in a second fresh pair: AB and BA. Both sizes (100 and 1000) are covered. Each variant uses two warmups and seven measured rounds of seven actions (49 samples), giving 1568 measured action samples across 32 contexts. Paired contexts do not share application state. Fixtures use separate loopback ports so their original absolute asset URLs and bytes remain intact.

Each variant records a creation trace after all its timing samples, in that same context, before unmounting. The trace records accessibility lifecycle thread duration and the full DOM schema hash; both schemas must match in a pair. It does not establish constant accessibility conditions during every earlier sample. Inclusive nested trace events must not be summed, and post-timing AX is not subtracted from total CPU. Tracing is outside the CPU timing windows but occurs between variants; A/A evaluates the complete protocol including that ordering.

Every heavy worker retains the Windows Job limits: 10% aggregate CPU, 768 MiB commit, at most 24 processes, 45-second wall and 12-second progress deadlines. Browsers are headless, sandboxed Edge with GPU disabled. Each trace is limited to 8 MiB and rejects reported data loss. Workers verify every fixture asset hash; summaries verify frozen collector copies/hashes, version identity, schemas, rounds, limits and zero remaining owned processes. No samples or pairs are removed.

Tables show renderer TaskDuration CPU medians in ms using threadTicks. Every A/B number is a seven-sample median within its own context. Percentages are 100 × (B/A − 1); positive means B consumed more CPU. Pair differences are descriptive, not a significance test, acceptance tolerance or cross-cohort aggregate score. Frame windows and other component metrics remain in the JSON.

## A/A: identical current Elnor

| Rows | Action | AB: A | AB: B | B/A change | BA: A | BA: B | B/A change |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 7.061 | 7.020 | -0.58% | 8.234 | 7.411 | -10.00% |
| 100 | update | 1.507 | 1.665 | +10.48% | 1.688 | 1.613 | -4.44% |
| 100 | select | 1.144 | 1.157 | +1.14% | 1.245 | 1.115 | -10.44% |
| 100 | append | 2.060 | 2.061 | +0.05% | 2.161 | 2.178 | +0.79% |
| 100 | swap | 1.534 | 1.528 | -0.39% | 1.590 | 1.602 | +0.75% |
| 100 | remove | 1.786 | 1.787 | +0.06% | 1.906 | 1.817 | -4.67% |
| 100 | clear | 1.842 | 1.817 | -1.36% | 1.931 | 1.867 | -3.31% |
| 1000 | create | 66.034 | 62.972 | -4.64% | 66.290 | 58.692 | -11.46% |
| 1000 | update | 6.263 | 6.120 | -2.28% | 6.211 | 5.727 | -7.79% |
| 1000 | select | 2.039 | 2.066 | +1.32% | 2.029 | 1.966 | -3.10% |
| 1000 | append | 9.445 | 11.270 | +19.32% | 9.564 | 10.363 | +8.35% |
| 1000 | swap | 3.358 | 3.390 | +0.95% | 3.472 | 3.307 | -4.75% |
| 1000 | remove | 6.530 | 6.273 | -3.94% | 6.570 | 5.985 | -8.90% |
| 1000 | clear | 9.288 | 9.768 | +5.17% | 10.423 | 9.336 | -10.43% |

## Core change: scheduler fixture A, structural recovery B

| Rows | Action | AB: A | AB: B | B/A change | BA: A | BA: B | B/A change |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 6.779 | 7.319 | +7.97% | 7.057 | 6.740 | -4.49% |
| 100 | update | 1.607 | 1.558 | -3.05% | 1.486 | 1.533 | +3.16% |
| 100 | select | 1.143 | 1.158 | +1.31% | 1.104 | 1.121 | +1.54% |
| 100 | append | 2.090 | 2.067 | -1.10% | 2.005 | 2.040 | +1.75% |
| 100 | swap | 1.584 | 1.577 | -0.44% | 1.529 | 1.543 | +0.92% |
| 100 | remove | 1.809 | 1.846 | +2.05% | 1.756 | 1.847 | +5.18% |
| 100 | clear | 1.868 | 1.818 | -2.68% | 1.765 | 1.770 | +0.28% |
| 1000 | create | 64.423 | 64.213 | -0.33% | 61.876 | 59.323 | -4.13% |
| 1000 | update | 5.991 | 5.618 | -6.23% | 5.728 | 5.651 | -1.34% |
| 1000 | select | 2.038 | 1.974 | -3.14% | 2.004 | 1.976 | -1.40% |
| 1000 | append | 10.762 | 9.354 | -13.08% | 8.983 | 9.089 | +1.18% |
| 1000 | swap | 3.433 | 3.392 | -1.19% | 3.160 | 3.181 | +0.66% |
| 1000 | remove | 6.532 | 6.109 | -6.48% | 6.003 | 5.957 | -0.77% |
| 1000 | clear | 9.599 | 9.360 | -2.49% | 9.433 | 9.387 | -0.49% |

## Framework control: current Elnor A, React B

| Rows | Action | AB: A | AB: B | B/A change | BA: A | BA: B | B/A change |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 7.360 | 6.693 | -9.06% | 7.149 | 6.564 | -8.18% |
| 100 | update | 1.608 | 1.760 | +9.45% | 1.598 | 1.705 | +6.70% |
| 100 | select | 1.172 | 1.351 | +15.27% | 1.171 | 1.364 | +16.48% |
| 100 | append | 2.095 | 2.168 | +3.48% | 2.153 | 2.154 | +0.05% |
| 100 | swap | 1.628 | 7.519 | +361.86% | 1.581 | 7.229 | +357.24% |
| 100 | remove | 1.834 | 2.023 | +10.31% | 1.838 | 2.001 | +8.87% |
| 100 | clear | 1.809 | 1.840 | +1.71% | 1.852 | 1.960 | +5.83% |
| 1000 | create | 62.965 | 61.517 | -2.30% | 57.951 | 59.839 | +3.26% |
| 1000 | update | 5.673 | 6.543 | +15.34% | 5.390 | 6.234 | +15.66% |
| 1000 | select | 1.867 | 2.854 | +52.87% | 1.913 | 2.769 | +44.75% |
| 1000 | append | 8.774 | 9.563 | +8.99% | 13.124 | 9.287 | -29.24% |
| 1000 | swap | 3.266 | 70.616 | +2062.16% | 3.257 | 67.387 | +1968.99% |
| 1000 | remove | 5.862 | 7.921 | +35.12% | 6.216 | 7.768 | +24.97% |
| 1000 | clear | 9.124 | 9.883 | +8.32% | 9.259 | 9.109 | -1.62% |

## Framework control: current Elnor A, Svelte B

| Rows | Action | AB: A | AB: B | B/A change | BA: A | BA: B | B/A change |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 10.062 | 6.776 | -32.66% | 7.948 | 6.824 | -14.14% |
| 100 | update | 1.673 | 1.578 | -5.68% | 1.631 | 1.524 | -6.56% |
| 100 | select | 1.185 | 1.182 | -0.25% | 1.241 | 1.098 | -11.52% |
| 100 | append | 2.191 | 2.116 | -3.42% | 2.180 | 2.053 | -5.83% |
| 100 | swap | 1.628 | 1.584 | -2.70% | 1.700 | 1.534 | -9.76% |
| 100 | remove | 1.865 | 1.841 | -1.29% | 1.880 | 1.867 | -0.69% |
| 100 | clear | 2.049 | 1.745 | -14.84% | 1.849 | 1.704 | -7.84% |
| 1000 | create | 67.899 | 59.951 | -11.71% | 61.957 | 56.766 | -8.38% |
| 1000 | update | 6.000 | 5.830 | -2.83% | 5.814 | 5.250 | -9.70% |
| 1000 | select | 2.018 | 2.147 | +6.39% | 1.895 | 1.853 | -2.22% |
| 1000 | append | 10.837 | 9.218 | -14.94% | 10.596 | 8.587 | -18.96% |
| 1000 | swap | 3.272 | 3.409 | +4.19% | 3.265 | 3.397 | +4.04% |
| 1000 | remove | 6.076 | 6.144 | +1.12% | 6.025 | 6.028 | +0.05% |
| 1000 | clear | 9.304 | 7.925 | -14.82% | 9.040 | 7.836 | -13.32% |

## Post-timing accessibility observations

These are separate instrumented creation windows. Event counts and costs vary even in A/A, and a later trace cannot reconstruct the condition of every measured action.

| Group | Rows | Order | A: AX CPU | B: AX CPU | A/B AX event count |
|---|---|---|---:|---:|---|
| aa | 100 | AB | 3.534 | 3.611 | 2 / 2 |
| aa | 100 | BA | 3.746 | 4.895 | 2 / 3 |
| aa | 1000 | AB | 44.430 | 38.578 | 2 / 2 |
| aa | 1000 | BA | 42.537 | 52.456 | 2 / 2 |
| change | 100 | AB | 3.503 | 3.602 | 2 / 2 |
| change | 100 | BA | 3.583 | 4.760 | 2 / 3 |
| change | 1000 | AB | 43.826 | 41.616 | 2 / 2 |
| change | 1000 | BA | 38.423 | 44.475 | 2 / 2 |
| react | 100 | AB | 3.518 | 3.362 | 2 / 2 |
| react | 100 | BA | 3.688 | 3.789 | 2 / 2 |
| react | 1000 | AB | 40.702 | 38.951 | 2 / 2 |
| react | 1000 | BA | 36.959 | 40.862 | 2 / 2 |
| svelte | 100 | AB | 3.747 | 4.697 | 2 / 2 |
| svelte | 100 | BA | 4.035 | 3.556 | 2 / 2 |
| svelte | 1000 | AB | 39.218 | 38.490 | 2 / 2 |
| svelte | 1000 | BA | 39.822 | 43.464 | 2 / 2 |

## Findings and limits

Identical 1000-row creation differs by −4.64% and −11.46% in A/A; append differs by +19.32% and +8.35%. Clear changes sign (+5.17%, −10.43%). One shared browser with consecutive context blocks is therefore insufficient evidence for accepting small optimization percentages. These observed differences are not a newly selected numerical acceptance threshold.

The core change has mixed or small differences across operations and orders. It is not retained or rejected based on those numbers; its resource cleanup and scheduler corrections already have dedicated functional gates. The control tables retain large React swap costs and remaining Svelte gaps alongside operations whose ranks change. Neither two pairs nor the A/A behavior supports a blanket framework ranking.

A next diagnostic should interleave action-level controls more closely and observe accessibility during the relevant action window. It must first demonstrate its own A/A repeatability, preserve total renderer cost and resource limits, and account for tracing/visibility effects. No cause of every observed difference has been established here.

## Validation and retained failures

Normal runtime case `diagnostics/run-201ed0a4a8a146cfa996a8975beda7ca` passes 49 samples without the optional afterTiming observation; preflight `diagnostics/run-4bb94fe312044291a92fcd00bcbbd0ad` passes 42 checks. This verifies that the new hook is absent in ordinary collection. Runtime/compiler byte hashes still match `run-BknsXh`; the previous 533-test application gate remains historical evidence, not a new full-suite run.

Fault injection `paired-studies/validation-89daa6ea7d9f46a189cacb2204d615ca` passes two expected-rejection checks: an instrumented fixture and a corrupted asset checksum both fail before browser launch, with no timing variants or remaining owned processes. Their worker exit code is 1 by design, and is not presented as a successful benchmark.

The initial setup attempt `paired-studies/run-7de41f29fdbc44ada6186b5f46fb694f` failed because the unchanged fixture uses absolute asset paths and the first server design used URL prefixes. It contains no valid completed timing pair. The corrected tool uses separate loopback ports. That failed run remains retained with zero owned processes after cleanup; it was not relabeled as passing.

## Commands and source

From the workspace root on Windows:

```powershell
python elnor/benchmarks/runtime/paired-windows.py --baseline elnor/.elnor/mvp/framework-comparison/run-ukbjyh --candidate elnor/.elnor/mvp/framework-comparison/run-BknsXh --controls
node elnor/benchmarks/runtime/summarize-paired.mjs elnor/.elnor/mvp/framework-comparison/paired-studies/run-5c3f6c5da3904914bff4d1a0e9727d8b
```

Use the existing Python environment with pywin32 available. The runner supervises each pair separately. Summary generation is read-only with `--stdout-only`; without it, the summary is created once and existing evidence is not overwritten. The optional controls flag adds React and Svelte pairs; the default still includes A/A and the core-change pairs.

Tools: [paired runner](../../benchmarks/runtime/paired-windows.py), [worker](../../benchmarks/runtime/paired-worker.mjs), [summary validation](../../benchmarks/runtime/summarize-paired.mjs). Reproducer: `elnor/.elnor/mvp/framework-comparison/reports/paired/producer.py`. Previous context: [Repeatability](REPEATABILITY-STUDY.md), [Structural recovery](STRUCTURAL-RECOVERY.md). Evidence identifiers are relative to `elnor/.elnor/mvp/framework-comparison/`.
