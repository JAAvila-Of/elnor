# Native templates segmented at observation barriers

A private architectural experiment moved static native construction from individual DOM operations to cached HTML templates. The compiler partitioned validated native IR at every reader, literal coercion and event-registration barrier, generated node paths, and retained the imperative constructor for hosts without an HTML parser. A conservative shape check kept nested list-item trees out of a combined HTML parse. Surface and TypeScript interfaces were unchanged. This experiment did not combine reactive tasks or change event delivery.

The local Svelte 5.57.3 checkout and the pinned benchmark compiler agree on the contrasting RowView output: one `from_html` template, one `template_effect` with two text writes, and a delegated click handler. Elnor retained two independent text tickets and a direct listener; its two construction segments preserve the existing reader boundaries. This is an architectural hypothesis, not a claim that DOM cloning dominates all CPU.

## Diagnostic evidence

Seven serial Jobs captured 48 CPU profiles across Elnor, its previous private control and Svelte at 100/1,000 rows. Three further Jobs captured 12 timeline traces for create/clear at 1,000. Sampling did not isolate one dominant helper; timeline intervals showed script, rendering and GC all contribute. These used nonminified instrumented bundles and are not normal benchmark CPU scores or a new framework ranking. The profiles describe the pre-template backend, which is also the restored active backend.

## Validation

The candidate passes 466 complete backend tests and two additional nested-list-item controls in a 28-test focused run: 468 unique controls. Compatibility passes 71 tests. Seven fixtures pass 112 browser cycles. Two further 16-cycle probes confirm exactly two native template clones per mount and preserve the DOM visible at each opaque reader. A real browser GC control collects three cloned nodes with a callback and disposer retained; existing fake-DOM controls collect another ten nodes.

## Full candidate/control matrix

Original six workloads, balanced AB/BA medians, renderer main-thread CPU milliseconds. Lower is less CPU. Thirty-five contained Jobs, 1,624 samples and 58 cross-backend checks. AA and per-order data are retained in JSON; no significance test is claimed.

| Workload | Action | Segmented | Previous native | Change |
| --- | --- | ---: | ---: | ---: |
| counter  | mount | 1.195 | 1.070 | +11.7% |
| counter  | increment | 0.961 | 0.976 | -1.5% |
| counter  | unmount | 0.931 | 0.909 | +2.5% |
| form  | mount | 1.247 | 1.325 | -5.9% |
| form  | edit-one | 1.116 | 1.172 | -4.7% |
| form  | edit-all | 1.173 | 1.253 | -6.3% |
| form  | invalid | 1.128 | 1.194 | -5.6% |
| form  | recover | 1.180 | 1.107 | +6.5% |
| form  | unmount | 0.916 | 0.882 | +3.9% |
| composition  | mount | 1.284 | 1.442 | -10.9% |
| composition  | relay | 1.077 | 1.094 | -1.6% |
| composition  | unmount | 0.912 | 0.998 | -8.6% |
| localized  | mount | 2.225 | 1.967 | +13.1% |
| localized  | local-update | 1.199 | 1.136 | +5.5% |
| localized  | unmount | 0.966 | 1.016 | -5.0% |
| keyed 100 | create | 3.902 | 4.231 | -7.8% |
| keyed 100 | update | 1.523 | 1.432 | +6.4% |
| keyed 100 | select | 1.289 | 1.370 | -5.9% |
| keyed 100 | append | 1.877 | 1.729 | +8.5% |
| keyed 100 | swap | 1.710 | 1.533 | +11.6% |
| keyed 100 | remove | 1.786 | 1.833 | -2.6% |
| keyed 100 | clear | 1.559 | 1.541 | +1.2% |
| keyed 1000 | create | 21.669 | 26.159 | -17.2% |
| keyed 1000 | update | 4.498 | 4.216 | +6.7% |
| keyed 1000 | select | 2.333 | 2.413 | -3.3% |
| keyed 1000 | append | 5.010 | 5.172 | -3.1% |
| keyed 1000 | swap | 3.127 | 3.267 | -4.3% |
| keyed 1000 | remove | 3.828 | 3.936 | -2.8% |
| keyed 1000 | clear | 4.832 | 4.867 | -0.7% |

Counter, form, composition and localized bundles are byte-identical within this cohort. Keyed delivery grows from 10,861 to 11,072 gzip-9 bytes (+211). Composition retains the general renderer because of slots.

## One bounded confirmation

Same immutable bundles, original seven actions, both list sizes, AB/BA and AA. Ten serial Jobs, 784 samples and 28 correctness checks; results are kept separate from the primary cohort.

| Size | Action | Segmented | Previous native | Change |
| --- | --- | ---: | ---: | ---: |
| 100 | create | 4.498 | 4.924 | -8.7% |
| 100 | update | 1.767 | 1.727 | +2.3% |
| 100 | select | 1.615 | 1.484 | +8.8% |
| 100 | append | 2.133 | 2.022 | +5.5% |
| 100 | swap | 1.916 | 1.704 | +12.4% |
| 100 | remove | 2.046 | 1.970 | +3.9% |
| 100 | clear | 1.770 | 1.793 | -1.3% |
| 1000 | create | 29.087 | 30.094 | -3.3% |
| 1000 | update | 5.026 | 5.031 | -0.1% |
| 1000 | select | 2.355 | 2.345 | +0.4% |
| 1000 | append | 6.012 | 6.605 | -9.0% |
| 1000 | swap | 3.360 | 3.715 | -9.5% |
| 1000 | remove | 4.658 | 4.218 | +10.4% |
| 1000 | clear | 5.702 | 5.968 | -4.5% |

## Verdict: do not adopt this variant

Create at 1,000 initially improves from 26.159 to 21.669 ms (-17.2%), with both orders favorable. Confirmation shows 30.094 to 29.087 ms (-3.3%), inside AA variation of -9.0%/+12.6%; the initial magnitude is not reproduced. Swap at 100 regresses in both cohorts: 1.533 to 1.710 ms (+11.6%) and 1.704 to 1.916 ms (+12.4%), with both orders unfavorable. These descriptive results do not establish a robust global gain. Do not select only the favorable creation result.

The exact preceding private compiler/runtime hashes are restored, including the capability assertion. The rejected constructor and all evidence are archived. Restoration passes 28 event controls and 12 native/capability controls. An initial restored capability run lacked a copied fixture dependency; its failed output is retained, and the snapshot producer was corrected without weakening assertions. Public compiler/runtime files are unchanged.

This completes the bounded cloning experiment. The next architectural hypothesis should address reactive ownership/scheduling together, rather than further tuning cloning or individual helpers. No new React/Svelte benchmark ranking was run and no parity is claimed.

All successful Jobs retain CPU 10%, aggregate commit 768 MiB, 24 processes, host-free floor 4 GiB, Node heap 192 MiB, kill-on-owner-close and zero remaining owned processes. Browser wall/idle limits remain 45/12 seconds, offline limits 60/60 seconds; CSP and browser sandbox remain enabled.
