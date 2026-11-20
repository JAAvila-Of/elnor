# One record for native reactivity and scheduling

Native owned views now use the same task object as both the general-cell subscriber and scheduled job. Shared prototype methods implement tracking, invalidation, execution and disposal. The native frame no longer keeps a second reaction array or per-task reaction facade. Dependency collections and region-slot bookkeeping remain separate; each text still has its own task. This does not group readers, alter event delivery or change Surface/TypeScript interfaces. Other region modes retain their previous mechanism.

This is an Elnor implementation of the single-record direction studied in Svelte effect creation/scheduling. It is not a complete adoption of Svelte architecture. The native constructor remains imperative; the rejected template experiment is not reintroduced.

## Validation

The complete backend suite passes 470 tests, including new native tests for writes during a reader and dynamic branch dependency retirement. Four capability controls plus ten focused native controls pass. Compatibility passes 71 tests. Seven browser fixtures pass 112 cycles; another 16-cycle probe checks reader boundaries and collects three nodes with callback/disposer retained. Existing fake-DOM controls collect ten additional nodes. All sources are matched to the measured snapshot.

## Primary candidate/control matrix

Renderer main-thread CPU milliseconds, balanced AB/BA medians. Thirty-five serial contained Jobs, 1,624 samples and 58 checks. AA and both orders are retained. Values are not elapsed interaction latency or FPS; no significance test is claimed.

| Workload | Action | Unified record | Previous | Change |
| --- | --- | ---: | ---: | ---: |
| counter  | mount | 1.128 | 1.118 | +0.9% |
| counter  | increment | 1.090 | 1.033 | +5.6% |
| counter  | unmount | 0.940 | 0.946 | -0.7% |
| form  | mount | 1.478 | 1.497 | -1.3% |
| form  | edit-one | 1.369 | 1.286 | +6.5% |
| form  | edit-all | 1.369 | 1.365 | +0.3% |
| form  | invalid | 1.307 | 1.315 | -0.6% |
| form  | recover | 1.308 | 1.270 | +3.0% |
| form  | unmount | 1.006 | 0.962 | +4.5% |
| composition  | mount | 1.343 | 1.250 | +7.5% |
| composition  | relay | 1.071 | 1.057 | +1.4% |
| composition  | unmount | 0.956 | 1.077 | -11.2% |
| localized  | mount | 2.195 | 2.128 | +3.1% |
| localized  | local-update | 1.160 | 1.179 | -1.6% |
| localized  | unmount | 0.986 | 0.986 | +0.1% |
| keyed 100 | create | 4.598 | 4.794 | -4.1% |
| keyed 100 | update | 1.650 | 1.692 | -2.5% |
| keyed 100 | select | 1.458 | 1.581 | -7.8% |
| keyed 100 | append | 2.199 | 2.288 | -3.9% |
| keyed 100 | swap | 1.874 | 1.921 | -2.4% |
| keyed 100 | remove | 2.254 | 2.200 | +2.5% |
| keyed 100 | clear | 1.698 | 1.710 | -0.7% |
| keyed 1000 | create | 26.666 | 28.582 | -6.7% |
| keyed 1000 | update | 4.396 | 4.331 | +1.5% |
| keyed 1000 | select | 2.407 | 2.655 | -9.4% |
| keyed 1000 | append | 5.995 | 5.555 | +7.9% |
| keyed 1000 | swap | 3.272 | 3.304 | -1.0% |
| keyed 1000 | remove | 3.933 | 3.922 | +0.3% |
| keyed 1000 | clear | 5.335 | 6.220 | -14.2% |

The four non-keyed Elnor/control bundles differ in bound identifier names after minification. Lexical-symbol canonicalization retains the same operations, property keys, exports and literals for those four pairs. This is an alpha-equivalence source check, not universal JavaScript equivalence or a substitute for the workload checks. Keyed gzip-9 size grows from 10,860 to 11,020 bytes (+160).

## One independent confirmation

Original immutable keyed bundles, two sizes and all seven actions, AB/BA and AA. Ten serial Jobs, 784 samples and 28 checks. Results are kept separate from the first cohort.

| Size | Action | Unified record | Previous | Change |
| --- | --- | ---: | ---: | ---: |
| 100 | create | 4.830 | 5.098 | -5.2% |
| 100 | update | 1.742 | 2.055 | -15.3% |
| 100 | select | 1.556 | 1.484 | +4.8% |
| 100 | append | 2.387 | 2.315 | +3.1% |
| 100 | swap | 1.829 | 1.891 | -3.3% |
| 100 | remove | 2.226 | 2.092 | +6.4% |
| 100 | clear | 1.860 | 1.799 | +3.4% |
| 1000 | create | 28.161 | 28.937 | -2.7% |
| 1000 | update | 4.765 | 4.630 | +2.9% |
| 1000 | select | 2.438 | 2.598 | -6.2% |
| 1000 | append | 6.150 | 6.089 | +1.0% |
| 1000 | swap | 3.637 | 3.714 | -2.1% |
| 1000 | remove | 4.780 | 5.335 | -10.4% |
| 1000 | clear | 5.539 | 6.169 | -10.2% |

## Decision and limits

Retain this change in the private backend for the recurring large-list cleanup signal and unified resource lifetime. Clear at 1,000 improves from 6.220 to 5.335 ms (-14.2%) in the primary cohort and 6.169 to 5.539 ms (-10.2%) in confirmation; both orders favor the candidate in both cohorts. AA variation remains appreciable, including +11.6% in one confirmation order. This is descriptive evidence, not a universal speedup.

Creation does not establish a stable gain: -6.7% initially and -2.7% in confirmation, with mixed confirmation orders and changes within AA variation. The initial append1000 penalty of +7.9% narrows to +1.0% in confirmation. Small-list and other action differences remain mixed. Do not claim faster creation, parity with Svelte or a global performance win from this study.

Public compiler/runtime files are unchanged. The candidate is retained only in the private backend pending a contemporary React/Svelte comparison and broader integration readiness. A shared task record does not complete the remaining compiler/runtime architecture work.

All 64 successful Jobs were serial and retain CPU 10%, aggregate commit 768 MiB, 24 process maximum, Node heap 192 MiB, host-free floor 4 GiB and kill-on-owner-close. Cleanup leaves zero owned processes. Browser wall/idle limits remain 45/12 seconds, offline limits at most 60/60 seconds, with CSP and browser sandbox enabled.
