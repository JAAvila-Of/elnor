# Text write guard and action interleaving

The retained change skips assigning an identical value to a Text node in Elnor text/button effects. Real-browser mutation observation confirms fewer redundant text records while effect counts and keyed node identity stay unchanged. This is a measured reduction in DOM writes, not an accepted CPU speedup or a claim of parity with Svelte.

## Exact source study and independent design

Svelte 5.57.3 was reviewed from the exact installed benchmark dependency, including generated RowView output and its text, template and each implementations. Frozen copies and hashes are retained in `svelte-study-QHK5HF`; the study command is supervised in `diagnostics/svelte-review-5a1cdcf0a2164f6694e17447a062d782`.

Three mechanisms were examined. Svelte compares normalized text using private cached state; its templates reuse a parsed structure before cloning; its controlled-list clear depends on lifecycle and pending-work guards. These are design references, not implementations imported into Elnor. Earlier Elnor cloning and clear-primitive trials remain rejected in their historical reports.

Elnor applies only the narrow avoid-redundant-assignment principle here. Its existing input helper already compares the real input value before writing. Text and button effects now convert their read result once, compare it with the actual Text.nodeValue, and assign only if different. There is no private text cache, Svelte runtime dependency or copied template/event/ownership implementation. Surface syntax, native listeners and independent expression effects remain.

Comparing the actual node also repairs an external edit on a later dependency notification that computes the original string. The same Text node stays in place. Nullish normalization, numbers, booleans, BigInt, Symbol and object conversion are covered. Read/conversion side effects still occur; redundant MutationObserver records intentionally do not. Replacing the Text node externally is not a new supported ownership contract.

## Browser-observed mechanism

Baseline and candidate diagnostics are `diagnostics/run-6b81413ac9ac4fa69ba7e4ef2d851940` and `diagnostics/run-78732d923a9547c995512060eda5286f`, at 1000 rows. Counters are separate from CPU timing. Mutation records are JS-visible DOM observations, not total allocation bytes, AX work or CPU attribution.

| Action | Baseline text records | Guarded text records | Baseline effects | Guarded effects |
|---|---:|---:|---:|---:|
| create | 2 | 1 | 2003 | 2003 |
| update | 202 | 100 | 203 | 203 |
| select | 2 | 1 | 3 | 3 |
| append | 2 | 1 | 203 | 203 |
| swap | 2 | 0 | 3 | 3 |
| remove | 2 | 1 | 3 | 3 |
| clear | 2 | 1 | 3 | 3 |

Updating every tenth label changes 202 text records to 100: unchanged numeric IDs and unchanged summary values no longer trigger assignments. Swap changes two redundant summary text records to zero. No effects are merged or skipped to obtain these counts.

## Action-interleaved protocol

Study `interleaved-studies/run-e7d6488446854574b1e9842ea1a75490` completes 16 pairs and 1568 normal action samples: A/A, baseline-versus-guard, React and Svelte controls at both sizes. Each pair has two live isolated contexts in one owned browser. It alternates page activation for each action and round; AB/BA in the tables is the initial order seed, reversed in the second pair. Two warmup rounds precede seven measured rounds. Visibility, action order and host timestamps are retained and validated. This is a different protocol from consecutive-context blocks; historical cohorts are not pooled with it.

The trace is still a separate post-timing creation observation in the same context, not AX attribution for every measured action. It is not subtracted from total CPU. Keeping two contexts live and switching pages can itself affect scheduling, caches and accessibility work; the A/A control evaluates those conditions rather than assuming they disappear.

| Rows | Host wall gap between paired timing windows: min / median / max (ms) |
|---|---|
| 100 | 11 / 18 / 28 |
| 1000 | 13 / 26 / 355 |

The following tables retain both order seeds and all seven operations. Values are seven-sample TaskDuration CPU medians in ms using threadTicks. Delta is 100 × (B/A − 1); positive means B uses more CPU. No statistical acceptance margin is selected.

## A/A: identical guarded Elnor

