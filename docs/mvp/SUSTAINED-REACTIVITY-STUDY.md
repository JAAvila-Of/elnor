# Sustained reactivity profiles and scheduler experiments

**Both scheduler candidates rejected. The retained core is unchanged.** Native
profiles separate broad effect fanout from wide dependency sets and cascades.
Two small Elnor-specific batch-storage experiments pass their functional tests
but fail to produce a consistent CPU improvement. Neither was integrated or
promoted to the full application comparison.

## Workloads and normal measurements

These are isolated reactive graphs without DOM, not framework applications:

- fanout-1/24/200: one cell updates 1, 24 or 200 effects.
- wide-512: one effect reads 512 cells, with only the first changing.
- dynamic-24: an effect alternates between two disjoint sets of 24 cells plus mode.
- chain-20: twenty computed cells cascade into one output effect.

Writes use the normal runtime scheduler and native microtasks. Each measured batch
contains **256 writes**, awaiting a microtask continuation after each. Chains await
21 continuations per write to settle all levels. The driver, promise continuations,
output verification and CDP metric boundaries are included. Values below must not
be interpreted as single-click latency, pure tracking time or application savings.
Different graph shapes also have different work and settling policies.

The retained runtime source is served without rewriting or bundling. Each of two
fresh-browser repetitions warms twice, measures five batches and then profiles a
separate 2,048-write batch. The second repetition reverses workload order.

| Graph | Repeat 0: median thread ms / 256 writes | Repeat 1: median thread ms / 256 writes | Profile samples 0 / 1 | Runtime self samples 0 / 1 |
|---|---:|---:|---:|---:|
| fanout-1 | 1.390 | 0.763 | 16 / 15 | 2 / 2 |
| fanout-24 | 2.119 | 2.174 | 31 / 31 | 14 / 15 |
| fanout-200 | 7.598 | 7.618 | 108 / 108 | 91 / 83 |
| wide-512 | 10.147 | 10.529 | 167 / 161 | 139 / 136 |
| dynamic-24 | 2.361 | 1.630 | 29 / 24 | 15 / 6 |
| chain-20 | 16.711 | 12.493 | 196 / 194 | 34 / 39 |

## Profile observations and resolution

Profiles request a 100-microsecond sampling interval. This is a requested setting,
not proof of achieved resolution or exact CPU durations. Sample counts remain
unweighted: wall-clock timeDeltas are not converted into function CPU under the
job CPU cap. Idle, GC and unattributed engine/protocol samples remain in the data.
Runtime-inclusive counts are reported separately and never added to self counts.

With fanout-200, flush has 52/58 self samples, get value has 21/14 and notify18/11.
With wide-512, effect run has 90/79 and get value45/54. In chain-20, flush has23/25
and native queueMicrotask18/17, alongside many unattributed program samples.
Small fanout profiles have too few samples for precise attribution.

This supports investigating the scheduler for fanout and the execution/tracking
path for wide dependencies. It **does not** quantify Set.delete, clear or add
individually: optimized frames often point at a function's first source line and
may include inlined work. It supplies no tracking-only percentage for an actual
application and no savings estimate for Rust or a dependency-graph rewrite.

## Two independent private candidates

The double-Set candidate swaps two private Sets between captured batch and future
pending work, then clears the old batch before propagating errors. It avoids the
snapshot Array but changes the batch iterator. The reusable-array candidate keeps
an Array iterator, copies pending effects into one private Array and empties it
after the batch. It changes snapshot preparation and lifetime rather than effect
subscriptions. Both preserve pending.delete before execution, error aggregation,
follow-up microtasks and disposed-effect checks. The new storage is private.

Each candidate and its baseline pass **37 existing tests**: dependency tracking,
scheduler, consumed/later invalidations, structural recovery and capture retention.
Functional success alone does not justify adoption.

Each independent candidate then receives 24 fresh-browser cases: six shapes ×
A/A or baseline/candidate × AB/BA initial order. Pages alternate each batch; each
page warms twice and supplies seven normal, unprofiled 256-write measurements.
These timings use the same driver/oracles and include all samples. The table
shows renderer thread-time medians. Negative change means lower measured CPU.
There is no statistical acceptance threshold; A/A is descriptive variation and
is not subtracted or used as a confidence interval. Cohorts are not pooled.

### double-set

| Graph | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| fanout-1 | 0.805 → 0.764 (-5.1%) | 0.838 → 1.220 (+45.6%) | 0.982 → 0.914 (-6.9%) | 0.812 → 0.830 (+2.2%) |
| fanout-24 | 1.820 → 1.746 (-4.1%) | 1.815 → 2.004 (+10.4%) | 1.747 → 1.660 (-5.0%) | 1.782 → 2.053 (+15.2%) |
| fanout-200 | 7.892 → 7.696 (-2.5%) | 9.323 → 10.254 (+10.0%) | 6.639 → 7.113 (+7.1%) | 8.014 → 8.158 (+1.8%) |
| wide-512 | 12.250 → 10.476 (-14.5%) | 10.489 → 10.969 (+4.6%) | 10.287 → 10.359 (+0.7%) | 11.371 → 11.233 (-1.2%) |
| dynamic-24 | 1.717 → 1.602 (-6.7%) | 1.752 → 1.706 (-2.6%) | 1.481 → 1.578 (+6.5%) | 1.482 → 1.589 (+7.2%) |
| chain-20 | 10.592 → 10.531 (-0.6%) | 11.567 → 11.643 (+0.7%) | 11.117 → 11.167 (+0.4%) | 10.887 → 11.234 (+3.2%) |

