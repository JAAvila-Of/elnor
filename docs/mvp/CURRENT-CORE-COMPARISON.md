# Current core comparative measurements

**Measured: 2026-11-13.** This refresh uses the retained
current compiler and exclusive-region disposal runtime. It makes no core source
change. The complete previous report revision is retained with this study.
The competitive performance requirement remains open: these synthetic workloads
and paired medians do not establish universal parity or production readiness.

## Current evidence

- Expanded fixture: `matrix-unoxP0`; list fixture: `run-hfalM3`.
- Compiler SHA-256: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`.
- Runtime SHA-256: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`.
- React 19.3.1, Svelte 5.57.3, esbuild 0.28.2.
- Sandboxed headless Edge 157.0.4341.42, GPU disabled.
- Last complete core gate: **610 tests, check and build**, `run-64ebe490e7da47bf8240e87669db3d16`.
  That existing gate was verified against unchanged source; it was not rerun here.
- Current refresh: **62 serial contained phases**, 45 expanded + 42 list preflight
  checks, **1,260 expanded + 1,568 list timed action samples**, 36 startup samples,
  96 memory cycles and 98 separate sampled CPU profiles.

The [exclusive-region disposal update](EXCLUSIVE-REGION-DISPOSAL-STUDY.md) has
separate Elnor-versus-Elnor evidence for full unmount. The normal list comparison
here retains its original seven actions, which do not include full unmount.
Expanded applications include unmount; their source scope differs from lists.
This is a new browser cohort. Historical cross-cohort deltas are not calculated.

## Expanded applications: renderer thread CPU

Cells are **Elnor → framework milliseconds**, medians of seven action windows.
AB and BA identify the two initial ordering seeds; active pages alternate per
action and round after two warmups. Each control pair has its own Elnor samples.
Lower CPU is better, but these are CPU windows, not click-to-paint latency.
Different control groups are separate owned browsers and must not be pooled.

| Workload | Action | Elnor → React AB | Elnor → React BA | Elnor → Svelte AB | Elnor → Svelte BA |
|---|---|---:|---:|---:|---:|
| counter | mount | 0.932 → 1.212 | 1.006 → 1.335 | 0.951 → 1.034 | 1.041 → 1.204 |
| counter | increment | 0.851 → 1.094 | 0.817 → 1.009 | 0.835 → 0.873 | 0.890 → 1.082 |
| counter | unmount | 0.808 → 0.911 | 0.776 → 0.867 | 0.788 → 0.808 | 0.886 → 0.894 |
| form | mount | 1.692 → 2.049 | 1.271 → 1.623 | 1.295 → 1.499 | 1.390 → 1.244 |
| form | edit-one | 1.372 → 1.403 | 1.327 → 1.274 | 1.136 → 1.151 | 1.093 → 1.236 |
| form | edit-all | 1.480 → 1.681 | 1.171 → 1.351 | 1.174 → 1.167 | 1.370 → 1.325 |
| form | invalid | 1.351 → 1.392 | 1.093 → 1.180 | 1.058 → 1.133 | 1.141 → 1.210 |
| form | recover | 1.426 → 1.777 | 1.162 → 1.403 | 1.184 → 1.206 | 1.173 → 1.160 |
| form | unmount | 1.024 → 1.155 | 0.934 → 0.996 | 0.931 → 0.866 | 0.910 → 0.895 |
| composition | mount | 1.200 → 1.657 | 1.163 → 1.427 | 1.158 → 1.254 | 1.215 → 1.351 |
| composition | relay | 1.052 → 1.227 | 1.002 → 1.117 | 0.906 → 0.942 | 1.069 → 1.160 |
| composition | unmount | 0.982 → 1.200 | 0.836 → 1.062 | 0.819 → 0.831 | 0.942 → 0.982 |
| localized | mount | 2.051 → 2.102 | 1.988 → 2.116 | 1.971 → 1.852 | 2.753 → 2.790 |
| localized | local-update | 1.080 → 1.225 | 1.072 → 1.185 | 1.097 → 1.184 | 1.211 → 2.054 |
| localized | unmount | 0.975 → 1.014 | 0.959 → 0.985 | 0.917 → 0.931 | 1.196 → 1.297 |

## Shared lists: renderer TaskDuration with threadTicks

