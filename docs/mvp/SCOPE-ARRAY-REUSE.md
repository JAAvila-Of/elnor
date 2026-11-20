# Reusing the scope cleanup array

**Retained as an allocation optimization. CPU results remain mixed.** Scope
disposal now passes its private callback array to the unchanged `cleanAll` after
reversing it, then empties that array in `finally`. It no longer calls `splice(0)`
to create a detached callback snapshot. Other cleanup allocations remain.

The scope is marked disposed before invoking callbacks. Late registrations already
execute immediately, so they cannot append to the array being traversed. LIFO,
unbound callback receivers, error aggregation order, reentry and idempotence remain
covered. `finally` releases callback references even after failure. There is no new
Surface syntax, public flag, owner field, event strategy or runtime architecture.
This differs from the rejected reverse-loop variants: their traversal changed;
this keeps the original `cleanAll` implementation and callback invocation path.

## Native allocation evidence and retention

An isolated native Edge157.0.4341.42 probe prepares 4,000 real scopes, each owning
two callbacks, outside sampling. It warms three batches, samples only disposal plus
a retained-array positive control, includes objects collected by minor/major GC,
and performs GC before stopping. Six fresh pages use baseline/candidate ABBAAB.
No source counters are inserted into these runtime modules.

Values below are **sampled V8 estimates**, not exact allocated or retained bytes.
The diagnostic has no DOM and does not quantify whole-application allocation.
Total samples include the positive control and other engine/protocol allocations.
No per-row or universal percentage saving is extrapolated from this microcase.

| Round | Variant | Bytes attributed through splice | Positive-control bytes | Total sampled bytes |
|---:|---|---:|---:|---:|
| 1 | baseline | 128144 | 143584 | 565268 |
| 2 | candidate | 0 | 141304 | 346716 |
| 3 | candidate | 0 | 141340 | 360740 |
| 4 | baseline | 131264 | 141372 | 466008 |
| 5 | baseline | 129704 | 142112 | 506412 |
| 6 | candidate | 0 | 140788 | 388144 |

The baseline's splice-attributed estimates are 128,144–131,264 bytes; all three
candidate observations are zero for that call path. Positive controls are present
in every profile. The full raw profiles and call-frame summaries are retained.
Four separate forced-GC controls keep the scope itself alive: callback payloads
are retained before disposal and collectible afterward, with and without thrown
cleanup errors, in baseline and candidate. Two public regression cases now cover
the normal and throwing cases with positive controls and inert repeated disposal.

## Global application CPU

All values are renderer ThreadTime medians in ms from seven action windows per
label after two warmups. Each cell shows baseline → candidate (relative change).
Positive changes are slower. A/A uses the same baseline twice. Different pairs
have their own observations; no significance test or universal margin is claimed.

| Workload | Action | Candidate AB | Candidate BA | A/A AB change | A/A BA change |
|---|---|---:|---:|---:|---:|
| counter | mount | 0.974 → 0.914 (-6.2%) | 0.952 → 0.934 (-1.9%) | +0.0% | +0.0% |
| counter | increment | 0.835 → 0.848 (+1.6%) | 0.859 → 0.983 (+14.4%) | -1.3% | +3.1% |
| counter | unmount | 0.785 → 0.788 (+0.4%) | 0.780 → 0.817 (+4.7%) | +7.2% | +1.9% |
| form | mount | 1.334 → 1.305 (-2.2%) | 1.267 → 1.215 (-4.1%) | -1.2% | -1.5% |
| form | edit-one | 1.205 → 1.234 (+2.4%) | 1.228 → 1.140 (-7.2%) | -3.3% | +5.5% |
| form | edit-all | 1.270 → 1.212 (-4.6%) | 1.274 → 1.267 (-0.5%) | +0.8% | +3.3% |
| form | invalid | 1.232 → 1.122 (-8.9%) | 1.185 → 1.067 (-10.0%) | -0.6% | -3.1% |
| form | recover | 1.102 → 1.217 (+10.4%) | 1.275 → 1.149 (-9.9%) | +10.9% | -21.7% |
| form | unmount | 0.921 → 0.891 (-3.3%) | 0.875 → 0.860 (-1.7%) | +2.8% | -0.8% |
| composition | mount | 1.398 → 1.298 (-7.2%) | 1.260 → 1.324 (+5.1%) | -14.6% | +4.3% |
| composition | relay | 1.120 → 1.100 (-1.8%) | 1.018 → 1.019 (+0.1%) | -3.2% | -0.9% |
| composition | unmount | 0.993 → 0.924 (-6.9%) | 0.893 → 0.897 (+0.4%) | -10.7% | +6.3% |
| localized | mount | 2.713 → 2.030 (-25.2%) | 1.975 → 1.958 (-0.9%) | -0.7% | +1.1% |
| localized | local-update | 1.346 → 1.047 (-22.2%) | 1.108 → 1.084 (-2.2%) | -3.0% | +7.1% |
| localized | unmount | 1.147 → 1.063 (-7.3%) | 1.168 → 1.067 (-8.6%) | +9.4% | +7.9% |

## Lists: 100 and 1,000 rows

The list metric is TaskDuration with threadTicks, as in its existing harness,
rather than the expanded table's ThreadTime. Normal framework scheduling, keyed
identity, schema verification, two frame callbacks and accessibility observations
remain intact. No timing uses allocation counters or phase-clock probes.

