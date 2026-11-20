# Notification subscriber snapshots

The retained runtime queues subscribers directly from their private Set instead of first copying it to an array. Behavioral tests, source counters and bounded browser microbenchmarks support this simplification. Application timing remains mixed; isolated notification-loop results are not a general rendering speedup.

## Phase invariant and semantics

notify only adds effect references to pending. It does not execute effects or user callbacks while iterating the private subscriber Set under the ordinary platform intrinsics. Subscription changes occur when effects later run. The scheduling flag, Set deduplication and insertion order remain. The snapshot in flush is preserved because that phase does execute user code and can enqueue or dispose effects.

Four new behavioral regressions pass before and after the change: notification remains asynchronous; a later subscriber does not join a past write; a subscriber created during a flush runs initially without joining the captured batch; reentrant writes settle; and dependency replacement/disposal leaves only live subscriptions. Existing error-isolation, structural-recovery and callback-order tests remain. Replacing native Set/queueMicrotask behavior with arbitrary hostile implementations is not a new supported contract.

## Source-counter observations

Separate transformed fixtures and diagnostics `diagnostics/run-b29ebfeda44a4e9a9b4ab184166a7dae` / `diagnostics/run-faea1edfd98742099e5dce64d0a9a65e` capture all seven operations at 1000 rows. Their ordinary source counterparts are `run-9EYGTh` and `run-sPU8kb`. Probe sources are retained in `allocation-probe-QuElna` and `allocation-probe-ijcyM4`; instrumented fixtures are `run-k7PCgG` and `run-cUYbtx`.

| Action | Notifications A/B | Snapshot expressions A/B | Enqueue attempts A/B |
|---|---:|---:|---:|
| create | 1 / 1 | 1 / 0 | 3 / 3 |
| update | 101 / 101 | 101 / 0 | 203 / 203 |
| select | 1 / 1 | 1 / 0 | 3 / 3 |
| append | 1 / 1 | 1 / 0 | 3 / 3 |
| swap | 1 / 1 | 1 / 0 | 3 / 3 |
| remove | 1 / 1 | 1 / 0 | 3 / 3 |
| clear | 1 / 1 | 1 / 0 | 3 / 3 |

Update removes 101 executions of the array-snapshot expression while retaining 101 notifications and 203 enqueue attempts. Other constructor/scope/effect counters agree. These are source-expression counts, not exact allocated objects/bytes, net heap savings or CPU attribution. Set iteration and other allocations still exist, and engines can optimize allocation expressions. Heap sampling is diagnostic and perturbs execution.

## Bounded isolated browser experiment

A separate bare page imports the two raw uninstrumented runtimes as distinct modules. It performs signal-write loops with native queued flushes, no application DOM mutations or frame waits. TaskDuration/threadTicks covers the write loop, its coalesced flush and protocol overhead; loop wall time is retained separately. Final values and effect counts are checked outside the timed CPU window. Two warmup rounds precede eight measured rounds, alternating A/B order across scenarios and rounds.

Three fresh owned browser processes are retained: initial A/B, a same-candidate A/A control, and one A/B confirmation. This is not a representative UI workload, a significance test or a framework comparison. Compare within a row and run; different subscriber/write counts are separate scenarios.

| Scenario | Cells | Subscribers/cell | Writes | First A | First B | A/A label A | A/A label B | Confirm A | Confirm B |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| orphan | 1 | 0 | 200000 | 14.157 | 13.098 | 12.132 | 12.689 | 12.826 | 11.677 |
| burst-2 | 1 | 2 | 200000 | 18.327 | 14.634 | 15.415 | 14.774 | 15.933 | 13.977 |
| spread-1000x2 | 1000 | 2 | 10000 | 1.748 | 1.507 | 1.466 | 1.433 | 1.516 | 1.424 |
| burst-8 | 1 | 8 | 50000 | 6.742 | 6.482 | 5.762 | 6.027 | 6.107 | 5.277 |
| burst-64 | 1 | 64 | 10000 | 6.788 | 5.412 | 4.648 | 4.626 | 5.359 | 4.410 |

Values are eight-sample renderer CPU medians in ms. For burst-2, 18.327/14.634 ms in the first A/B and 15.933/13.977 ms in confirmation favor the direct loop, while the A/A control is 15.415/14.774 ms. All five scenarios are shown, including the small first-run burst-8 difference. This supports lower isolated cost in these captures, not the same percentage improvement in an application. No numeric acceptance margin is inferred.

Microbenchmark evidence: `diagnostics/notify-micro-2a706cb39c3d447cb51bababb35a7bc2`, `diagnostics/notify-micro-aa-cf1617380dce42eba2c9b10993066c69`, `diagnostics/notify-micro-confirm-f7b1c6e8e83d46d494d062ef51a740cc`.

## Application-level timing

Study `interleaved-studies/run-c2f673d440f545629428733fba15a2fa` completes eight action-interleaved pairs: A/A and baseline/candidate at 100 and 1000 rows, with reversed initial order seeds, two warmups and seven normal samples per action. It intentionally measures this core change rather than repeating framework-control cohorts; earlier framework data is not pooled into it. Accessibility observations remain separate post-timing creation traces. All pairs and source/round/visibility/schema checks pass.

The following tables retain every action and both seeds. Numbers are per-context seven-sample TaskDuration CPU medians in ms; delta is 100 × (B/A − 1). Positive means B consumed more CPU. Order alternates per action/round within each seed.

## A/A: identical current runtime

