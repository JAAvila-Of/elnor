# Stable-key reconciliation experiments

**All three candidates rejected. The retained core is unchanged.** Avoiding
repeated reconciliation work improves some isolated steady-state measurements,
but the application and structural cases do not support adopting these variants.
This study preserves both gains and costs rather than selecting only updates.

## Candidates and semantic boundary

Index fusion moves internal index assignment into the existing placement loop.
It removes one separate pass without changing LIS or node placement, but gives no
sustained gain in the focused comparison and is not taken to full application tests.

The general stable-key candidate checks old rows in insertion order while still
evaluating every key and updating item cells. If the entire sequence matches, it
keeps the old Map and skips constructing next/order and subsequent removal,
placement and index passes. At the first mismatch it materializes the matched
prefix and continues the original algorithm. The old Map is retained locally so
cleanup callbacks cannot destroy that prefix; the fast return also checks Map
identity to handle disposal during iterator completion. It never skips work only
because an array reference is unchanged. Key-change/duplicate checks, reads and
same-array entry replacement remain observable.

The exclusive candidate restricts the tentative fast path to nonempty, same-sized
exclusive regions. It caches exactly the array.length read that the exclusive
clear condition already performs; the general API gains no extra length read.
Size-changing creation/append/removal start in the original path. A Proxy control
observes six length reads in a five-row nonexclusive update and seven in an
exclusive one, matching baseline. Length eligibility does not replace iteration
or validate keys by itself: custom iterators and callbacks still run.

These designs retain Elnor's existing LIS, per-row owners and direct DOM model.
They introduce no grammar, immutable-data requirement or new public option.

## Validation and limits

Index fusion and the general candidate each pass 49 tests for both variants.
The exclusive candidate passes 57 for both: the existing cases, three new private
regressions and five reconciliation cases repeated with exclusive ownership.
The final differential suite compares 20 scenario/exclusivity combinations, including
200 deterministic transitions per random run, same-array containers, duplicate
keys, key-source changes, NaN/zero/object/Symbol keys, insertion/key failures and
disposal inside callbacks or iterator completion. It compares node identity/order,
key/build/dispose traces and normalized error streams with the retained runtime.
It does not claim arbitrary user callbacks are side-effect-free or never throw.

An initial regression expected no child nodes after a duplicate-key error, but
the existing recovery contract retains the end comment. That assertion failed
against baseline. It was corrected to require zero row nodes plus exactly one
comment, and both variants passed. The failed source and output are retained.
A second differential run fixes one secondary fixture to exercise the selected
exclusivity too; the final 20-combination result is the authoritative control.

The application collectors remain unchanged. A planned byte-identity shortcut for
non-list bundles failed: even counter names changed after minification. It was
not treated as equivalence; the general candidate therefore received the full
four-workload matrix. The exclusive revision stopped after adverse list/structural
results, before another expanded matrix or full-project gate. Rejected sources
and preparation outputs are preserved, not silently replaced by the next variant.

## Focused stable-order CPU

Each case uses a native two-node row, performs 64 separately flushed updates per
sample, and verifies every key was evaluated and no existing node moved. It runs
two warmups and seven measured samples per label, with A/A and AB/BA. The first
two candidate studies use the general API; the restricted study supplies exclusive
ownership to both baseline and candidate. Values are renderer ThreadTime ms per
64-update batch, not a single action or a complete rendered-frame latency.
Oracles run after metric capture; no runtime source counters are inserted.

### index-fusion

| Case | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| rows-100 | 1.568 → 1.954 (+24.6%) | 1.843 → 1.540 (-16.4%) | 1.488 → 1.513 (+1.7%) | 1.823 → 1.799 (-1.3%) |
| rows-1000 | 10.182 → 11.314 (+11.1%) | 10.028 → 9.966 (-0.6%) | 8.620 → 8.978 (+4.2%) | 9.056 → 9.262 (+2.3%) |

### general