These action windows use the list harness's TaskDuration metric; they are not
interchangeable with the expanded table's ThreadTime metric. Cells again show
Elnor → framework CPU milliseconds. Creation and appending include constructing
rows; clearing includes lifetime cleanup and removal. Every operation is checked.

| Rows | Action | Elnor → React AB | Elnor → React BA | Elnor → Svelte AB | Elnor → Svelte BA |
|---:|---|---:|---:|---:|---:|
| 100 | create | 8.827 → 8.638 | 9.446 → 9.729 | 8.470 → 8.365 | 9.466 → 8.992 |
| 100 | update | 1.955 → 2.076 | 1.958 → 2.259 | 1.830 → 1.939 | 1.884 → 1.965 |
| 100 | select | 1.298 → 1.625 | 1.515 → 1.659 | 1.302 → 1.320 | 1.359 → 1.388 |
| 100 | append | 2.418 → 2.698 | 2.415 → 2.756 | 2.679 → 2.374 | 2.676 → 2.627 |
| 100 | swap | 1.824 → 8.885 | 1.836 → 9.535 | 1.760 → 1.873 | 1.967 → 1.798 |
| 100 | remove | 2.213 → 2.317 | 2.335 → 2.366 | 2.281 → 2.215 | 2.324 → 2.188 |
| 100 | clear | 2.086 → 2.418 | 2.488 → 2.388 | 2.177 → 2.090 | 2.478 → 2.133 |
| 1000 | create | 103.448 → 96.705 | 105.165 → 97.315 | 104.166 → 96.888 | 101.712 → 93.464 |
| 1000 | update | 8.356 → 9.763 | 8.701 → 9.782 | 8.649 → 8.425 | 8.854 → 8.603 |
| 1000 | select | 2.887 → 3.977 | 2.917 → 3.771 | 2.982 → 2.790 | 2.885 → 2.851 |
| 1000 | append | 11.991 → 13.007 | 11.938 → 12.381 | 11.030 → 12.460 | 15.103 → 13.583 |
| 1000 | swap | 3.737 → 89.496 | 4.191 → 89.294 | 4.376 → 4.396 | 4.515 → 4.721 |
| 1000 | remove | 7.810 → 9.415 | 7.861 → 10.341 | 8.436 → 7.906 | 7.905 → 9.408 |
| 1000 | clear | 12.792 → 12.482 | 13.304 → 11.519 | 12.472 → 10.863 | 13.591 → 10.418 |

## Contemporaneous A/A controls

Changes below are B relative to A with the same current Elnor fixture. They expose
variation; no acceptance margin is invented or subtracted from framework results.
The list harness's legacy `change` group is deliberately **a second A/A group**
in this refresh: both sides are the same current fixture, not an older compiler.

| Family | Workload/rows | Action | A/A AB | A/A BA | Second A/A AB | Second A/A BA |
|---|---|---|---:|---:|---:|---:|
| expanded | counter | mount | +1.1% | +8.9% | — | — |
| expanded | counter | increment | -2.2% | +7.7% | — | — |
| expanded | counter | unmount | +2.2% | -2.3% | — | — |
| expanded | form | mount | +8.3% | +8.5% | — | — |
| expanded | form | edit-one | -3.7% | -13.7% | — | — |
| expanded | form | edit-all | +9.1% | -2.0% | — | — |
| expanded | form | invalid | +4.9% | -6.8% | — | — |
| expanded | form | recover | -1.0% | +5.1% | — | — |
| expanded | form | unmount | +13.2% | -1.1% | — | — |
| expanded | composition | mount | -6.5% | -2.8% | — | — |
| expanded | composition | relay | +4.8% | +4.2% | — | — |
| expanded | composition | unmount | -6.0% | +0.9% | — | — |
| expanded | localized | mount | -5.6% | +8.2% | — | — |
| expanded | localized | local-update | -5.6% | +4.2% | — | — |
| expanded | localized | unmount | -0.2% | +2.8% | — | — |
| list | 100 | create | -6.5% | +14.0% | +0.2% | -3.7% |
| list | 100 | update | +7.0% | +8.8% | +1.9% | -0.4% |
| list | 100 | select | +13.2% | +3.5% | +15.9% | -14.6% |
| list | 100 | append | +3.4% | +3.2% | +0.4% | +8.5% |
| list | 100 | swap | +5.9% | -2.3% | +0.4% | +4.0% |
| list | 100 | remove | -3.5% | +11.9% | +16.0% | +11.5% |
| list | 100 | clear | +0.4% | -5.7% | +2.3% | +0.4% |
| list | 1000 | create | +3.3% | -0.9% | +3.5% | -0.2% |
| list | 1000 | update | +7.7% | -10.9% | -7.0% | -3.9% |
| list | 1000 | select | -2.5% | -0.3% | +4.4% | +4.4% |
| list | 1000 | append | -7.1% | -4.0% | +5.1% | +10.9% |
| list | 1000 | swap | +6.1% | -14.2% | +8.5% | -11.4% |
| list | 1000 | remove | +4.9% | -8.7% | -4.8% | -7.0% |
| list | 1000 | clear | +4.6% | -2.6% | +9.6% | -9.7% |

