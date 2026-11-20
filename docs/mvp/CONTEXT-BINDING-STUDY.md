# Context-independent compiler fragments

**Verdict: retain as a compiler-work reduction with limited timing evidence.**
The runtime is unchanged. Counter, form and localized generation use less main-thread
CPU in both compiler assignments; composition and list results are mixed. There
is no claim of universally faster compilation or faster browser interactions.

## Scope

The candidate avoids creating a TypeScript Program and checker for a fragment
only when its source contains none of the context names and no backslash.
It still parses the same projection and prints it with TypeScript. A possible
name match, including a substring in a comment, string, property or shadowed
local, uses the complete existing symbolic rewrite. Every backslash also uses
that path, so Unicode-escaped context identifiers cannot bypass substitution.
This is deliberately conservative; it is not a regex-based name replacement.
Component validation, checking, grammar and the runtime remain unchanged.

## Deterministic work and output

The private instrumented binding-analysis copy counts all Program creations
through bindSource during generate, including validation/import analysis.
These are operation counts, not allocated bytes, editor latency or wall time.

| Workload | Baseline Programs | Candidate Programs |
|---|---:|---:|
| counter | 5 | 3 |
| form | 12 | 6 |
| composition | 27 | 25 |
| localized | 31 | 5 |
| list | 20 | 13 |
| edges | 15 | 8 |

The five application scenarios total **95 → 52 Programs (43 fewer, 45.3%)**.
Rewrite invocation counts are unchanged. All **17 generated modules** in this
corpus, including three extra edge cases, are byte-identical for baseline and
candidate with identical inputs, filenames and emission options. This covers
counter, form, composition, localized updates and the shared list graph; it is
not a proof over every possible Surface program. Supporting source copies are
identical within each comparison; only the compiler entry differs.

## Generation timing controls

The initial cohort used short batches and process-wide CPU counters. Its raw
samples are retained, including CPU totals greater than elapsed time. The final
controls additionally record main-thread CPU, larger batches, A/A, and reversed
compiler assignment. These measure generate only: parsing the corpus, graph
typechecking, bundling, loading dependencies and browser work are outside timing.
Five measured rounds follow two warmups per label; label execution alternates.
Values below are medians per whole workload generation, in milliseconds.
AA means both labels use baseline; AB means candidate B; BA means candidate A.
Different cohorts use different batch sizes and must not be pooled.