| Case | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| rows-100 | 1.513 → 1.613 (+6.6%) | 2.376 → 2.077 (-12.6%) | 1.706 → 1.458 (-14.5%) | 1.820 → 1.336 (-26.6%) |
| rows-1000 | 9.712 → 10.114 (+4.1%) | 8.718 → 8.641 (-0.9%) | 9.412 → 5.582 (-40.7%) | 8.743 → 5.379 (-38.5%) |

### exclusive

| Case | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| rows-100 | 1.349 → 1.407 (+4.3%) | 2.026 → 1.750 (-13.6%) | 1.732 → 1.206 (-30.4%) | 1.536 → 1.085 (-29.4%) |
| rows-1000 | 9.042 → 8.954 (-1.0%) | 8.674 → 8.695 (+0.2%) | 8.657 → 5.390 (-37.7%) | 8.440 → 5.504 (-34.8%) |

The restricted burst improves about 29–30% at 100 rows and 35–38% at 1000 rows in
these pairs. This is a synthetic no-DOM-change case; it cannot establish an
application-wide improvement or be substituted for the following action samples.

## Normal application actions

Two independent general-candidate cohorts and one exclusive-candidate cohort cover
all seven list actions at 100/1000 rows. Values are TaskDuration milliseconds,
including the normal driver/rendering boundary. They are distinct from focused
ThreadTime batches and must not be pooled with them. A/A uses the candidate fixture
in these public list collectors; focused/matrix A/A use baseline. A/A variation is
descriptive, never subtracted or interpreted as a statistical acceptance margin.

### General cohort 1

| Size/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| 100/create | 3.468 → 3.520 (+1.5%) | 3.421 → 3.464 (+1.3%) | 3.350 → 3.256 (-2.8%) | 3.511 → 3.644 (+3.8%) |
| 100/update | 1.391 → 1.289 (-7.3%) | 1.161 → 1.228 (+5.8%) | 1.240 → 1.203 (-3.0%) | 1.307 → 1.481 (+13.3%) |
| 100/select | 1.129 → 1.158 (+2.6%) | 1.034 → 1.073 (+3.8%) | 1.101 → 1.059 (-3.8%) | 1.186 → 1.048 (-11.6%) |
| 100/append | 1.616 → 1.583 (-2.0%) | 1.489 → 1.601 (+7.5%) | 1.719 → 1.496 (-13.0%) | 1.598 → 1.584 (-0.9%) |
| 100/swap | 1.357 → 1.290 (-4.9%) | 1.528 → 1.311 (-14.2%) | 1.269 → 1.330 (+4.8%) | 1.345 → 1.471 (+9.4%) |
| 100/remove | 1.553 → 1.500 (-3.4%) | 1.523 → 1.605 (+5.4%) | 1.614 → 1.472 (-8.8%) | 1.688 → 1.529 (-9.4%) |
| 100/clear | 1.317 → 1.229 (-6.7%) | 1.219 → 1.230 (+0.9%) | 1.150 → 1.188 (+3.3%) | 1.224 → 1.238 (+1.1%) |
| 1000/create | 24.967 → 28.014 (+12.2%) | 21.181 → 20.160 (-4.8%) | 20.656 → 19.290 (-6.6%) | 19.024 → 21.283 (+11.9%) |
| 1000/update | 3.684 → 3.958 (+7.4%) | 3.389 → 3.419 (+0.9%) | 3.731 → 3.367 (-9.8%) | 3.750 → 3.378 (-9.9%) |
| 1000/select | 2.172 → 1.943 (-10.5%) | 2.007 → 2.310 (+15.1%) | 1.896 → 2.048 (+8.0%) | 2.427 → 1.923 (-20.8%) |
| 1000/append | 6.277 → 5.635 (-10.2%) | 4.333 → 4.230 (-2.4%) | 4.427 → 4.752 (+7.3%) | 4.641 → 4.671 (+0.6%) |
| 1000/swap | 2.578 → 3.309 (+28.4%) | 2.630 → 2.770 (+5.3%) | 2.594 → 2.409 (-7.1%) | 2.771 → 2.606 (-6.0%) |
| 1000/remove | 3.767 → 3.921 (+4.1%) | 3.073 → 3.472 (+13.0%) | 3.114 → 3.362 (+8.0%) | 3.321 → 3.220 (-3.0%) |
| 1000/clear | 3.609 → 3.832 (+6.2%) | 3.201 → 3.407 (+6.4%) | 3.487 → 3.551 (+1.8%) | 3.575 → 3.342 (-6.5%) |

