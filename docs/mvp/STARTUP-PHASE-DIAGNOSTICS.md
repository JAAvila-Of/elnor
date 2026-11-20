# Startup phase diagnostics

**Investigated: 2026-11-12.** This instrumented diagnostic decomposes
startup observations across all four expanded workloads. Application,
driver, runtime and compiler bytes are unchanged. It is not a normal
timing cohort, a framework ranking or a new core optimization.

Study `run-a101eec1f79e4183a51a3f58dc5dce5e` under `startup-diagnostics/` in
`elnor/.elnor/mvp/framework-comparison/`. It completes 24 browser
cases and **144 instrumented fresh-context navigations/traces**, with
A/A, React and Svelte, both orders, three starts per label, no dropped
first samples. The separate [normal startup cohort](CONTROLLED-STARTUP.md)
and [expanded matrix](EXPANDED-PERFORMANCE-MATRIX.md) retain their own
timings; none of those values are replaced or pooled with this study.

## Findings from the captured intervals

The delays do not occupy one universal phase. Three independent examples from
the complete cohort locate different waits; these are selected by the largest
observed interval of each kind, not by favorable framework performance:

| Interval | Case / framework / label:repetition | Observed span |
|---|---|---|
| Before sending the HTML request | 14 / React / B:0 | 838.000 ms from fetchStart to requestStart; HTML response ends at 839.800 ms |
| Browser accessibility lifecycle | 6 / Elnor / A:0 | 449.455 ms wall inside RunAccessibilitySteps, with 3.549 ms thread CPU |
| One driver animation-frame wait | 12 / Elnor / A:0 | 428.000 ms request-to-callback; root is already present when requested |

They belong to different startups and can overlap other recorded phases; do
not add them. The pre-request observation precedes that navigation's app HTML
and modules. It is not time spent executing that page's framework code, nor is
it server processing time. Its deeper network/browser/host cause is unproven.

The AX trace is an inclusive browser span, not proof of why the thread made
little CPU progress during its wall interval. A named browser span does not
show which subsystem triggered the wait. The installation marker observes the
driver interface **after the synchronous startup factory call**; before that
marker does not imply that no framework code has executed.

Other examples differ. The largest captured driver waits by family are 17.400
ms (counter), 376.800 ms (form), 428.000 ms (composition) and 380.200 ms
(localized). In the form example the root was absent when the request was made;
in composition/localized it was present. The root-presence distinction prevents
treating all frame waits as the same application phase. These maxima describe
this instrumented sample set, not a latency budget or a framework ranking.

The normal visible A/A outlier is therefore not explained by one confirmed
cause. This diagnostic localizes several kinds of delay and does not prove
that any particular earlier uninstrumented sample had the same cause. No
accessibility feature, readiness wait, network policy or resource cap is removed
to obtain a better number. Core changes should target measured CPU/resource
work across the matrix, while startup wall repeatability remains open.

## What is observed

- Navigation/Resource Timing landmarks for HTML and the module graph.
- An installation accessor observes the shared driver interface; it
  does not timestamp only framework compilation or rendering.
- A MutationObserver records first root observation, an upper-bound
  observation rather than an exact DOM insertion or paint timestamp.
- Wrapped request/cancelAnimationFrame preserve callbacks/receiver/IDs
  while recording request/fire/end times and caller stacks. Driver
  wait intervals are merged as a union, never blindly summed when
  overlapping. Root presence is sampled at request time.
- Separate user-timing marks identify the active renderer and phase
  boundaries in bounded Chrome traces. Readiness, DOM/schema, visible
  states and unmount checks stay in force.

