# Cancellation correction: broad cost study and rejected part reuse

**No new production change was retained.** The cancellation-correct runtime stays
in place. Its first cohort showed higher 1,000-row creation CPU, but a declared
repeat did not reproduce a consistent increase across both orders. A separate
part-object reuse candidate did not recover creation cost and showed tradeoffs,
so it remains private. Neither performance neutrality nor a general slowdown is
established by these descriptive observations.

## Sources and scope

The compiler is identical throughout. First compare the pre-cancellation runtime
with the retained corrected runtime, then compare the corrected runtime against
an isolated reuse candidate. Candidate comparisons are separate cohorts; do not
multiply or subtract their percentages to estimate a direct old-to-candidate gain.
No new React/Svelte timing ranking or whole-tree cloning result is produced.

| Source | SHA-256 |
|---|---|
| Previous runtime | `cf122b7f0c52d66aa360b981229f74af36f40740339c4399d5d7a959442821ab` |
| Retained corrected runtime | `fef7558b628ac2c20be2b3e53e579fb1d7dccfef96cb828f27b67912f54fd1ef` |
| Rejected reuse candidate | `a5e190255c16835e597c6161da22ae2ecd7145c07db38ddcaddb5aa1fb29c9c5` |
| Unchanged compiler | `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95` |

Fresh current fixtures are `matrix-bO5ybw` and
`run-H6SwdC`. Matching previous fixtures
are matrix-oq6mmg and run-MLugkN. Candidate fixtures are matrix-ASvOJK and
run-c0u39d. Checked source identities, dependencies, site hashes, driver and
workload controls are retained with their respective manifests and reviewers.
Generated binding diagnostics embed immutable fixture paths; minifier names may
also differ, so these are not claimed to be byte-identical application bundles.

The broad matrix covers a counter, six-input form, six-level composition and
updates among 24 local panels. Lists cover all seven actions at 100 and 1,000 rows.
Every pair uses a fresh sandboxed headless Edge 157.0.4341.42, two warmups and
seven measured samples per label/action. Page activation alternates by action and
round; AB/BA reverses the seed. Renderer ThreadTime is the metric in the tables,
in milliseconds, not wall latency. Positive percentages mean higher CPU.

Matrix A/A uses the declared baseline on both pages; list A/A uses the declared
current/candidate on both pages. A/A is descriptive, not a threshold to subtract
from a change pair. There is no accepted equivalence margin or significance test.
No observations were removed or pooled across different workloads/cohorts.

## 1. Previous versus corrected runtime

The first 1,000-row creation pairs were 17.201 -> 19.952 ms (+16.0%) and
19.999 -> 24.536 ms (+22.7%), with A/A +7.9%/+4.1%. This justified investigating
construction bookkeeping, but does not identify the cause. The small matrix was
mixed, including sign changes on several actions and variation in A/A controls.

Aggregate metrics also vary outside script: for creation AB, ScriptDuration was
3.915 -> 4.292 ms and LayoutDuration 6.172 -> 6.475 ms; BA script was
4.909 -> 4.513 ms while layout was 6.717 -> 9.120 ms. These are separate medians,
not disjoint trace budgets. They cannot be added/subtracted to attribute residual
CPU or establish that Set operations caused the initial difference.