### General cohort 2

| Size/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| 100/create | 3.313 → 3.388 (+2.3%) | 3.340 → 3.401 (+1.8%) | 3.715 → 4.051 (+9.0%) | 3.188 → 3.461 (+8.6%) |
| 100/update | 1.258 → 1.283 (+2.0%) | 1.270 → 1.282 (+0.9%) | 1.433 → 1.362 (-5.0%) | 1.175 → 1.248 (+6.2%) |
| 100/select | 1.093 → 1.134 (+3.8%) | 1.053 → 1.080 (+2.6%) | 1.184 → 1.176 (-0.7%) | 1.121 → 1.070 (-4.5%) |
| 100/append | 1.617 → 1.537 (-4.9%) | 1.500 → 1.517 (+1.1%) | 1.748 → 1.813 (+3.7%) | 1.467 → 1.548 (+5.5%) |
| 100/swap | 1.381 → 1.342 (-2.8%) | 1.509 → 1.293 (-14.3%) | 1.501 → 1.316 (-12.3%) | 1.317 → 1.347 (+2.3%) |
| 100/remove | 1.647 → 1.495 (-9.2%) | 1.423 → 1.392 (-2.2%) | 1.690 → 1.582 (-6.4%) | 1.456 → 1.451 (-0.3%) |
| 100/clear | 1.101 → 1.273 (+15.6%) | 1.143 → 1.141 (-0.2%) | 1.211 → 1.343 (+10.9%) | 1.237 → 1.296 (+4.8%) |
| 1000/create | 20.044 → 21.016 (+4.8%) | 19.019 → 19.295 (+1.5%) | 20.454 → 21.875 (+6.9%) | 20.325 → 21.481 (+5.7%) |
| 1000/update | 3.367 → 3.325 (-1.2%) | 3.500 → 3.418 (-2.3%) | 3.942 → 3.604 (-8.6%) | 3.593 → 3.367 (-6.3%) |
| 1000/select | 1.852 → 1.973 (+6.5%) | 2.368 → 1.899 (-19.8%) | 2.328 → 1.994 (-14.3%) | 2.085 → 1.977 (-5.2%) |
| 1000/append | 4.964 → 4.883 (-1.6%) | 4.659 → 4.662 (+0.1%) | 4.806 → 5.456 (+13.5%) | 4.145 → 5.026 (+21.3%) |
| 1000/swap | 2.512 → 2.309 (-8.1%) | 2.630 → 2.508 (-4.6%) | 2.726 → 2.436 (-10.6%) | 2.551 → 2.972 (+16.5%) |
| 1000/remove | 3.147 → 3.236 (+2.8%) | 3.752 → 3.343 (-10.9%) | 3.357 → 3.255 (-3.0%) | 3.237 → 3.271 (+1.1%) |
| 1000/clear | 3.388 → 3.437 (+1.4%) | 2.963 → 3.696 (+24.7%) | 3.769 → 3.092 (-18.0%) | 3.237 → 3.160 (-2.4%) |

### Exclusive cohort