## Delivery and mounted heap

Gzip bytes below refer to the minified JS entry, not a complete network transfer.
Post-GC heap deltas include the driver/browser and are not allocated-byte counts.
All per-cycle observations and startup distributions remain in the matrix summary;
eight tested cycles per workload/framework do not prove absence of every leak.

| Workload | Elnor gzip bytes | React gzip bytes | Svelte gzip bytes | Elnor mounted heap delta bytes | React delta | Svelte delta |
|---|---:|---:|---:|---:|---:|---:|
| counter | 1521 | 69264 | 17024 | 4572 | 128484 | 15040 |
| form | 2212 | 69451 | 19282 | 17432 | 51952 | 19304 |
| composition | 1877 | 69474 | 18159 | 7768 | 47064 | 21052 |
| localized | 1727 | 69334 | 17375 | 39680 | 60688 | 21812 |

## Separate Elnor list profiles

Profiling is separate from timing and uses the uninstrumented production entry.
Counts are sampled leaf-frame observations while the profiler was recording,
not milliseconds or an inclusive CPU decomposition. Frame waits, idle, GC and
driver work can be sampled too. Minified names and sparse short-action samples
limit attribution. Raw call frames plus source excerpts are retained in
`profile-summary.json`; a bundle frame count alone does not justify an optimization.

| Rows | Action | All sampled frames | Elnor bundle frames | Leading bundle function | Leading frame samples |
|---:|---|---:|---:|---|---:|
| 100 | create | 337 | 4 | (anonymous) | 2 |
| 100 | update | 317 | 3 | run | 2 |
| 100 | select | 323 | 2 | (anonymous) | 1 |
| 100 | append | 335 | 3 | (anonymous) | 2 |
| 100 | swap | 317 | 2 | (anonymous) | 1 |
| 100 | remove | 312 | 0 | — | 0 |
| 100 | clear | 326 | 3 | l | 1 |
| 1000 | create | 1233 | 59 | P | 23 |
| 1000 | update | 509 | 13 | (anonymous) | 4 |
| 1000 | select | 180 | 5 | (anonymous) | 3 |
| 1000 | append | 291 | 9 | P | 3 |
| 1000 | swap | 249 | 4 | G | 2 |
| 1000 | remove | 230 | 1 | (anonymous) | 1 |
| 1000 | clear | 1969 | 13 | dispose | 7 |

## Verification and limits

Root evidence: `core-refresh-study/run-b8ef7e78b63f438f8b37461fe2410c90`. Expanded study:
`run-470e2897f9fd4cd996e81f4b6afafeef`; list study: `run-03f8a59a9d4b42d5bf58a161826672cb`.
Original strict summary readers validate source/assets, schemas, action ordering,
visibility, versions, clocks, trace observations and cleanup. Their exact revisions
are retained. Post-timing accessibility traces are observations after the samples;
they do not certify constant conditions throughout timing. Their inclusive time
is not subtracted from renderer cost, and accessibility is not disabled.

All heavy phases used the same Windows Job limits: CPU10%, commit768MiB,
24 processes, host free >=4GiB, kill on owner close; browser wall45s/idle12s,
Node build/summary wall60s/idle60s. All phases ended with zero owned processes.
The host is not isolated. Paired samples, A/A variation and synthetic scope limit
small-change and general-ranking claims. Full proposed Surface syntax, networked
apps, browser/device diversity and independent human DX are not covered here.

The prior comparative document and this reviewed revision are retained next to
`verification.json`. The [performance target](PERFORMANCE-TARGET.md) remains the
separate acceptance goal; this refresh does not mark it complete.