The wrappers, observers, stack capture and tracing perturb execution.
The standard APIs define observations, not a cause for every delay:
[Navigation Timing](https://www.w3.org/TR/navigation-timing-2/),
[animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames).

## Phase landmarks: largest wall observation in each declared case

Selection is explicit: one of six instrumented starts per case, chosen
by maximum host wall. All 144 raw samples and traces remain retained.
These are examples for localization, not performance scores. Page
landmarks are ms on that document clock; they are not disjoint phases
to add together or direct host-wall equivalents.

| Case | Family / group / seed | Label:rep | Host wall | HTML pre-request | HTML end | App module end | Driver request | Installed | Root observed | Ready | Driver frame wait union |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | counter / aa / AB | B:0 | 654.362 | 598.900 | 601.100 | 612.700 | 618.800 | 623.500 | 623.500 | 643.900 | 20.100 |
| 1 | counter / aa / BA | B:1 | 66.744 | 1.100 | 3.000 | 18.900 | 27.900 | 32.500 | 32.500 | 57.000 | 24.000 |
| 2 | counter / react / AB | A:2 | 712.844 | 661.000 | 663.000 | 676.700 | 683.800 | 687.600 | 687.700 | 704.300 | 16.400 |
| 3 | counter / react / BA | B:0 | 124.597 | 1.600 | 8.800 | 27.300 | 41.700 | 70.800 | 76.800 | 111.300 | 39.800 |
| 4 | counter / svelte / AB | B:1 | 67.794 | 1.100 | 3.900 | 19.900 | 28.800 | 36.700 | 37.000 | 57.100 | 19.800 |
| 5 | counter / svelte / BA | B:2 | 198.557 | 1.000 | 3.000 | 18.000 | 164.100 | 169.700 | 169.900 | 190.200 | 20.000 |
| 6 | form / aa / AB | A:0 | 514.356 | 1.400 | 7.700 | 25.600 | 31.700 | 484.800 | 484.900 | 501.900 | 16.800 |
| 7 | form / aa / BA | A:1 | 697.661 | 633.100 | 635.400 | 650.900 | 658.500 | 662.500 | 662.600 | 688.600 | 25.800 |
| 8 | form / react / AB | B:2 | 293.749 | 1.200 | 3.600 | 209.000 | 215.400 | 241.400 | 248.300 | 284.200 | 42.300 |
| 9 | form / react / BA | B:2 | 782.975 | 679.600 | 682.000 | 699.000 | 707.700 | 734.500 | 741.400 | 772.700 | 37.500 |
| 10 | form / svelte / AB | A:0 | 461.115 | 1.100 | 6.900 | 23.900 | 32.500 | 37.300 | 37.400 | 52.400 | 14.700 |
| 11 | form / svelte / BA | B:0 | 536.078 | 1.700 | 9.400 | 475.600 | 485.000 | 497.500 | 497.800 | 519.200 | 21.100 |
| 12 | composition / aa / AB | A:0 | 543.779 | 3.200 | 13.700 | 34.200 | 42.300 | 59.000 | 59.100 | 520.900 | 433.900 |
| 13 | composition / aa / BA | B:0 | 510.741 | 1.300 | 7.000 | 24.500 | 34.000 | 481.000 | 481.100 | 498.100 | 11.000 |
| 14 | composition / react / AB | B:0 | 934.177 | 838.000 | 839.800 | 855.200 | 863.300 | 883.300 | 887.900 | 924.900 | 40.900 |
| 15 | composition / react / BA | B:0 | 487.871 | 1.500 | 6.700 | 23.400 | 35.900 | 58.300 | 455.900 | 477.000 | 418.200 |
| 16 | composition / svelte / AB | B:1 | 883.306 | 832.200 | 834.600 | 848.500 | 856.100 | 862.300 | 862.700 | 873.100 | 10.400 |
| 17 | composition / svelte / BA | A:0 | 256.991 | 1.200 | 3.100 | 19.900 | 24.000 | 32.200 | 32.200 | 245.200 | 211.800 |
| 18 | localized / aa / AB | A:2 | 884.194 | 823.600 | 825.500 | 839.700 | 848.300 | 853.100 | 853.200 | 874.300 | 20.700 |
| 19 | localized / aa / BA | B:0 | 66.146 | 1.400 | 7.600 | 19.100 | 27.600 | 31.800 | 31.900 | 56.300 | 24.200 |
| 20 | localized / react / AB | A:0 | 449.911 | 2.000 | 9.400 | 29.700 | 37.200 | 44.300 | 44.400 | 434.600 | 390.000 |
| 21 | localized / react / BA | B:1 | 309.832 | 1.000 | 3.100 | 229.100 | 239.800 | 262.400 | 269.700 | 301.200 | 38.100 |
| 22 | localized / svelte / AB | A:0 | 448.303 | 2.300 | 9.400 | 34.300 | 39.700 | 48.400 | 48.500 | 433.200 | 376.700 |
| 23 | localized / svelte / BA | A:0 | 638.744 | 588.000 | 589.800 | 605.000 | 610.300 | 614.800 | 614.900 | 629.300 | 14.300 |

HTML pre-request is requestStart − fetchStart, not server execution
time. Driver request is the Resource Timing startTime of the shared
module fetch; its gap after the app response can be signed if fetches
overlap. Installation includes the sync startup path; it is not a pure
module compile metric. Frame wait is wall wait, not callback CPU.

## Trace witnesses for the same selected starts

AX is LocalFrameView::RunAccessibilitySteps; Serialize is
SerializeLifecycleStageLoading. Each cell describes its longest single
complete enclosed span, wall / thread CPU ms. Missing thread duration
is not treated as zero. Nested inclusive durations must not be added.
Before-installed is determined using trace marks on the same clock.

| Case | AX wall / CPU | AX before installed | Serialize wall / CPU | Longest complete main-thread span |
|---:|---|---|---|---|
| 0 | 1.984 / 1.787 | True | 1.933 / 1.740 | ThreadControllerImpl::RunTask: 6.637 / 7.028 |
| 1 | 2.778 / 2.226 | True | 2.720 / 2.173 | ThreadControllerImpl::RunTask: 6.695 / 6.212 |
| 2 | 3.039 / 2.264 | True | 3.014 / 2.242 | ThreadControllerImpl::RunTask: 5.590 / 5.266 |
| 3 | 3.226 / 2.532 | True | 3.124 / 2.462 | ThreadControllerImpl::RunTask: 23.671 / 22.116 |
| 4 | 2.802 / 2.356 | True | 2.698 / 2.276 | ThreadControllerImpl::RunTask: 9.580 / 9.209 |
| 5 | 2.812 / 2.201 | True | 2.783 / 2.177 | ThreadControllerImpl::RunTask: 8.269 / 7.860 |
| 6 | 449.455 / 3.549 | True | 13.236 / 3.462 | ThreadControllerImpl::RunTask: 450.133 / 4.143 |
| 7 | 3.698 / 2.867 | True | 3.656 / 2.829 | ThreadControllerImpl::RunTask: 9.076 / 8.496 |
| 8 | 3.400 / 2.749 | True | 3.369 / 2.721 | ThreadControllerImpl::RunTask: 24.339 / 23.687 |
| 9 | 3.476 / 2.566 | True | 3.441 / 2.536 | ThreadControllerImpl::RunTask: 23.365 / 22.646 |
| 10 | 2.511 / 2.255 | True | 2.467 / 2.215 | ThreadControllerImpl::RunTask: 9.258 / 9.392 |
| 11 | 1.992 / 1.750 | True | 1.942 / 1.704 | ThreadControllerImpl::RunTask: 457.380 / 5.569 |
| 12 | 3.824 / 2.478 | True | 3.759 / 2.416 | ThreadControllerImpl::RunTask: 429.866 / 10.766 |
| 13 | 2.753 / 2.390 | True | 2.685 / 2.326 | ThreadControllerImpl::RunTask: 9.947 / 9.388 |
| 14 | 2.710 / 2.141 | True | 2.681 / 2.116 | ThreadControllerImpl::RunTask: 18.286 / 18.047 |
| 15 | 2.091 / 1.791 | True | 2.024 / 1.729 | ThreadControllerImpl::RunTask: 394.959 / 4.733 |
| 16 | 2.612 / 2.163 | True | 2.587 / 2.141 | ThreadControllerImpl::RunTask: 9.851 / 9.304 |
| 17 | 3.955 / 3.192 | True | 3.920 / 3.161 | ThreadControllerImpl::RunTask: 210.784 / 7.784 |
| 18 | 2.775 / 2.225 | True | 2.747 / 2.202 | ThreadControllerImpl::RunTask: 7.948 / 7.370 |
| 19 | 2.458 / 2.347 | False | 2.006 / 1.910 | ThreadControllerImpl::RunTask: 9.417 / 8.683 |
| 20 | 2.821 / 2.445 | True | 2.748 / 2.377 | ThreadControllerImpl::RunTask: 363.571 / 0.353 |
| 21 | 208.511 / 2.179 | True | 208.484 / 2.157 | ThreadControllerImpl::RunTask: 208.884 / 2.478 |
| 22 | 3.056 / 2.663 | True | 2.974 / 2.586 | ThreadControllerImpl::RunTask: 355.214 / 3.428 |
| 23 | 2.723 / 2.172 | True | 2.695 / 2.148 | ThreadControllerImpl::RunTask: 8.754 / 8.332 |

Trace scope uses the matching navigationStart when available, otherwise
the document-init mark; that choice is recorded per sample. Only fully
enclosed complete spans are summarized. Events before document init
cannot be assigned to application JS merely from their wall duration.
Long wall with short thread CPU does not identify whether a thread
waited, was descheduled or was blocked by another component.

## Verification and limits

The reader reopens every raw trace, verifies its checksum/8 MiB bound,
renderer and marks, and validates all sources/assets/versions, schemas,
sample order, page timelines, frame histories and cleanup. No cause is
inferred solely from a named span. These traces cannot retroactively
explain every delay in an earlier uninstrumented navigation.

Every heavy case remains serial, CPU 10%, 768 MiB job commit, at most
24 processes, 45-second wall/12-second progress deadlines, 4 GiB minimum
host free memory, sandboxed headless Edge, GPU disabled and owned-tree
cleanup. All cases report zero remaining owned processes. No accessibility
feature, network policy or resource limit is disabled to improve numbers.

Reproduce from the workspace root with the existing Python environment:

```powershell
python elnor/benchmarks/matrix/startup-diagnostic-windows.py elnor/.elnor/mvp/framework-comparison/matrix-vWhA85
python elnor/benchmarks/matrix/startup-diagnostic-summarize.py elnor/.elnor/mvp/framework-comparison/startup-diagnostics/run-a101eec1f79e4183a51a3f58dc5dce5e --matrix-study elnor/.elnor/mvp/framework-comparison/matrix-studies/run-72d12d53290b404a846f0827492f29ac --report elnor/docs/mvp/STARTUP-PHASE-DIAGNOSTICS.md
```

Fresh runs receive new IDs. Summary creation refuses overwrite;
`--stdout-only` revalidates without replacing retained evidence.

The initial smoke case is retained separately at
`startup-diagnostics/run-955fd3a0e4424e949df2551ff79d7832` (six instrumented starts),
not pooled with the complete 144. Strict summary analysis ran inside
`test-runs/startup-phase-analysis-80ec1e36a5ce4befbcdcdad3678c29c6` under the
60-second analysis bounds.

`startup-diagnostic-validation/run-cfd6d3fe85cd470680d0fec1927f1ed1` validates nine
expected refusals: hidden state, impossible root/frame order, missing navigation,
duplicate driver resource, excessive frame-stack data, corrupt trace checksum,
trace over budget and rejection of instrumented diagnostics by the normal
startup reader. Unmodified real records are accepted first. Two additional
workers reject corrupt assets and an unknown workload before browser launch;
their expected exit 1 is not a successful benchmark sample. Command:

```powershell
python elnor/benchmarks/matrix/startup-diagnostic-validate.py elnor/.elnor/mvp/framework-comparison/startup-diagnostics/run-a101eec1f79e4183a51a3f58dc5dce5e --normal-study elnor/.elnor/mvp/framework-comparison/startup-studies/run-1769a8d8dd2f42408937fc296bb668bc --matrix-study elnor/.elnor/mvp/framework-comparison/matrix-studies/run-72d12d53290b404a846f0827492f29ac
```