| Rows | Action | Seed AB: A | Seed AB: B | Delta | Seed BA: A | Seed BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 7.326 | 7.081 | -3.34% | 7.191 | 7.180 | -0.15% |
| 100 | update | 1.638 | 1.616 | -1.34% | 1.526 | 1.673 | +9.63% |
| 100 | select | 1.142 | 1.132 | -0.88% | 1.113 | 1.169 | +5.03% |
| 100 | append | 2.073 | 2.218 | +6.99% | 2.010 | 2.119 | +5.42% |
| 100 | swap | 1.632 | 1.630 | -0.12% | 1.563 | 1.524 | -2.50% |
| 100 | remove | 1.926 | 1.940 | +0.73% | 1.817 | 1.834 | +0.94% |
| 100 | clear | 1.909 | 1.884 | -1.31% | 1.880 | 1.847 | -1.76% |
| 1000 | create | 68.117 | 69.211 | +1.61% | 67.486 | 67.287 | -0.29% |
| 1000 | update | 5.508 | 5.952 | +8.06% | 5.719 | 6.407 | +12.03% |
| 1000 | select | 2.146 | 2.075 | -3.31% | 2.013 | 2.105 | +4.57% |
| 1000 | append | 9.299 | 9.890 | +6.36% | 9.605 | 9.404 | -2.09% |
| 1000 | swap | 3.216 | 3.390 | +5.41% | 3.264 | 3.442 | +5.45% |
| 1000 | remove | 6.905 | 7.276 | +5.37% | 6.787 | 6.629 | -2.33% |
| 1000 | clear | 9.719 | 9.990 | +2.79% | 9.364 | 9.265 | -1.06% |

## Change: snapshot A, direct iteration B

| Rows | Action | Seed AB: A | Seed AB: B | Delta | Seed BA: A | Seed BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 7.516 | 7.078 | -5.83% | 8.325 | 8.316 | -0.11% |
| 100 | update | 1.658 | 1.594 | -3.86% | 1.748 | 1.923 | +10.01% |
| 100 | select | 1.218 | 1.213 | -0.41% | 1.448 | 1.276 | -11.88% |
| 100 | append | 2.114 | 2.200 | +4.07% | 2.339 | 2.406 | +2.86% |
| 100 | swap | 1.619 | 1.559 | -3.71% | 1.790 | 1.762 | -1.56% |
| 100 | remove | 1.902 | 2.005 | +5.42% | 2.072 | 1.953 | -5.74% |
| 100 | clear | 1.849 | 1.788 | -3.30% | 1.934 | 2.075 | +7.29% |
| 1000 | create | 66.668 | 67.438 | +1.15% | 67.551 | 66.065 | -2.20% |
| 1000 | update | 5.638 | 5.756 | +2.09% | 5.640 | 6.186 | +9.68% |
| 1000 | select | 1.999 | 2.028 | +1.45% | 2.138 | 2.100 | -1.78% |
| 1000 | append | 8.655 | 8.913 | +2.98% | 9.215 | 9.196 | -0.21% |
| 1000 | swap | 3.339 | 3.235 | -3.11% | 3.366 | 3.284 | -2.44% |
| 1000 | remove | 6.452 | 6.395 | -0.88% | 6.535 | 6.777 | +3.70% |
| 1000 | clear | 9.388 | 9.376 | -0.13% | 9.680 | 9.770 | +0.93% |

Application update medians at 1000 rows are higher for B in both seeds (+2.09%/+9.68%); the identical-code A/A also has B higher (+8.06%/+12.03%). Creation and other actions change sign or magnitude. These data do not establish either an application-wide speedup or a reliable regression attributable to this change. Unfavorable values are retained rather than overridden by the isolated result.

## Verification, footprint and limits

Check/build and **543 Node tests across 44 files** pass in `test-runs/run-3a12a540818446ad9fd69c9bb3320c0c` (46 supervised phases). Before/after focused gates are `test-runs/notify-before-c90daf7790a949c2aac374b43e1fb70e` and `test-runs/notify-after-7d1ec24f0127488d81c114c88d412db8`. These new tests validate equivalence and pass on both implementations; they are not a claimed before-change bug.

Preflight `diagnostics/run-ab22db13dd054886b67863e6565beb4c` passes 42 normal checks across both sizes/all frameworks. Native DOM/error/listener/text-repair fixture `test-runs/notify-browser-e9c3ea65f1294cb082c8efe6460ef90e` passes both fragment/direct-root variants. Deliberate rejection `diagnostics/run-30d50c2b73ef4955bafba4b3bfdd1235` confirms that an allocation-instrumented fixture cannot supply timing evidence: exit 1 before browser launch, with zero remaining owned processes. That expected failed worker is not a passing timing case.

The active fixture is `run-sPU8kb`, runtime SHA-256 `294540d7911cf459fd714f2655386c80e45644fd4c5cc6dd960e657d965476e2`; compiler SHA-256 remains `3920447ad2670f323dada62e8e6847f7aec71b4c28e45c20b877f7a796f46ae3`. Bundle size changes from 7060 to 7056 raw bytes, 2964 to 2959 gzip, and 2677 to 2674 Brotli: 5 fewer gzip bytes.

Every heavy command stays in the Windows Job envelope: at most 10% aggregate CPU, 768 MiB commit and 24 processes; sandboxed headless Edge with GPU disabled, 45-second browser wall/12-second progress limits, and 60-second Node-test limits. Selected phases verify limits and zero remaining owned processes. Neither memory leak freedom, peak-memory improvement nor product parity is established.

Sources: [runtime](../../src/runtime.mjs), [notification regressions](../../tests/notification-queue.test.mjs), [diagnostic counters](../../benchmarks/runtime/instrument-allocations.mjs). Reproducer and isolated browser sources: `elnor/.elnor/mvp/framework-comparison/reports/notify-snapshots/`. Evidence identifiers are relative to `elnor/.elnor/mvp/framework-comparison/`. Previous increment: [Text write guard](TEXT-WRITE-GUARD.md).