| Workload/action | Previous ms AB / BA | Current ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| counter/mount | 0.951 / 0.890 | 0.936 / 0.916 | -1.6 / +2.9 | -3.4 / +11.6 |
| counter/increment | 0.879 / 0.833 | 0.862 / 0.811 | -1.9 / -2.6 | +0.9 / -0.2 |
| counter/unmount | 0.899 / 0.764 | 0.891 / 0.758 | -0.9 / -0.8 | -8.3 / +5.7 |
| form/mount | 1.232 / 1.172 | 1.136 / 1.105 | -7.8 / -5.7 | +11.3 / +2.6 |
| form/edit-one | 1.124 / 1.035 | 1.138 / 0.928 | +1.2 / -10.3 | +21.6 / -7.3 |
| form/edit-all | 1.102 / 1.095 | 1.102 / 1.119 | -0.0 / +2.2 | +9.5 / -0.7 |
| form/invalid | 1.074 / 1.002 | 1.057 / 0.988 | -1.6 / -1.4 | -3.3 / -5.6 |
| form/recover | 1.024 / 0.966 | 1.046 / 1.021 | +2.1 / +5.7 | +4.6 / +8.9 |
| form/unmount | 0.856 / 0.766 | 0.804 / 0.778 | -6.1 / +1.6 | -4.0 / -7.8 |
| composition/mount | 1.114 / 1.041 | 1.049 / 1.052 | -5.8 / +1.1 | +0.8 / +13.9 |
| composition/relay | 0.837 / 0.884 | 0.830 / 0.845 | -0.8 / -4.4 | +2.8 / -10.3 |
| composition/unmount | 0.767 / 0.777 | 0.788 / 0.802 | +2.7 / +3.2 | -5.2 / +1.3 |
| localized/mount | 1.827 / 1.679 | 1.798 / 1.707 | -1.6 / +1.7 | -1.7 / +0.1 |
| localized/local-update | 0.970 / 0.989 | 0.969 / 0.971 | -0.1 / -1.8 | +4.4 / +4.6 |
| localized/unmount | 0.911 / 0.857 | 0.923 / 0.860 | +1.3 / +0.4 | -0.3 / +0.1 |

| Workload/action | Previous ms AB / BA | Current ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| 100/create | 4.277 / 3.565 | 4.262 / 3.462 | -0.4 / -2.9 | -4.1 / +3.5 |
| 100/update | 1.598 / 1.321 | 1.502 / 1.259 | -6.0 / -4.7 | -1.0 / +4.0 |
| 100/select | 1.351 / 1.131 | 1.616 / 1.120 | +19.6 / -1.0 | +1.3 / -1.2 |
| 100/append | 1.916 / 1.617 | 1.740 / 1.533 | -9.2 / -5.2 | +0.3 / +3.1 |
| 100/swap | 1.861 / 1.409 | 1.954 / 1.284 | +5.0 / -8.9 | -3.0 / -2.4 |
| 100/remove | 1.731 / 1.478 | 1.885 / 1.575 | +8.9 / +6.6 | +4.9 / +9.4 |
| 100/clear | 1.398 / 1.257 | 1.390 / 1.263 | -0.6 / +0.5 | -5.1 / +0.6 |
| 1000/create | 17.201 / 19.999 | 19.952 / 24.536 | +16.0 / +22.7 | +7.9 / +4.1 |
| 1000/update | 3.317 / 4.113 | 3.488 / 3.660 | +5.2 / -11.0 | -0.4 / +3.3 |
| 1000/select | 1.977 / 2.584 | 2.083 / 2.262 | +5.4 / -12.5 | -6.5 / -5.1 |
| 1000/append | 4.347 / 4.541 | 4.101 / 5.874 | -5.7 / +29.4 | +11.8 / -31.0 |
| 1000/swap | 2.646 / 2.690 | 2.425 / 2.612 | -8.4 / -2.9 | +7.7 / +15.2 |
| 1000/remove | 3.127 / 3.590 | 3.268 / 3.467 | +4.5 / -3.4 | -8.6 / -8.2 |
| 1000/clear | 3.231 / 3.368 | 3.253 / 3.357 | +0.7 / -0.3 | +5.3 / -2.6 |


## 2. Isolated part-object reuse, rejected

The private candidate keeps the object already registered in the staged set as
the committed row. It removes the post-build delete/add cycle and row spread-copy;
in-flight nodes begin as null rather than a temporary empty array. Cleanup handles
an unfinished part without reading null nodes. Ownership is still registered before
user callbacks and cancellation guards remain. This is Elnor-specific bookkeeping,
not a port of Svelte's ownership or DOM construction model.

