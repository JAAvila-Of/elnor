# Source-mapped update and teardown profiles

These diagnostics move the investigation beyond creation. They profile the retained
minified Elnor runtime and the installed Svelte comparison across a counter, form,
composition, localized updates and 100/1,000-row lists. They do not establish a new
framework ranking, a production speedup or exact function CPU costs.

## Method and source identity

Both fixtures are built from the existing benchmark sources with the retained
compiler/runtime. The only builder change is external esbuild source maps. Maps
are hashed and retained offline, excluded from served assets and compression;
application execution remains minified. There is no runtime rewrite or allocation
instrumentation. Matrix fixture: `matrix-sD0E7F`. List fixture:
`run-sjPuic`. Each source map binds its exact bundle bytes.

Two passes reverse workload and framework order. Each case uses one sandboxed
headless Edge 157.0.4341.42, two warmups/action and the normal driver preparation,
scheduling and verification. Application identity and final schemas pass; output
schemas also match across frameworks for every corresponding action. Preparation
and oracle checks are outside each diagnostic window.

CPU profiles request a100-microsecond sampling interval: eight independent windows
per matrix action and four per list action. The request does not prove achieved
resolution. Samples and caller trees are mapped through bundler input source maps;
wall-clock timeDeltas are not converted into CPU durations. Generated component
positions refer to generated JS (including JS emitted by the Svelte plugin), not
author-facing Surface/Svelte source positions. Actual runtime source content is
embedded and hashed by the maps.

One separate trace/action records complete renderer events with tts/tdur clocks.
A unique user-timing marker selects the page renderer. Interval unions assign
each covered CPU interval once, with priority GC -> accessibility -> rendering ->
script-associated -> other. Nested inclusive durations are not summed. Four
retained interval controls plus source-map/VLQ and renderer-selection controls pass.
Unclocked events cannot independently supply CPU time. Trace totals include driver,
engine and diagnostic work inside capture boundaries.

## Findings and limits

Small actions are too short for useful function ranking here. For example, the
first Elnor form edit-one profiles contain412 samples across eight windows,387
idle, with no mapped application self sample. Several other small actions similarly
produce zero or one mapped sample. This is a resolution limit, not evidence that
their application code costs nothing. Fine optimization is not selected from such
counts, and nearest mapped callers are kept separate from self samples in JSON.

At1,000 rows, Elnor update traces place approximately64% of the captured CPU union
in rendering in both passes; Svelte's corresponding observations are approximately
68–69%. These are within-window distributions, not a performance ranking. Clear
is different: script-associated coverage is about69–72% for Elnor and68–70% for
Svelte. That category includes native DOM calls and does not mean pure JavaScript
or savings available from a language rewrite.

Direct unmount via DevTools exposes another coverage limit: substantial work is
inside DevTools-session task events rather than FunctionCall/RunMicrotasks. It is
retained as other, not relabeled as JavaScript. In Elnor's1,000-row captures,
script-associated is0.163/0.173ms while other is3.587/3.495ms. These numbers cannot
be read as the full script cost or used to infer that teardown is mostly unrelated
engine work. Normal unmount timings require a separate uninstrumented comparison.

Larger list profiles map some samples to Elnor clearRegion, effect disposal and
clearPart, and to Svelte clear_text_content/effect destruction. Counts are still
small and do not isolate a single hot function. Source inspection is more concrete:
Elnor's existing clearRegion performs a guarded collective removal for an empty
exclusive list, while repeat's disposal reset removes its rows individually.
Svelte's destroy_effect/remove_dom ownership logic avoids repeated descendant DOM
removal after an ancestor removal, but has different error-boundary contracts.
The follow-up experiment in region-disposal-study reuses Elnor's own established
eligibility checks rather than transplanting those contracts.

## Elnor captured budgets