| Size/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| 100/create | 3.387 → 3.259 (-3.8%) | 3.671 → 3.360 (-8.5%) | 4.273 → 3.593 (-15.9%) | 3.487 → 3.663 (+5.0%) |
| 100/update | 1.286 → 1.244 (-3.3%) | 1.207 → 1.339 (+10.9%) | 1.321 → 1.322 (+0.1%) | 1.297 → 1.330 (+2.5%) |
| 100/select | 1.032 → 1.101 (+6.7%) | 1.061 → 1.134 (+6.9%) | 1.104 → 1.061 (-3.9%) | 1.122 → 1.095 (-2.4%) |
| 100/append | 1.658 → 1.531 (-7.7%) | 1.491 → 1.514 (+1.5%) | 1.691 → 1.498 (-11.4%) | 1.511 → 1.543 (+2.1%) |
| 100/swap | 1.304 → 1.397 (+7.1%) | 1.669 → 1.362 (-18.4%) | 1.378 → 1.356 (-1.6%) | 1.320 → 1.513 (+14.6%) |
| 100/remove | 1.432 → 1.531 (+6.9%) | 1.503 → 1.525 (+1.5%) | 1.624 → 1.586 (-2.3%) | 1.575 → 1.613 (+2.4%) |
| 100/clear | 1.114 → 1.268 (+13.8%) | 1.175 → 1.154 (-1.8%) | 1.053 → 1.282 (+21.7%) | 1.360 → 1.178 (-13.4%) |
| 1000/create | 21.172 → 19.774 (-6.6%) | 23.249 → 21.519 (-7.4%) | 22.761 → 23.734 (+4.3%) | 19.828 → 24.703 (+24.6%) |
| 1000/update | 3.730 → 3.221 (-13.6%) | 3.447 → 3.186 (-7.6%) | 3.804 → 3.734 (-1.8%) | 3.249 → 3.593 (+10.6%) |
| 1000/select | 2.055 → 1.878 (-8.6%) | 2.142 → 1.837 (-14.2%) | 2.160 → 2.060 (-4.6%) | 2.134 → 1.874 (-12.2%) |
| 1000/append | 4.637 → 4.648 (+0.2%) | 4.153 → 4.651 (+12.0%) | 4.745 → 4.900 (+3.3%) | 4.219 → 4.353 (+3.2%) |
| 1000/swap | 2.565 → 2.518 (-1.8%) | 2.427 → 2.803 (+15.5%) | 2.592 → 2.806 (+8.3%) | 2.403 → 2.923 (+21.6%) |
| 1000/remove | 3.709 → 3.278 (-11.6%) | 3.602 → 3.439 (-4.5%) | 3.799 → 3.354 (-11.7%) | 3.236 → 3.290 (+1.7%) |
| 1000/clear | 3.804 → 3.285 (-13.6%) | 3.817 → 3.703 (-3.0%) | 3.851 → 3.423 (-11.1%) | 3.605 → 3.444 (-4.5%) |

General updates 1000 improve 6–10% in both orders across both cohorts, but append 1000
is higher in all four pairs and the confirmation's creation is higher at both
sizes/orders. Restricting by size reduces that fallback exposure, but the measured
exclusive application cohort still has mixed updates and higher creation medians.
Selection improves more consistently; that alone does not justify a global change.
No exact cause is assigned to JIT, allocation, layout or iterator machinery.

## Full expanded matrix for the general candidate

Counter, form, composition and localized updates use the unchanged expanded
collector, including correctness preflights and eight-cycle DOM/listener checks.
Values are renderer ThreadTime milliseconds. This cohort belongs to the general
candidate, not the later exclusive revision. It is not a new React/Svelte ranking.

