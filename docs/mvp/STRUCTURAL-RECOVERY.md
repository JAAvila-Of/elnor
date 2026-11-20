# Structural update recovery

The retained core releases the resources of a failed queued each/when update and leaves its region empty, with the original anchor available for a later dependency write. Errors remain observable. This is local failure containment, not restoration of the previous UI or a transaction rollback.

## Reproduced problems

- A failed keyed update retained committed or newly staged row owners until the entire block was disposed. Staged buttons could retain active listeners and subscriptions despite never becoming visible.
- A conditional marked itself shown before construction finished. After a build failure, another dependency notification with the same truthy condition could skip reconstruction.
- Exclusive clearing forgot the row map before the collective DOM operation completed. If that operation threw, recovery no longer had the owned node references.
- A signal write with no subscribers queued an empty microtask, including after its subscribers were disposed.

The first nine structural regressions produced eight failures before the structural change. Additional retained failures isolate notification without subscribers and a throwing collective removal. Their logs remain under `test-runs/structural-before-b96c3f8a1be24b89b0635bc42bc7e6b3`, `test-runs/structural-expanded-3a3073e19f5641e6a03b752aeaa1ced1`, and `test-runs/collective-before-e3b823855bb04f1fb9f53ad4b98c46b3`.

## Recovery contract

Each block has a reset operation that relinquishes its own references before attempting all resource cleanup. A queued update catches read, key, build, removal and insertion failures, resets the affected block, and rethrows the original error. If cleanup also fails, an AggregateError retains the original cause and both failures. Other effects in the scheduler batch can still finish.

The reset preserves the structural anchor and outside siblings. Scope disposal and failed initial mounting also remove the anchor, using the existing outer cleanup boundary. Failed each updates discard both old committed rows and new staged rows; conditional reset clears its part and shown flag. A later dependency notification can rebuild using the existing anchor. Identical Object.is-equal assignments do not notify; there is no automatic retry loop.

Exclusive clearing retains row references until its collective DOM operation succeeds, so the ordinary error cleanup can still remove owned nodes if it throws. Its exclusivity/foreign-sibling/native-cleanup guards remain. Native listeners, independent effects, keyed identity, direct-root eligibility and the compiler are unchanged.

The notification scheduler now requires pending work before queuing a microtask. This removes empty notifications without a measured CPU-speedup claim.

This is not a general promise-rejection boundary, action cancellation mechanism or rollback of cell writes, user side effects or unrelated regions. It does not restore an externally removed anchor or guarantee cleanup against arbitrary hostile DOM monkeypatches. Tests inject selected insertion/removal failures to verify reference ownership and error handling.

## Verification

Check/build and **533 Node tests across 42 files** pass in `test-runs/run-a22f57e7264b4f4f88a6cf2520a52964` (44 supervised phases). Sixteen structural regressions cover generic and detached rows, duplicate/key/build/read/invalid-array failures, cleanup aggregation, same-truthy conditional retry, partial multi-node insertion, removal cleanup and exclusive-clear DOM failure. One additional scheduler regression covers writes without subscribers before subscription and after disposal. The seven-file focused gate is retained in `test-runs/structural-complete-23cb469155294f09a09489d7ea5ba588`.

Browser preflight `diagnostics\run-07ea9a93145149308c16b89ca7c44ad8` passes 42 normal workload checks across both sizes and all three frameworks. A separate owned headless Edge fixture `test-runs\structural-browser-e1c03de02cdc41eeaa7020e02c77207a` exercises actual DOM nodes, native listeners, microtasks and host error reporting. Its two variants (fragment and direct-root lists) capture four expected errors, preserve the unrelated sibling/update, recover both list and conditional, and leave disposed resources inactive. Unexpected error counts or identities fail the fixture. The raw runtime source and test module are retained with hashes, alongside a worker copy. This runtime-level fixture does not claim compiled browser coverage for every failure mode.

The active fixture is `run-BknsXh`, runtime SHA-256 `7eb855574dc1ac5e3bdbfffa0e0f1942ea396e6df1208f89d96e1c82a6500a91`. Compiler SHA-256 remains `3920447ad2670f323dada62e8e6847f7aec71b4c28e45c20b877f7a796f46ae3`. Comparison-bundle size changes from 6919 to 7006 raw bytes, 2940 to 2955 gzip, and 2650 to 2670 Brotli (15 added gzip bytes).

Heavy commands retain the Windows Job limits: at most 10% aggregate CPU, 768 MiB commit and 24 processes; browsers are sandboxed headless Edge with GPU disabled and 45-second wall/12-second progress deadlines; Node phases have 60-second deadlines. Every selected supervised phase reports zero remaining owned processes. Evidence paths are relative to `elnor/.elnor/mvp/framework-comparison/`.

## Remaining scope

These reproduced defects are fixed; this does not certify an entirely polished or production-ready core. Paired performance comparisons under observed accessibility conditions remain pending. Neither the smaller callback count nor the test results establishes a general CPU gain or framework parity. Historical timings remain historical.

Sources: [runtime](../../src/runtime.mjs), [structural regressions](../../tests/structural-recovery.test.mjs), [scheduler regressions](../../tests/reactive-scheduler.test.mjs), [surface contracts](../surface/MVP-CONTRACTS.md). Previous hardening: [Reactive scheduler](REACTIVE-SCHEDULER.md).

Reproducer (from workspace root): `elnor/.elnor/mvp/framework-comparison/reports/structural-recovery/producer.py --browser elnor/.elnor/mvp/framework-comparison/test-runs/structural-browser-e1c03de02cdc41eeaa7020e02c77207a --preflight elnor/.elnor/mvp/framework-comparison/diagnostics/run-07ea9a93145149308c16b89ca7c44ad8`. Browser worker and case module live beside the producer and run through the existing supervisor.