| Workload/action | Captured CPU ms 0 / 1 | Rendering ms 0 / 1 | Script-associated ms 0 / 1 | Other ms 0 / 1 | Mapped self samples 0 / 1 |
|---|---:|---:|---:|---:|---:|
| counter/increment | 1.404 / 0.873 | 0.251 / 0.216 | 0.255 / 0.142 | 0.895 / 0.513 | 0 / 1 |
| counter/unmount | 0.806 / 0.775 | 0.190 / 0.187 | 0.142 / 0.142 | 0.472 / 0.443 | 0 / 0 |
| form/edit-one | 1.193 / 1.495 | 0.372 / 0.461 | 0.159 / 0.214 | 0.659 / 0.816 | 0 / 0 |
| form/edit-all | 1.441 / 1.366 | 0.644 / 0.490 | 0.225 / 0.229 | 0.567 / 0.643 | 2 / 1 |
| form/invalid | 1.322 / 1.340 | 0.396 / 0.430 | 0.304 / 0.286 | 0.618 / 0.618 | 0 / 0 |
| form/recover | 1.489 / 1.225 | 0.462 / 0.395 | 0.235 / 0.248 | 0.790 / 0.578 | 0 / 1 |
| form/unmount | 0.985 / 1.125 | 0.259 / 0.260 | 0.157 / 0.176 | 0.565 / 0.684 | 0 / 1 |
| composition/relay | 1.101 / 1.003 | 0.285 / 0.274 | 0.184 / 0.166 | 0.630 / 0.561 | 0 / 0 |
| composition/unmount | 0.894 / 0.999 | 0.206 / 0.272 | 0.157 / 0.166 | 0.527 / 0.559 | 0 / 0 |
| localized/local-update | 1.411 / 1.325 | 0.391 / 0.571 | 0.241 / 0.164 | 0.778 / 0.585 | 0 / 0 |
| localized/unmount | 1.029 / 0.929 | 0.202 / 0.183 | 0.155 / 0.140 | 0.670 / 0.604 | 1 / 2 |
| 100/update | 1.431 / 2.151 | 0.651 / 1.096 | 0.229 / 0.282 | 0.547 / 0.770 | 2 / 1 |
| 100/select | 1.147 / 1.438 | 0.533 / 0.673 | 0.215 / 0.274 | 0.397 / 0.487 | 0 / 2 |
| 100/append | 1.877 / 1.567 | 1.015 / 0.824 | 0.373 / 0.296 | 0.487 / 0.445 | 0 / 0 |
| 100/swap | 1.638 / 2.218 | 0.810 / 1.318 | 0.316 / 0.337 | 0.508 / 0.558 | 0 / 1 |
| 100/remove | 1.593 / 2.135 | 0.778 / 1.253 | 0.316 / 0.323 | 0.495 / 0.554 | 1 / 0 |
| 100/clear | 1.331 / 1.455 | 0.313 / 0.277 | 0.504 / 0.600 | 0.509 / 0.576 | 0 / 2 |
| 100/unmount | 1.773 / 1.338 | 0.336 / 0.225 | 0.174 / 0.138 | 1.258 / 0.970 | 2 / 1 |
| 1000/update | 4.234 / 4.782 | 2.689 / 3.055 | 0.843 / 0.905 | 0.698 / 0.818 | 5 / 8 |
| 1000/select | 2.051 / 2.885 | 1.177 / 1.690 | 0.414 / 0.614 | 0.457 / 0.577 | 2 / 3 |
| 1000/append | 4.513 / 6.267 | 2.857 / 3.872 | 1.041 / 1.730 | 0.611 / 0.662 | 3 / 9 |
| 1000/swap | 2.864 / 2.767 | 1.845 / 1.785 | 0.574 / 0.503 | 0.442 / 0.473 | 1 / 2 |
| 1000/remove | 3.698 / 4.309 | 2.656 / 3.071 | 0.495 / 0.604 | 0.544 / 0.630 | 2 / 3 |
| 1000/clear | 3.285 / 3.166 | 0.445 / 0.311 | 2.268 / 2.271 | 0.568 / 0.581 | 6 / 3 |
| 1000/unmount | 4.019 / 3.907 | 0.265 / 0.235 | 0.163 / 0.173 | 3.587 / 3.495 | 6 / 1 |

## Svelte captured budgets