| Workload/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| counter/mount | 0.978 → 0.967 (-1.1%) | 1.001 → 0.981 (-2.0%) | 1.153 → 1.083 (-6.1%) | 0.869 → 1.008 (+16.0%) |
| counter/increment | 0.856 → 0.852 (-0.5%) | 0.911 → 0.927 (+1.8%) | 0.932 → 0.920 (-1.3%) | 0.850 → 0.878 (+3.3%) |
| counter/unmount | 0.875 → 0.887 (+1.4%) | 0.829 → 0.904 (+9.0%) | 1.002 → 0.981 (-2.1%) | 0.801 → 0.826 (+3.1%) |
| form/mount | 1.272 → 1.193 (-6.2%) | 1.224 → 1.190 (-2.8%) | 1.189 → 1.236 (+4.0%) | 1.269 → 1.236 (-2.6%) |
| form/edit-one | 1.127 → 1.126 (-0.1%) | 1.110 → 1.061 (-4.4%) | 1.085 → 1.175 (+8.3%) | 1.213 → 1.135 (-6.4%) |
| form/edit-all | 1.249 → 1.253 (+0.3%) | 1.169 → 1.226 (+4.9%) | 1.188 → 1.190 (+0.2%) | 1.277 → 1.219 (-4.5%) |
| form/invalid | 1.094 → 1.102 (+0.7%) | 1.080 → 1.115 (+3.2%) | 1.029 → 1.104 (+7.3%) | 1.235 → 1.129 (-8.6%) |
| form/recover | 1.144 → 1.149 (+0.4%) | 1.114 → 1.035 (-7.1%) | 1.223 → 1.110 (-9.2%) | 1.317 → 1.209 (-8.2%) |
| form/unmount | 0.826 → 0.856 (+3.6%) | 0.885 → 0.849 (-4.1%) | 0.914 → 0.892 (-2.4%) | 0.942 → 0.886 (-5.9%) |
| composition/mount | 1.107 → 1.097 (-0.9%) | 1.106 → 1.118 (+1.1%) | 1.104 → 1.179 (+6.8%) | 1.100 → 1.117 (+1.5%) |
| composition/relay | 0.954 → 0.942 (-1.3%) | 0.929 → 0.896 (-3.6%) | 0.947 → 0.949 (+0.2%) | 0.885 → 0.932 (+5.3%) |
| composition/unmount | 0.832 → 0.834 (+0.2%) | 0.832 → 0.847 (+1.8%) | 0.886 → 0.820 (-7.4%) | 0.826 → 0.826 (+0.0%) |
| localized/mount | 1.962 → 1.809 (-7.8%) | 1.855 → 1.908 (+2.9%) | 2.042 → 1.877 (-8.1%) | 1.995 → 1.933 (-3.1%) |
| localized/local-update | 1.060 → 1.116 (+5.3%) | 1.064 → 1.032 (-3.0%) | 1.058 → 1.074 (+1.5%) | 1.073 → 1.051 (-2.1%) |
| localized/unmount | 0.931 → 0.904 (-2.9%) | 0.894 → 0.921 (+3.0%) | 0.963 → 0.894 (-7.2%) | 0.921 → 0.922 (+0.1%) |

## First creation without warmups: general candidate

The existing cold-study protocol creates 1000 rows after the initial empty mount.
There are four fresh owned browser processes per variant in alternating order,
one sample each, with zero warmup rounds. This is neither page/network startup
nor a paired confidence estimate. All observations remain below.

| Order | Variant | Create task CPU ms | Renderer thread ms | Frame window ms |
|---:|---|---:|---:|---:|
| 1 | baseline | 31.039 | 31.085 | 30.4 |
| 2 | candidate | 42.646 | 42.782 | 42.3 |
| 3 | candidate | 27.933 | 27.991 | 29.3 |
| 4 | baseline | 32.445 | 32.485 | 32.2 |
| 5 | baseline | 27.149 | 27.208 | 30.2 |
| 6 | candidate | 33.530 | 33.594 | 393.9 |
| 7 | candidate | 31.466 | 31.521 | 30.6 |
| 8 | baseline | 25.293 | 25.341 | 27.2 |

## Late changes: exclusive candidate

Sixteen extra native cases cover adjacent tail swaps and last-key replacement at
both sizes, with two-node rows. Each sample performs 64 updates. The driver checks
every key, exact row identity/order, two insertions per update and final disposal.
Array copying, callbacks and DOM work occurring in the metric window are included;
the batch does not await a full rendered frame after each individual update.
These are targeted structural diagnostics, not per-action UI latency claims.