| Rows | Action | Seed AB: A | Seed AB: B | Delta | Seed BA: A | Seed BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 7.526 | 8.266 | +9.83% | 8.664 | 8.095 | -6.57% |
| 100 | update | 1.851 | 1.693 | -8.54% | 1.851 | 1.900 | +2.65% |
| 100 | select | 1.258 | 1.226 | -2.54% | 1.277 | 1.283 | +0.47% |
| 100 | append | 2.459 | 2.336 | -5.00% | 2.269 | 2.729 | +20.27% |
| 100 | swap | 1.941 | 1.683 | -13.29% | 1.868 | 1.689 | -9.58% |
| 100 | remove | 1.944 | 2.037 | +4.78% | 2.142 | 2.125 | -0.79% |
| 100 | clear | 1.927 | 2.081 | +7.99% | 2.211 | 2.250 | +1.76% |
| 1000 | create | 106.883 | 106.706 | -0.17% | 96.899 | 98.963 | +2.13% |
| 1000 | update | 8.952 | 9.751 | +8.93% | 8.719 | 8.398 | -3.68% |
| 1000 | select | 2.606 | 2.608 | +0.08% | 2.356 | 2.426 | +2.97% |
| 1000 | append | 12.443 | 14.218 | +14.27% | 10.695 | 9.984 | -6.65% |
| 1000 | swap | 4.067 | 5.083 | +24.98% | 3.771 | 3.537 | -6.21% |
| 1000 | remove | 9.296 | 8.810 | -5.23% | 7.942 | 8.735 | +9.98% |
| 1000 | clear | 14.099 | 13.044 | -7.48% | 12.838 | 12.017 | -6.40% |

## Change: baseline A, guarded Elnor B

| Rows | Action | Seed AB: A | Seed AB: B | Delta | Seed BA: A | Seed BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 7.775 | 7.875 | +1.29% | 9.529 | 8.744 | -8.24% |
| 100 | update | 1.751 | 1.763 | +0.69% | 1.800 | 1.990 | +10.56% |
| 100 | select | 1.231 | 1.217 | -1.14% | 1.336 | 1.268 | -5.09% |
| 100 | append | 2.592 | 2.222 | -14.27% | 2.769 | 2.455 | -11.34% |
| 100 | swap | 1.722 | 1.766 | +2.56% | 2.133 | 1.896 | -11.11% |
| 100 | remove | 1.996 | 2.033 | +1.85% | 2.220 | 2.193 | -1.22% |
| 100 | clear | 2.015 | 2.201 | +9.23% | 2.320 | 2.313 | -0.30% |
| 1000 | create | 109.198 | 107.978 | -1.12% | 111.962 | 113.690 | +1.54% |
| 1000 | update | 8.577 | 8.477 | -1.17% | 9.792 | 8.902 | -9.09% |
| 1000 | select | 2.706 | 2.619 | -3.22% | 3.045 | 3.234 | +6.21% |
| 1000 | append | 13.778 | 12.805 | -7.06% | 16.088 | 14.913 | -7.30% |
| 1000 | swap | 4.391 | 4.358 | -0.75% | 5.025 | 4.635 | -7.76% |
| 1000 | remove | 9.436 | 7.991 | -15.31% | 9.341 | 10.136 | +8.51% |
| 1000 | clear | 13.523 | 14.020 | +3.68% | 14.780 | 14.925 | +0.98% |

## Control: guarded Elnor A, React B

| Rows | Action | Seed AB: A | Seed AB: B | Delta | Seed BA: A | Seed BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 10.014 | 9.638 | -3.75% | 10.553 | 10.509 | -0.42% |
| 100 | update | 2.046 | 2.196 | +7.33% | 2.069 | 2.407 | +16.34% |
| 100 | select | 1.640 | 1.664 | +1.46% | 1.533 | 1.697 | +10.70% |
| 100 | append | 2.530 | 3.125 | +23.52% | 2.709 | 2.874 | +6.09% |
| 100 | swap | 2.162 | 10.234 | +373.36% | 2.075 | 11.044 | +432.24% |
| 100 | remove | 2.299 | 2.757 | +19.92% | 2.421 | 2.700 | +11.52% |
| 100 | clear | 2.324 | 2.387 | +2.71% | 2.458 | 2.528 | +2.85% |
| 1000 | create | 108.264 | 100.268 | -7.39% | 110.705 | 109.141 | -1.41% |
| 1000 | update | 8.943 | 10.216 | +14.23% | 9.290 | 10.454 | +12.53% |
| 1000 | select | 3.049 | 3.998 | +31.12% | 3.143 | 4.274 | +35.98% |
| 1000 | append | 13.781 | 13.656 | -0.91% | 16.636 | 16.157 | -2.88% |
| 1000 | swap | 4.663 | 103.898 | +2128.14% | 4.881 | 124.071 | +2441.92% |
| 1000 | remove | 8.613 | 6.203 | -27.98% | 10.012 | 6.412 | -35.96% |
| 1000 | clear | 13.382 | 13.585 | +1.52% | 14.718 | 15.120 | +2.73% |

## Control: guarded Elnor A, Svelte B