| Rows | Action | Candidate AB | Candidate BA | A/A AB change | A/A BA change |
|---:|---|---:|---:|---:|---:|
| 100 | create | 3.319 → 3.268 (-1.5%) | 3.289 → 3.571 (+8.6%) | -1.8% | +5.2% |
| 100 | update | 1.266 → 1.239 (-2.1%) | 1.227 → 1.275 (+3.9%) | +3.2% | -4.4% |
| 100 | select | 1.086 → 1.055 (-2.9%) | 1.104 → 1.050 (-4.9%) | -8.6% | +1.6% |
| 100 | append | 1.531 → 1.578 (+3.1%) | 1.550 → 1.490 (-3.9%) | -12.1% | +0.7% |
| 100 | swap | 1.352 → 1.274 (-5.8%) | 1.327 → 1.287 (-3.0%) | -1.8% | -1.1% |
| 100 | remove | 1.454 → 1.382 (-5.0%) | 1.517 → 1.426 (-6.0%) | -3.8% | +0.3% |
| 100 | clear | 1.165 → 1.234 (+5.9%) | 1.278 → 1.142 (-10.6%) | +4.1% | -11.7% |
| 1000 | create | 18.219 → 19.465 (+6.8%) | 21.487 → 18.762 (-12.7%) | -7.1% | +25.0% |
| 1000 | update | 3.459 → 3.458 (-0.0%) | 3.426 → 3.695 (+7.9%) | -7.6% | +11.8% |
| 1000 | select | 1.993 → 1.986 (-0.4%) | 1.987 → 1.973 (-0.7%) | -11.4% | +2.0% |
| 1000 | append | 4.259 → 4.123 (-3.2%) | 4.299 → 4.227 (-1.7%) | -7.9% | -6.5% |
| 1000 | swap | 2.329 → 2.538 (+9.0%) | 2.360 → 2.413 (+2.2%) | +8.2% | +9.0% |
| 1000 | remove | 3.224 → 3.047 (-5.5%) | 3.084 → 3.220 (+4.4%) | +7.5% | +8.9% |
| 1000 | clear | 3.525 → 3.164 (-10.2%) | 3.001 → 3.060 (+2.0%) | +2.2% | -6.1% |

The 1,000-row clear results are 3.525→3.164 ms (-10.2%) and 3.001→3.060 ms
(+2.0%). Swap is +9.0%/+2.2%, while its contemporaneous A/A is +8.2%/+9.0%.
Other operations also vary. These cohorts do not demonstrate a global CPU speedup
or certify no regression on every device. Retention is based on avoided scope
snapshot work and native allocation evidence, alongside preserved behavior.

## Delivery and live heap

Mounted post-GC heap deltas are identical in these captures: counter1,712 bytes,
form7,560,composition4,840,localized36,512. Live heap does not measure transient
allocation. Entry gzip bytes are observed sizes; generated diagnostic filenames
can affect compression. Runtime/source resources are not broadly allocation-free.

| Workload | Baseline gzip bytes | Candidate gzip bytes |
|---|---:|---:|
| counter | 1505 | 1504 |
| form | 2105 | 2108 |
| composition | 1855 | 1858 |
| localized | 1710 | 1712 |

## Verification and fixture provenance

The complete retained source passes **583 tests, check and build in 50 serial
phases**, `run-83094cb5bfb040b0a9d94b9e9cf97b9f`. Separate baseline/candidate targeted suites, native
preflights (42 list and 45 expanded checks), four retained-scope GC controls,
784 list + 840 expanded timed action windows, and the six-page sampling probe
also pass. The original strict summary readers remain unchanged.

The allocation-counter tool explicitly recognizes both source forms. Its targeted
compatibility check reports one scope snapshot for baseline, zero for reuse, and
the same LIFO result. Its existing output schema and rejection of unknown source
remain. This diagnostic-tool check is separate from the complete core test gate.

Baseline fixtures: `matrix-WR6i9N` / `run-ZZn7ZX`. Candidate fixtures:
`matrix-DyLxrY` / `run-BSfUDy`. The list builder's
existing runtime-source override was used. For the expanded matrix, a private
producer performs the original checked compilation, then explicitly replaces the
published graph runtime and updates its file hash before bundling. The candidate
runtime/source and all served assets are verified. Public source was not swapped
during that trial. Both raw producer bytes and normalized-text provenance are
retained. No compiler build-speed claim is inferred from those tooling records.

Production was updated only after the private trials, using the exact candidate
bytes. The new public GC tests were then run in the full gate. The current runtime
SHA-256 is `9212a50d2bf35c77ff97cf06c79e10eaac1cce879d7cfafa17c9d5aa9087e855`; the compiler is unchanged. No Svelte code, generic effect
tree, dependency-array representation or new DOM clearing primitive was adopted.

Evidence is under `scope-array-reuse-study`: `list-trial-961e40032da24583a11c92b0aaa14601`, `matrix-trial-6d319640ee394f13ae01ba0f02182005`,
`sampling-70aa9d2e5e844766bed68569bf65135d`, `probe-support-87c4d853bd054b47a3434be35afa3451`, and `review-verification.json`. All **87 reviewed
heavy phases** were serial with CPU10%,768MiB commit,24 processes,host-free>=4GiB,
kill-on-owner-close; browsers45s wall/12s idle and Node phases60s/60s. Every phase
reports zero remaining owned processes. No guard, coverage or accessibility setting
was lowered. One preparation command was rejected before execution for shell quoting;
the same preparation was put into a file and run normally, with no policy bypass.

No new direct React/Svelte timing cohort is supplied for this source update. The
comparative tables in [current core comparison](CURRENT-CORE-COMPARISON.md) remain
measurements of their explicitly frozen earlier runtime. The competitive target
and production readiness remain separate open requirements.
