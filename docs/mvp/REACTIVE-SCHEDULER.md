# Reactive scheduler hardening

**Later closure:** [core readiness](CORE-READINESS.md) adds consumption of
invalidations queued before an already captured effect runs. The following
records the earlier failure-isolation and follow-up scheduling change.

The retained core now completes the live effects in a queued batch even if one reaction fails. It also queues at most one follow-up microtask for writes produced during that batch. This is a correctness and scheduling change, not an accepted CPU speedup.

## Reproduced failure

The previous flush copied and cleared pending effects, then aborted at the first thrown exception. Later independent effects from that copied batch were lost. Their cells had already changed, so the application could retain stale UI until another write happened to notify them. The scheduler also disarmed itself before running a batch: a chained write queued one microtask and the flush tail queued another empty one.

The before-change run `test-runs/scheduler-before-f8cc4de7bc1545e0bc0927bfa79cea57` has three failing regressions out of eleven tests (four initial scheduler cases plus seven existing dependency cases). It demonstrates a dropped healthy update, missing ordered aggregation of multiple failures, and two follow-up callbacks where only one is needed. The expected failing record is retained, including its logs and zero remaining owned processes.

## Retained behavior

- Capture the pending batch while keeping the scheduler armed.
- Attempt every still-live effect in order. A disposed effect remains skipped.
- Allocate an error list only if a reaction throws.
- Disarm after the batch, then schedule one follow-up if work remains.
- Rethrow a single original value, including undefined; report multiple failures in an ordered AggregateError.

Errors remain visible to the host microtask error reporting. Work enqueued by a failed reaction is scheduled before its error is reported. There is no automatic retry loop for a failed effect: later dependency writes can notify it again. Initial effect creation keeps its existing immediate error cleanup.

This is not an atomic transaction or async rollback guarantee. Successful writes and effects are not reversed. General promise cancellation, cycle detection and recovery of every structural-update failure are not introduced. Surface syntax, native event listeners, keyed reconciliation, owner cleanup and dependency representation remain.

## Validation and provenance

Six scheduler regression tests cover independent-update survival/recovery, ordered multiple failures, chained work after an error, removal of the duplicate empty flush, disposal during a failing batch, and a single thrown undefined. Existing reactive dependency, rollback, ownership and reconciliation tests remain enabled.

Check/build and **516 Node tests across 41 files** passed in `test-runs/run-6d23fc7fe007431399d6a4d317a4765e` (43 supervised phases, no skipped files). Browser preflight `diagnostics/run-5b6d07397f3b4a5c9f2d0abf1fc41977` passed all 42 checks across Elnor, React and Svelte at both sizes. These checks establish normal fixture behavior, not browser error-reporting coverage for every host. The targeted follow-up is retained in `test-runs/scheduler-after-a871c48388b24527b70728185f2f7fc3`.

The active correctness fixture is `run-ukbjyh`, runtime SHA-256 `73d209466607f0a0008e88eaa1359dd68d14dd6e9f4b29377fab695ae309eb66`. Compiler SHA-256 remains `3920447ad2670f323dada62e8e6847f7aec71b4c28e45c20b877f7a796f46ae3`. Evidence identifiers are relative to `elnor/.elnor/mvp/framework-comparison/`. The earlier direct-root fixture `run-OLDLti` remains the historical performance baseline.

Comparison-bundle size changes from 6766 to 6919 raw bytes, 2914 to 2940 gzip, and 2626 to 2650 Brotli. The 26 added gzip bytes buy error isolation; no CPU improvement percentage is inferred from byte size or callback counts.

All heavy commands use the existing Windows Job supervisor, with at most 10% aggregate CPU, 768 MiB commit and 24 processes; browser cases use sandboxed headless Edge with GPU disabled and 45-second wall/12-second progress limits, while Node phases use 60-second limits. Every selected verification phase has zero owned processes after cleanup.

## Remaining performance work

The [A/A and accessibility investigation](REPEATABILITY-STUDY.md) found double-digit apparent differences with identical code and substantial accessibility lifecycle cost in all three frameworks. Paired measurements with contemporaneous controls and accessibility observations remain pending. The scheduler fix is retained for reproduced correctness defects; neither it nor the completed tests establishes framework parity, general production readiness or a fully polished core.

Sources: [runtime](../../src/runtime.mjs), [regressions](../../tests/reactive-scheduler.test.mjs). Reproducer: `elnor/.elnor/mvp/framework-comparison/reports/reactive-scheduler/producer.py`.