Both variants pass 45 directed runtime tests from the same five test files,
including all seven cancellation regressions. The candidate's broad matrix,
preflight and list controls pass. That establishes the stated controls, not a
benefit: 1,000-row creation was +1.4%/+0.6% against the corrected runtime, while
form invalidation was +15.1%/+5.3%. Other actions were mixed. The apparent reduction
in source-level allocations is insufficient reason to integrate this variant.
No exact heap saving, faster core or recovered creation cost is claimed.

| Workload/action | Previous ms AB / BA | Current ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| counter/mount | 0.896 / 0.927 | 0.914 / 0.868 | +2.0 / -6.4 | +3.8 / +2.6 |
| counter/increment | 0.778 / 0.780 | 0.819 / 0.812 | +5.3 / +4.1 | +0.7 / -0.1 |
| counter/unmount | 0.773 / 0.761 | 0.748 / 0.785 | -3.2 / +3.2 | -3.5 / +3.3 |
| form/mount | 1.192 / 1.186 | 1.156 / 1.135 | -3.0 / -4.3 | +0.1 / +0.4 |
| form/edit-one | 1.100 / 1.030 | 1.083 / 1.084 | -1.5 / +5.2 | -1.5 / -2.6 |
| form/edit-all | 1.082 / 1.153 | 1.119 / 1.115 | +3.4 / -3.3 | +4.2 / -1.5 |
| form/invalid | 1.015 / 1.003 | 1.168 / 1.056 | +15.1 / +5.3 | +1.5 / -0.1 |
| form/recover | 1.152 / 1.029 | 1.032 / 0.959 | -10.4 / -6.8 | +11.7 / -7.4 |
| form/unmount | 0.852 / 0.790 | 0.793 / 0.794 | -6.9 / +0.5 | -2.9 / +0.8 |
| composition/mount | 1.164 / 1.077 | 1.149 / 1.094 | -1.3 / +1.6 | +1.3 / +10.2 |
| composition/relay | 0.898 / 0.893 | 0.904 / 0.875 | +0.7 / -2.0 | +5.7 / +2.6 |
| composition/unmount | 0.883 / 0.809 | 0.792 / 0.836 | -10.3 / +3.3 | -0.8 / +1.3 |
| localized/mount | 2.233 / 1.711 | 1.786 / 1.709 | -20.0 / -0.1 | +4.4 / -10.0 |
| localized/local-update | 0.953 / 1.024 | 0.992 / 0.975 | +4.1 / -4.8 | -0.6 / -4.7 |
| localized/unmount | 0.918 / 0.847 | 0.847 / 0.829 | -7.7 / -2.1 | +0.5 / +0.3 |

| Workload/action | Previous ms AB / BA | Current ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| 100/create | 3.561 / 4.752 | 3.414 / 3.771 | -4.1 / -20.6 | +0.9 / +0.2 |
| 100/update | 1.355 / 1.665 | 1.309 / 1.576 | -3.4 / -5.3 | +2.2 / -2.3 |
| 100/select | 1.139 / 1.365 | 1.249 / 1.375 | +9.7 / +0.7 | +1.0 / -3.0 |
| 100/append | 1.727 / 1.757 | 1.527 / 1.906 | -11.6 / +8.5 | -1.8 / +5.5 |
| 100/swap | 1.429 / 1.545 | 1.418 / 1.528 | -0.8 / -1.1 | -1.9 / +4.9 |
| 100/remove | 1.663 / 1.606 | 1.711 / 1.576 | +2.9 / -1.9 | +0.6 / -1.3 |
| 100/clear | 1.267 / 1.289 | 1.330 / 1.269 | +5.0 / -1.6 | -3.3 / +1.7 |
| 1000/create | 20.706 / 19.065 | 20.994 / 19.185 | +1.4 / +0.6 | +1.3 / -3.4 |
| 1000/update | 3.776 / 3.390 | 3.761 / 3.393 | -0.4 / +0.1 | -3.9 / -0.5 |
| 1000/select | 2.325 / 1.949 | 2.040 / 2.071 | -12.3 / +6.3 | -0.4 / +0.9 |
| 1000/append | 5.344 / 4.066 | 5.274 / 4.040 | -1.3 / -0.6 | -1.9 / -3.6 |
| 1000/swap | 2.818 / 2.735 | 2.718 / 2.425 | -3.5 / -11.3 | -7.5 / -4.7 |
| 1000/remove | 4.043 / 3.223 | 3.380 / 3.013 | -16.4 / -6.5 | -11.7 / -0.2 |
| 1000/clear | 4.281 / 2.965 | 3.482 / 3.019 | -18.7 / +1.8 | +7.0 / -10.4 |