[Node documents process-wide and thread CPU counters separately](https://nodejs.org/api/process.html#processthreadcpuusagepreviousvalue).
Process CPU can include work on several cores. The raw samples are more useful
than a single rounded ratio; Windows counter granularity, GC, JIT and the Job
CPU cap limit precision. No outliers are removed, margin or significance claimed.

| Cohort | Pair | Workload | A elapsed | B elapsed | A process CPU | B process CPU | A thread CPU | B thread CPU |
|---|---|---|---:|---:|---:|---:|---:|---:|
| initial | AB | counter | 7.596 | 4.944 | 18.600 | 15.600 | — | — |
| initial | AB | form | 12.388 | 15.710 | 31.500 | 39.500 | — | — |
| initial | AB | composition | 53.681 | 31.685 | 70.000 | 62.500 | — | — |
| initial | AB | localized | 18.595 | 13.867 | 31.000 | 78.000 | — | — |
| initial | AB | list | 31.448 | 28.070 | 47.000 | 61.000 | — | — |
| controls | AA | counter | 15.070 | 5.502 | 10.950 | 10.900 | 5.500 | 4.650 |
| controls | AA | form | 18.013 | 13.292 | 31.200 | 21.900 | 12.500 | 12.500 |
| controls | AA | composition | 79.391 | 49.388 | 78.000 | 75.000 | 40.400 | 40.800 |
| controls | AA | localized | 48.013 | 41.392 | 42.200 | 53.100 | 25.000 | 25.000 |
| controls | AA | list | 46.383 | 35.135 | 46.900 | 54.600 | 29.700 | 32.700 |
| controls | AB | counter | 4.637 | 4.854 | 10.100 | 10.150 | 4.700 | 3.900 |
| controls | AB | form | 11.300 | 31.354 | 28.100 | 18.800 | 10.900 | 9.500 |
| controls | AB | composition | 83.817 | 62.413 | 81.400 | 99.800 | 46.800 | 47.000 |
| controls | AB | localized | 40.844 | 34.790 | 51.600 | 28.200 | 25.000 | 15.600 |
| controls | AB | list | 46.882 | 30.431 | 47.000 | 40.600 | 28.100 | 25.000 |
| controls | BA | counter | 4.925 | 5.540 | 10.150 | 8.550 | 3.150 | 4.750 |
| controls | BA | form | 10.367 | 26.744 | 17.300 | 21.800 | 9.400 | 14.100 |
| controls | BA | composition | 82.093 | 55.856 | 84.400 | 93.800 | 40.600 | 46.800 |
| controls | BA | localized | 13.216 | 36.577 | 21.900 | 42.200 | 10.900 | 20.300 |
| controls | BA | list | 42.196 | 28.353 | 43.700 | 43.800 | 26.500 | 23.500 |

Initial thread CPU cells are uncollected. All initial/control samples and source copies
are retained; the controls' raw source hashes identify each variant explicitly.

## Candidate-relative main-thread CPU

These medians normalize the AB/BA compiler assignments. A/A variation remains
visible above; the deltas are descriptive rather than significance statements.

| Workload | AB baseline ms | AB candidate ms | Change | BA baseline ms | BA candidate ms | Change |
|---|---:|---:|---:|---:|---:|---:|
| counter | 4.700 | 3.900 | -17.0% | 4.750 | 3.150 | -33.7% |
| form | 10.900 | 9.500 | -12.8% | 14.100 | 9.400 | -33.3% |
| composition | 46.800 | 47.000 | +0.4% | 46.800 | 40.600 | -13.2% |
| localized | 25.000 | 15.600 | -37.6% | 20.300 | 10.900 | -46.3% |
| list | 28.100 | 25.000 | -11.0% | 23.500 | 26.500 | +12.8% |

Localized generation changes 25.0→15.6 ms and 20.3→10.9 ms in the two
assignments. List generation is mixed (-11.0%/+12.8%); composition is mixed
(+0.4%/-13.2%). No aggregate speedup across differently weighted workloads is
computed. These are generation-stage figures, not check/build/editor latency.

## Correctness and containment

Two new public cases exercise escaped context reads/writes and independent typed
nested functions/templates. They pass before the optimization as well. Existing
scope, name-hygiene, initialization, events, slots and graph tests remain intact.
The candidate passes **581 tests, check and build in 50 serial phases** under
`test-runs/run-89334e912951476bbc1f280fa14a3b4b`.

The first combined candidate targeted run reached its 60-second wall limit after
the new cases passed; it is incomplete, not green. The subsequent full gate ran
every test file separately with the same coverage and unchanged 60-second limits.
The baseline combined targeted run passed. All evidence, including the timeout,
is preserved. No limit, coverage or guard was lowered.

Every expensive phase used a Windows Job: CPU10%, commit768MiB,24 processes,
host free >=4GiB,60-second wall/idle limits, kill-on-owner-close. The final audit
verifies serial intervals, cleanup and source/evidence hashes.

Runtime matches `matrix-fFpgAM/runtime-source.mjs` exactly. No new browser timing,
React/Svelte ranking, allocated-byte measurement or production-readiness result
is supplied by this compiler investigation. The generated-output equality corpus
and full gate support compiler compatibility within their practical limits.

## Evidence references

Baseline compiler: `matrix-fFpgAM/compiler-source.mjs`.
Initial counts and timing: `context-binding-study/compiler-8667ab8962e54620b48cad0724ed1208`.
A/A and AB/BA controls: `context-binding-study/controls-6e74c25000b44621ba60565a25f8fb25`.
The controls directory retains this reviewed report, the prior comparative-document
revision, and `verification.json` with evidence and active-source hashes.
