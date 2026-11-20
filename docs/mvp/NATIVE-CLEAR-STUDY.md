# Native clear investigation

The alternative clear primitive was not adopted. The active runtime remains byte-identical to `run-OLDLti`. Two completed studies show lower pooled 1000-row clear medians, but the confirmation has large variation in the unchanged baseline and both controls; its first process pair does not improve clear. These observations do not establish a reliable gain.

## Profile and candidate

Profile `diagnostics/run-005e182361ad454b8441041e923477fe` captures seven separate profiles per operation after two warmup rounds (49 verified profiles). The browser collector now honors `--rounds 7` in profile mode, rather than capturing one action window despite the requested round count. These profiles remain separate from uninstrumented CPU timings.

Across the seven clear profiles there are 237 samples: 167 idle, 22 program, 29 self samples in replaceChildren and 5 in removeEventListener. Each action window is short; sampling is perturbed and does not give precise CPU percentages or prove causality. The native clear operation was therefore selected as a hypothesis, rather than changing listener ownership without evidence.

Candidate `run-ychzn0` changes only the final verified-exclusive-region operation from `parent.replaceChildren(end)` to `parent.textContent = ""; parent.append(end)`. It retains the same anchor object, ownership checks, cleanup ordering, error handling, effects, native listeners and compiler. Mutation observation changes from one to two childList records; both variants remove 1001 nodes, add the anchor once, and run three Elnor effects. The candidate is not a single-DOM-call optimization.

## Timing protocol

Tables report renderer CPU TaskDuration medians in milliseconds using threadTicks. Every timing process has two warmups and seven measured rounds. The principal study has four processes per variant/size with balanced position rotation (28 samples per operation); confirmation has two processes with reversed order (14 samples). Four separate mutation checks precede each study. Controls and shared assets are identical within each study. No samples or processes were removed.

Every heavy command uses the Windows Job supervisor: 10% aggregate CPU, 768 MiB commit and at most 24 processes. Browsers are sandboxed headless Edge with GPU disabled, 45-second wall and 12-second progress deadlines; Node-test phases have 60-second deadlines. Summaries verify limits, browser/collector identity and zero remaining owned processes. Evidence identifiers below are relative to `elnor/.elnor/mvp/framework-comparison/`.

## Principal study

Study `studies/run-ddb787950e0f45b7aaaaa94446ddad74`; 36 passing cases; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 4.243 | 3.739 | 4.193 | 4.055 |
| 100 | Update | 1.634 | 1.487 | 1.708 | 1.656 |
| 100 | Select | 1.383 | 1.310 | 1.484 | 1.427 |
| 100 | Append | 1.823 | 1.942 | 1.982 | 1.843 |
| 100 | Swap | 1.598 | 1.601 | 3.856 | 1.776 |
| 100 | Remove | 1.839 | 1.643 | 1.933 | 1.803 |
| 100 | Clear | 1.375 | 1.343 | 1.675 | 1.412 |
| 1000 | Create | 28.940 | 26.345 | 25.083 | 27.191 |
| 1000 | Update | 4.781 | 3.746 | 4.842 | 4.448 |
| 1000 | Select | 2.590 | 2.392 | 3.559 | 2.498 |
| 1000 | Append | 6.847 | 5.446 | 6.119 | 5.442 |
| 1000 | Swap | 3.242 | 2.956 | 30.411 | 3.228 |
| 1000 | Remove | 4.482 | 3.948 | 4.927 | 3.772 |
| 1000 | Clear | 4.419 | 3.871 | 4.662 | 3.184 |

Selected 1000-row medians by process, in repetition order (not pooled):

| Operation | Baseline | Candidate | React | Svelte |
|---|---|---|---|---|
| Create | 29.231, 29.502, 33.653, 18.682 | 27.620, 28.620, 24.952, 20.540 | 25.083, 31.718, 19.911, 25.870 | 29.288, 32.372, 28.505, 18.125 |
| Clear | 4.117, 4.962, 5.010, 3.292 | 3.877, 4.739, 3.868, 3.470 | 4.616, 6.304, 3.806, 4.524 | 3.312, 3.450, 3.202, 2.521 |

