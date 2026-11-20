# Preserve cleanup and collective DOM errors

**A minimal correctness fix is integrated.** When disposing native row resources
and the subsequent collective DOM removal both failed, clearRegion's finally block
replaced the cleanup failure with the DOM error. Callers could no longer inspect
the original failure. Both failures are now preserved, in order, without enabling
the experimental collective full-unmount path.

## Resulting behavior

Cleanup still attempts all row owners. The bulk-detach flag is restored in finally
before DOM removal or fallback. If cleanup failed, the existing failWithCleanup
helper performs the DOM step: a successful removal rethrows the original cleanup
value unchanged, and a second failure produces an AggregateError whose errors are
[cleanupError, domError] and whose cause is cleanupError. Multiple cleanup errors
remain their existing ordered AggregateError inside that first entry.

A separate boolean records whether cleanup failed. Legal thrown values such as
undefined must not be mistaken for success. DOM-only failures retain their original
identity. Existing reset fallback and anchor cleanup remain responsible for
detaching owned DOM after failed clear; listener cleanup continues independently.

Only clearRegion's error propagation changed in the production runtime. The
compiler, grammar, public exports, scheduler and ordinary full-unmount reset path
did not change. No CPU speedup or performance neutrality is inferred from this fix.

## Validation

Five public regressions cover cleanup+DOM failures with Error/undefined, preserving
a sole cleanup failure unchanged with Error/undefined, and ordered multiple cleanup
failures followed by a DOM failure. They also check final owned DOM and retained
listener cleanup. Against the prior runtime, three fail and two pass; after the
fix all five pass. The complete project gate passes **600 tests plus check/build
across53 serial phases**.

Separately, four combined-failure regressions first failed in the private full-
unmount candidate and then passed there, bringing its directed suite to56 tests.
That private suite is not the complete production gate. The source comparison in
correctness-verification.json verifies that the public change contains only the
minimal error fix, not the candidate's bulk-disposal behavior.

Public red/green: `correctness-b560452c59af464f839b8ae96a1a009a` / `correctness-2213742db98f4d02a8d8213ddbf29eac`.
Full gate: `run-2155518b7855485684ea270ac26dcba6`.
Private red/green: `tests-candidate-eecaa12b2b134a0a996f79cb635d3a5b` / `tests-candidate-bf27ca9a9a3843b0bd282f8a431f94ca`.
All preserve their exact sources, tests and outputs.

## Performance experiment remains pending

The private candidate is `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`. Its new fixture `run-Ymymmq`
replaces the earlier c5ef candidate fixture for that revision. Four A/A pairs passed
at100/1,000 rows before the first change pair was terminated by host-memory-pressure.
No complete cohort or baseline/candidate timing result exists; these observations
are retained but are not used as evidence of benefit. The Job closed only its own
process tree, ending at zero active children. The host-free guard remains4GiB.

The integrated correctness fix changes the production baseline. Before resuming
the unmount experiment, build a new matching baseline fixture from this source
and use a fresh declared cohort. Do not reuse the earlier fef7558b baseline as if
it were current, pool aborted attempts, or alter any frozen fixture. The normal
benchmark adapter's earlier unmount preparation error is corrected and its failed
run remains retained. No guard was lowered and no unrelated processes were killed.

This iteration audits63 supervised records: 60 successful phases and
3 retained failures (the two expected regression-red runs and the
memory-aborted benchmark pair). Exact per-record outcomes are retained. Earlier
fixture-counter, adapter and memory-prelaunch attempts remain separately audited
in pending-verification.json; they are not merged into a passing cohort.

Internal root: `elnor/.elnor/mvp/framework-comparison/region-disposal-study`.
Reviewed report bytes are preserved as correctness-reviewed-report.md. Existing
profile and timing reports refer to their own earlier source revisions; no new
React/Svelte ranking or production-readiness claim is established.

Current production runtime: `6a3c38d100373c9c226753697f8e54234969bc66083593133485a7b41f1f8cd3`

Unchanged compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`