| Workload/action | Captured CPU ms 0 / 1 | Rendering ms 0 / 1 | Script-associated ms 0 / 1 | Other ms 0 / 1 | Mapped self samples 0 / 1 |
|---|---:|---:|---:|---:|---:|
| counter/increment | 0.946 / 1.026 | 0.198 / 0.203 | 0.203 / 0.241 | 0.542 / 0.579 | 1 / 3 |
| counter/unmount | 0.780 / 0.862 | 0.221 / 0.217 | 0.130 / 0.128 | 0.427 / 0.514 | 1 / 0 |
| form/edit-one | 1.407 / 1.033 | 0.415 / 0.325 | 0.256 / 0.162 | 0.732 / 0.543 | 0 / 1 |
| form/edit-all | 1.509 / 1.715 | 0.404 / 0.627 | 0.288 / 0.350 | 0.543 / 0.735 | 3 / 1 |
| form/invalid | 1.345 / 1.234 | 0.500 / 0.431 | 0.264 / 0.254 | 0.577 / 0.544 | 1 / 1 |
| form/recover | 1.842 / 1.413 | 0.643 / 0.354 | 0.384 / 0.305 | 0.809 / 0.752 | 1 / 1 |
| form/unmount | 1.059 / 1.072 | 0.262 / 0.239 | 0.200 / 0.184 | 0.594 / 0.647 | 0 / 0 |
| composition/relay | 1.510 / 1.076 | 0.494 / 0.245 | 0.274 / 0.221 | 0.736 / 0.605 | 0 / 2 |
| composition/unmount | 0.857 / 1.011 | 0.203 / 0.305 | 0.134 / 0.148 | 0.516 / 0.554 | 0 / 0 |
| localized/local-update | 1.184 / 1.267 | 0.379 / 0.378 | 0.246 / 0.274 | 0.557 / 0.614 | 1 / 3 |
| localized/unmount | 1.057 / 0.914 | 0.297 / 0.217 | 0.155 / 0.137 | 0.601 / 0.557 | 0 / 0 |
| 100/update | 1.703 / 1.597 | 0.681 / 0.650 | 0.330 / 0.316 | 0.689 / 0.627 | 2 / 2 |
| 100/select | 1.226 / 1.291 | 0.519 / 0.610 | 0.269 / 0.253 | 0.434 / 0.425 | 1 / 1 |
| 100/append | 1.707 / 2.621 | 0.945 / 1.521 | 0.316 / 0.447 | 0.444 / 0.648 | 1 / 1 |
| 100/swap | 1.859 / 2.084 | 0.845 / 1.089 | 0.390 / 0.367 | 0.621 / 0.623 | 0 / 2 |
| 100/remove | 1.772 / 1.711 | 0.888 / 0.835 | 0.337 / 0.331 | 0.543 / 0.541 | 0 / 0 |
| 100/clear | 1.669 / 1.597 | 0.459 / 0.405 | 0.592 / 0.613 | 0.614 / 0.574 | 3 / 3 |
| 100/unmount | 1.102 / 1.072 | 0.234 / 0.259 | 0.138 / 0.149 | 0.724 / 0.660 | 0 / 1 |
| 1000/update | 3.585 / 3.840 | 2.465 / 2.611 | 0.496 / 0.606 | 0.622 / 0.619 | 3 / 4 |
| 1000/select | 2.422 / 3.907 | 1.357 / 2.823 | 0.474 / 0.486 | 0.588 / 0.595 | 2 / 1 |
| 1000/append | 4.601 / 7.133 | 3.475 / 5.490 | 0.680 / 0.983 | 0.443 / 0.657 | 6 / 4 |
| 1000/swap | 2.721 / 2.571 | 1.779 / 1.630 | 0.449 / 0.463 | 0.488 / 0.475 | 2 / 2 |
| 1000/remove | 3.452 / 3.588 | 2.267 / 2.341 | 0.608 / 0.614 | 0.573 / 0.629 | 2 / 2 |
| 1000/clear | 2.645 / 2.604 | 0.312 / 0.351 | 1.855 / 1.771 | 0.476 / 0.480 | 10 / 16 |
| 1000/unmount | 2.494 / 2.225 | 0.312 / 0.261 | 0.185 / 0.150 | 1.993 / 1.812 | 2 / 1 |

GC and accessibility categories remain separate in analysis.json even when small
or zero; the displayed columns are not an exhaustive sum. Other is deliberately
unattributed. All trace/sample observations are preserved without pooling the
different actions, sizes or diagnostic protocols.

## Evidence and retained state

The study retains **26 successful serial phases**: two builds and24 browser cases,
with576 CPU profile files and100 separate action traces. Each profile case is
limited to8MiB of profile JSON and each action trace to8MiB. CPU10%, commit768MiB,
maximum24 processes, host-free minimum4GiB, owner-close cleanup and browser45s/12s
wall/idle limits remain enforced. Builds use60s/60s. GPU stays disabled and
accessibility enabled. No source was installed or Svelte checkout changed.

Internal root: `elnor/.elnor/mvp/framework-comparison/update-teardown-profile-study`.
Run: `run-28dbf71926a84eeba80a75eb100f82fd`. The first form pilot was inspected before continuing the other
23 cases; both pilot-analysis.json and the complete analysis.json are retained.
Raw bundles, maps, profile stacks, traces, source hashes and supervisors remain
available. verification.json binds the report and exact evidence.

Profiled runtime: `fef7558b628ac2c20be2b3e53e579fb1d7dccfef96cb828f27b67912f54fd1ef`

Profiled compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

This diagnostic did not modify production sources. The prior595-test check/build
gate applies to those profiled sources. Any later runtime change must use its own
validation and timing evidence; these profiles must not be relabeled as that new
revision's measurements. Global React/Svelte parity and production readiness are
not established here.