### reused-array

| Graph | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| fanout-1 | 0.760 → 0.843 (+10.9%) | 0.908 → 0.774 (-14.8%) | 1.035 → 0.892 (-13.8%) | 0.760 → 0.899 (+18.3%) |
| fanout-24 | 1.691 → 1.653 (-2.2%) | 1.603 → 1.626 (+1.4%) | 2.365 → 2.550 (+7.8%) | 1.838 → 1.931 (+5.1%) |
| fanout-200 | 6.768 → 6.740 (-0.4%) | 7.788 → 7.065 (-9.3%) | 7.795 → 8.624 (+10.6%) | 10.285 → 10.863 (+5.6%) |
| wide-512 | 12.035 → 13.106 (+8.9%) | 10.467 → 10.440 (-0.3%) | 12.274 → 12.084 (-1.5%) | 12.317 → 11.972 (-2.8%) |
| dynamic-24 | 1.790 → 1.864 (+4.1%) | 2.130 → 1.752 (-17.7%) | 1.854 → 1.936 (+4.4%) | 1.555 → 1.553 (-0.1%) |
| chain-20 | 11.155 → 10.845 (-2.8%) | 10.680 → 10.590 (-0.8%) | 12.528 → 11.978 (-4.4%) | 10.796 → 11.438 (+5.9%) |

Double-Set fanout-200 is higher by7.1%/1.8%, dynamic24 by6.5%/7.2% and chain20
by0.4%/3.2%. Reused-array fanout-200 is higher by10.6%/5.6% and fanout24 by7.8%/5.1%;
chain20 changes sign. The small wide-512 decrease for the reused Array does not
establish a useful global tradeoff. No specific engine, allocator or iterator
cause is inferred. Avoiding a source-level allocation is not itself a speedup.

## Svelte contrast

Svelte5.57.3 at clean commit `0156c5fe38b53b72675e2a7f04535de015fdeed1` is a
read-only source reference. Its runtime.get uses read-version deduplication and
stable dependency prefixes, as described in [the tracking census](REACTIVE-TRACKING-CENSUS.md).
Its dom/task.js also separates captured microtasks from future work by replacing
the queue, and protects queued callbacks from synchronous-flush ordering races.
batch.js processes effects with its own tree, dirty flags and synchronization.

The useful contrast is maintaining a boundary between captured and newly queued
work. These Elnor candidates do not import Svelte's scheduler or change Elnor to
its ordering policy. In fact, Svelte's task queue still creates a fresh Array:
the reference does not justify removing every allocation. No Svelte source,
branch or installed dependencies were changed; no Svelte benchmarks were run.
This study supplies no new React/Svelte ranking or production-readiness claim.

## Evidence and next boundary

All64 expensive phases passed serial containment:12 baseline profiles, four Node
test phases and48 paired native cases. CPU10%, commit768MiB, max24 processes,
minimum host free4GiB and kill-on-owner-close stay enforced. Browser phases use
wall45s/idle12s; Node test phases60s/60s. Edge157.0.4341.42 is headless and
sandboxed with GPU disabled; accessibility is not disabled. Profile files are
capped at8MiB. Output values, dynamic transitions and disposal are checked.

The production runtime/compiler remain byte-identical to the last full gate:
**586 tests plus check/build**, run-2396dbecd62042a996d780ae7463a5ff. That gate was
not rerun for private rejected variants. No production source or public tests
changed. The native synthetic checks are not substitutes for full application
testing of any future retained change.

Study roots under `elnor/.elnor/mvp/framework-comparison/` are
`reactive-cpu-study` and `scheduler-array-study`. Producers retain plans, sources,
workers, raw samples, profiles and supervisor telemetry. `profile-verification.json`
checks12 profiles and positive/invalid analyzer controls; `verification.json`
recomputes both strict paired summaries, checks37-test logs and source identities,
and verifies all64 phases do not overlap. No metrics are reclassified to improve
the candidate results. Source hashes identify each rejected candidate below.

The next optimization needs a new measured mechanism. These results argue against
further snapshot-storage variants on allocation intuition alone. Wide-dependency
tracking remains a separate hypothesis; any design must preserve the observable
subscription order and writes-during-execution boundaries established by the
tracking census before it can be compared as a candidate.

double-set candidate: `4f695774c9077b6847842e33160280258bd4d16cc51d123d0a27645aa177c0e5`

reused-array candidate: `85c921bd5736920156b1228728d73835dc385dc9fd840805216f771a03b57e49`

Retained runtime: `cf122b7f0c52d66aa360b981229f74af36f40740339c4399d5d7a959442821ab`