## 3. Declared repeat of the original comparison

To examine the initial creation signal, a separate follow-up repeats only the
1,000-row size, retaining all seven actions, two A/A pairs and two change pairs.
It uses the same frozen previous/current fixtures and unchanged collection worker.
Its separate reader requires exactly the four declared plans and keeps all other
sample, schema, visibility, source and resource checks. It does not replace either
complete broad cohort above.

Creation now reads 17.740 -> 18.773 ms (+5.8%) in AB and
19.435 -> 19.199 ms (-1.2%) in BA. A/A is +13.7%/-1.9%. The original +16–23%
increase did not reproduce as a consistent effect in these two additional pairs.
This is a reason to retain uncertainty, not proof that the correction is free.

| Action | Previous ms AB / BA | Current ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| create | 17.740 / 19.435 | 18.773 / 19.199 | +5.8 / -1.2 | +13.7 / -1.9 |
| update | 3.369 / 3.348 | 3.159 / 3.258 | -6.2 / -2.7 | +6.3 / -1.9 |
| select | 1.875 / 1.873 | 2.007 / 1.962 | +7.0 / +4.8 | -0.8 / +0.6 |
| append | 3.998 / 4.089 | 4.144 / 4.277 | +3.7 / +4.6 | -7.1 / -4.0 |
| swap | 2.585 / 2.334 | 2.383 / 2.411 | -7.8 / +3.3 | +2.5 / -2.6 |
| remove | 3.015 / 2.984 | 3.198 / 3.015 | +6.1 / +1.0 | +1.4 / +1.5 |
| clear | 2.991 / 2.827 | 3.009 / 3.024 | +0.6 / +7.0 | +2.3 / +1.3 |

## Lifecycle, validation and retained state

In each broad cohort, eight baseline/current lifecycle records each contain eight
post-GC unmount cycles. DOM-node and listener counters return to their own baseline
in all those recorded cycles. Heap values include driver/browser state; this is
not an allocated-byte metric or proof of absence of leaks.

All **71 supervised phases passed** and ran serially: 32 in the initial broad
study, 34 in the reuse study, and five in the follow-up including its summary.
CPU10%, commit768MiB, maximum24 processes, host-free minimum4GiB and owner-close
cleanup stay enforced. Browser wall/idle limits remain45s/12s, Node60s/60s.
GPU stays disabled and accessibility enabled. List accessibility traces are
collected after timing and are not subtracted from measured CPU.

The production runtime/compiler were not changed this iteration. Their prior
complete **595-test plus check/build** gate still applies to those exact sources;
it was not rerun for a rejected private candidate. The candidate has 45 directed
tests per variant, not a claimed 595-test production validation. A setup identity
guard aborted before any child when newline normalization changed a private
baseline hash; exact bytes were restored and prior metadata retained. No test
failure or sample was silently discarded, and no safety limit was relaxed.

Internal root: `elnor/.elnor/mvp/framework-comparison/cancellation-cost-study`.
Initial study: `run-ba52015a0b0945a7bc2b481725a54795`. Candidate: `reuse-298195762af549a9b63cbab6643b3ccb`.
Follow-up: `repeat-3f3e77688abe44b790a6f070bea6a01d`. Each retains its producers, raw cases and summaries.
`verification.json` binds all 71 supervisors, exact report bytes and source state.
The complete report revision is also retained as `reviewed-report.md`.

Continue the bounded static-tree eligibility work with real compiler selection
and before/after semantic controls. Any later performance claim needs matching
sources and the broad matrix; this study does not close the Svelte/React parity
requirement or establish production readiness.