| Rows | Action | Seed AB: A | Seed AB: B | Delta | Seed BA: A | Seed BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 13.134 | 11.987 | -8.73% | 8.472 | 8.035 | -5.16% |
| 100 | update | 2.393 | 2.468 | +3.13% | 1.721 | 1.793 | +4.18% |
| 100 | select | 1.548 | 1.872 | +20.93% | 1.246 | 1.322 | +6.10% |
| 100 | append | 3.289 | 3.133 | -4.74% | 2.341 | 2.361 | +0.85% |
| 100 | swap | 2.319 | 2.396 | +3.32% | 1.787 | 1.752 | -1.96% |
| 100 | remove | 2.864 | 2.856 | -0.28% | 1.973 | 2.184 | +10.69% |
| 100 | clear | 2.772 | 2.579 | -6.96% | 2.089 | 2.043 | -2.20% |
| 1000 | create | 105.510 | 101.089 | -4.19% | 102.405 | 97.340 | -4.95% |
| 1000 | update | 8.765 | 8.583 | -2.08% | 8.734 | 8.256 | -5.47% |
| 1000 | select | 3.080 | 2.797 | -9.19% | 2.368 | 2.178 | -8.02% |
| 1000 | append | 14.798 | 12.741 | -13.90% | 10.784 | 10.031 | -6.98% |
| 1000 | swap | 4.307 | 4.310 | +0.07% | 3.763 | 3.699 | -1.70% |
| 1000 | remove | 8.351 | 9.612 | +15.10% | 7.941 | 7.497 | -5.59% |
| 1000 | clear | 12.974 | 10.716 | -17.40% | 12.241 | 9.383 | -23.35% |

## Interpretation

Large-list creation A/A differs by -0.17%/+2.13% here, but other actions remain variable: swap reaches +24.98%/-6.21%, and append +14.27%/-6.65%. Thus a nearby pair does not establish general repeatability or justify small CPU claims. Guarded creation changes by -1.12%/+1.54% versus baseline; update by -1.17%/-9.09%. Other changes also vary in magnitude/sign. These data do not establish a general CPU improvement or deterioration.

The guard is retained for its verified reduction in redundant native writes and preserved behavior. Raw tables and post-timing accessibility observations remain in the summary. They do not establish a blanket framework ranking. Total renderer cost stays visible, without subtracting accessibility or declaring the core performance goal complete.

## Verification and footprint

All six new regressions fail before the change in `test-runs/text-guard-before-fa2a23003f324d6988f6de20296f7c7d` and pass after it. Check/build and **539 Node tests across 43 files** pass in `test-runs/run-8c43bd8d53144874a2972c4da90d400a` (45 supervised phases). Targeted verification is retained in `test-runs/text-guard-after-d2a4cc310d4d44f6b0e87347f6688248`. Preflight `diagnostics/run-fb1ef47da7654fde8dd95ebfcce0c914` passes 42 normal workload checks across Elnor, React and Svelte at both sizes.

Real DOM/microtask fixture `test-runs/text-guard-browser-5f11672697fc467e91818cd170864609` additionally checks external text repair, identical-value reevaluation with zero characterData records, listener/resource cleanup and recovery after expected failures for both fragment/direct-root lists. Read callbacks still execute. Four expected errors are checked explicitly; unexpected counts or identities fail the fixture.

The active fixture is `run-9EYGTh`, runtime SHA-256 `680098fa4718ea34a4d50848947172893c35c399c2d188d26cef190ec80cf813`. Compiler SHA-256 stays `3920447ad2670f323dada62e8e6847f7aec71b4c28e45c20b877f7a796f46ae3`. The bundle changes from 7006 to 7060 raw bytes, 2955 to 2964 gzip and 2670 to 2677 Brotli: 9 extra gzip bytes.

Every heavy command uses the existing Windows Job limits: at most 10% aggregate CPU, 768 MiB commit, 24 processes, sandboxed headless Edge and GPU disabled; browser cases have 45-second wall/12-second progress deadlines and Node phases 60 seconds. Selected phases verify limits and zero remaining owned processes. No safety setting or accessibility feature is disabled for a benchmark result.

Shared paired-worker validation `paired-studies/validation-d5fd7078129e44a8b16a39d2b27b0156` reruns two expected pre-launch rejection cases (instrumented fixture and checksum corruption), both with zero owned processes remaining. These failed workers are expected test outcomes, not successful benchmark cases.

Sources: [runtime](../../src/runtime.mjs), [regressions](../../tests/text-write-guard.test.mjs), [interleaved collector](../../benchmarks/runtime/interleaved-collector.mjs), [summary validator](../../benchmarks/runtime/summarize-paired.mjs). Reproducer: `elnor/.elnor/mvp/framework-comparison/reports/text-write-guard/producer.py --browser <retained-browser-directory>`. All evidence identifiers above are relative to `elnor/.elnor/mvp/framework-comparison/`.