## Independent confirmation

Study `studies/run-09c62b672413475eb19166757fe0478d`; 20 passing cases; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.192 | 3.222 | 3.217 | 3.433 |
| 100 | Update | 1.255 | 1.248 | 1.463 | 1.412 |
| 100 | Select | 1.096 | 1.100 | 1.326 | 1.297 |
| 100 | Append | 1.648 | 1.611 | 1.762 | 1.721 |
| 100 | Swap | 1.298 | 1.280 | 3.482 | 1.378 |
| 100 | Remove | 1.491 | 1.496 | 1.747 | 1.542 |
| 100 | Clear | 1.148 | 1.175 | 1.387 | 1.243 |
| 1000 | Create | 51.040 | 55.668 | 64.671 | 43.389 |
| 1000 | Update | 7.168 | 6.198 | 7.837 | 6.717 |
| 1000 | Select | 2.803 | 2.595 | 3.880 | 2.769 |
| 1000 | Append | 13.615 | 13.271 | 11.614 | 9.391 |
| 1000 | Swap | 3.595 | 3.907 | 64.073 | 3.726 |
| 1000 | Remove | 6.611 | 7.732 | 6.560 | 6.091 |
| 1000 | Clear | 7.950 | 7.311 | 8.908 | 6.922 |

Selected 1000-row medians by process, in repetition order (not pooled):

| Operation | Baseline | Candidate | React | Svelte |
|---|---|---|---|---|
| Create | 23.480, 99.283 | 20.483, 103.039 | 21.443, 106.147 | 22.528, 95.060 |
| Clear | 3.156, 14.548 | 3.185, 12.486 | 4.995, 13.528 | 2.678, 11.310 |

## Disposition

Pooled 1000-row clear changes from 4.419 to 3.871 ms in the principal study and 7.950 to 7.311 ms in confirmation. However, confirmation baseline creation medians change from 23.480 to 99.283 ms across its two processes; React changes from 21.443 to 106.147 and Svelte from 22.528 to 95.060. Clear in the first process pair changes from 3.156 to 3.185 ms. Pooled medians conceal this variation. No host, thermal, power, browser or garbage-collection cause has been established, and no benchmark-failure or product-regression conclusion is inferred solely from it.

The candidate was restored rather than claiming a reliable speedup. A future performance decision needs measurements whose process-level variation is understood; repeating until a favorable result appears would not resolve this uncertainty. The summary CLI now prints every process median alongside pooled medians. `--stdout-only` revalidates retained studies and prints them without replacing their existing summary files. This adds visibility without changing the sample population, clock or acceptance thresholds.

The region test measures collective clearing independently of its native primitive and additionally checks anchor identity. It still covers native-resource release, refill, user-cleanup observation/order, foreign siblings, recursive ownership and cleanup errors. The runtime and compiler are unchanged.

After restoration, check/build and 510 Node tests across 40 files passed across the selected 42 phases in `test-runs/resumed-27d88891393b41fab152242ae185964e`. This resumed report references the first 35 passing phases from `test-runs/run-cfcc49ae938240f490f723d84566bcd3` and seven subsequent test-file phases. The original run failed with EPERM while removing dist in spike.test; a first retry (`test-runs/resumed-2f7554f0c2334d9397d7a6f014df78f0`) could not import a module from the incomplete build. The successful recovery first reran the original build command, then reran the entire affected file and all remaining files, with unchanged limits and assertions. Failed attempts remain visible and are not counted as passing tests. The initial filesystem-error cause was not established. Candidate preflight passed in `diagnostics/run-ee6d0c6ff3764339bd2ff04ca4f47fec`. No cold-start, peak-memory, general leak, product-parity or new runtime-performance claim is made.

Reproducer: `elnor/.elnor/mvp/framework-comparison/reports/native-clear/producer.py`. Previous retained optimization: [Direct roots and exclusive teardown](DIRECT-ROOT-STUDY.md). Previous callback-loop trials: [Scope disposal study](SCOPE-DISPOSAL-STUDY.md).