### Tail stress, renderer thread ms per 64 updates

| Case | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| swap-tail-100 | 2.855 → 3.003 (+5.2%) | 3.136 → 3.292 (+5.0%) | 3.765 → 3.370 (-10.5%) | 3.552 → 3.274 (-7.8%) |
| swap-tail-1000 | 16.778 → 16.538 (-1.4%) | 15.615 → 14.596 (-6.5%) | 14.410 → 13.892 (-3.6%) | 15.533 → 14.887 (-4.2%) |
| replace-tail-100 | 2.661 → 3.181 (+19.5%) | 2.564 → 3.004 (+17.2%) | 2.615 → 2.824 (+8.0%) | 4.341 → 4.503 (+3.7%) |
| replace-tail-1000 | 11.570 → 11.922 (+3.0%) | 12.049 → 11.460 (-4.9%) | 11.208 → 12.007 (+7.1%) | 11.310 → 11.588 (+2.5%) |

Tail swaps are favorable in these pairs; last-key replacement is higher in both
orders/sizes. A stable-prefix design must balance the fully matched case against
fallback work. This study does not establish a universal regression or a weighted
application score: no real-application usage mix or acceptance threshold was
provided. The conservative decision is to retain the current core.

## Svelte contrast

Read-only reference: Svelte 5.57.3 at clean commit
0156c5fe38b53b72675e2a7f04535de015fdeed1. Its each implementation updates item
bookkeeping during collection processing and compares the current effect with a
linked effect sequence during reconciliation, with separate animation/outro/
hydration behavior. That suggests avoiding unnecessary stable-order work, but
does not make Elnor's own Map/LIS implementation equivalent to Svelte's tree.
No linked-list, effect scheduler, template or runtime code was transplanted.
Elnor's key-call, mutable-array and owner/error behavior remained the comparison
boundary. No Svelte checkout changes, installs or benchmarks were performed.

## Evidence and retained source

Roots under elnor/.elnor/mvp/framework-comparison are index-fusion-study,
stable-keys-study and stable-keys-scoped-study. They retain plans, sources, strict
readers, workers and raw telemetry. Fresh normal baseline fixtures are
matrix-oq6mmg/run-MLugkN, using the final shared-guard compiler. List candidates
use the public runtime-source override: served runtime/bundles are candidates,
while checked raw list graphs retain baseline runtime. The general matrix uses
an explicit private runtime override in both copied graph and served bundle.
Those identities are checked separately rather than relabeling the raw graph.

verification.json audits 115 serial expensive phases: 113 passed, and the two
unsuccessful checks described above remain recorded as failures. CPU 10%,
commit 768MiB, 24 processes, minimum host free 4GiB and kill-on-owner-close are
unchanged. Browser phases use 45s/12s idle; Node phases 60s/60s. No limit, sample,
action, error stream or test was removed to improve a result.

The production runtime/compiler remain byte-identical to the last complete
588-test plus check/build gate. That full gate was not rerun for rejected private
candidates, and the three new regression cases remain private. There is no new
production source change, speedup claim, framework-parity claim or readiness gate.
The next optimization needs a measured mechanism that improves the broader
creation/update tradeoff, rather than another tuning pass on the favorable burst.

Retained runtime: `cf122b7f0c52d66aa360b981229f74af36f40740339c4399d5d7a959442821ab`

Compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

Rejected index-fusion runtime: `8071815167a71cf405d80af311384827c7b8afc96c445caddab245455774fbbd`

Rejected general runtime: `512441361a93ecca4f4bb71e83136ef47ede0f14240f42ceeb126d6d5224055e`

Rejected exclusive runtime: `c0b6e28d8af63aa4b2c4c857e62e52e7012bdb7799fa51429c8444fa45071835`
