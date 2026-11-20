# Dependency array: private runtime screen

**Screen failed; no integration or broad application claim justified.**

Renderer thread CPU medians, milliseconds. Negative means lower CPU. No DOM, rendering frames or app latency is measured. A/A controls remain separate and unlike kinds are never pooled.

| Kind | A/A AB A/B ms | A/A BA A/B ms | Candidate AB A/B ms (change) | Candidate BA A/B ms (change) |
|---|---:|---:|---:|---:|
| construct-64 | 1.315/1.410 (+7.2%) | 1.741/1.405 (-19.3%) | 1.463/1.363 (-6.8%) | 1.364/1.206 (-11.6%) |
| fanout-24 | 1.607/1.601 (-0.4%) | 2.173/1.960 (-9.8%) | 1.708/2.296 (+34.4%) | 1.568/1.676 (+6.9%) |
| wide-512 | 9.953/10.060 (+1.1%) | 10.415/10.548 (+1.3%) | 10.297/8.507 (-17.4%) | 10.167/8.491 (-16.5%) |
| dynamic-24 | 1.339/1.431 (+6.9%) | 1.380/1.422 (+3.0%) | 1.424/1.322 (-7.2%) | 1.393/1.421 (+2.0%) |

## Size-delta revision

Not integrated. This independent private revision uses an array for effect
dependencies, with the original complete unsubscribe-before-run behavior. It calls
subs.add(current) once, compares subscriber Set size before/after that insertion,
and pushes the dependency only when the Set grows. It eliminates the extra has
lookup used by the first array, without the cursor revision's depCount field.
The pending Set, microtasks, compiler, Surface and subscription order are unchanged.

Each variant passes 69 directed/original controls: deduplication, wide reads,
growth/shrinkage, failure trimming, disposal, reader retention and B/A reinsertion.
Test-only observation captures the private effect via Set.add to inspect logical
dependency counts. It is absent from all timings. The 16-case screen uses raw,
uninstrumented runtime code, two warmups and seven CPU samples per label, with
separate A/A and AB/BA observations. Construct includes disposal/oracle work; other
kinds include update/settlement/oracles. These are synthetic graphs without DOM,
not application latency, minified bundle performance or a React/Svelte ranking.

The same predeclared screen fails. Fanout medians are higher in both orders and
dynamic-24 is mixed. Favorable wide and lifecycle results do not justify expanding
or integrating this version. No allocation/root-cause measurement, significance
or equivalence margin is claimed. Old has-array and cursor cohorts remain separate.

All 18 serial Jobs pass with CPU10%, commit768MiB, 24 processes, host-free4GiB,
kill-on-owner-close and wall/idle45/12 for browsers or60/60 for tests. Every cleanup
leaves zero owned processes. Public compiler/runtime remain 70abd192/ae44708c from
the historical 610-test/check/build gate; that gate is not candidate validation.
Exact source, raw samples, producers and test hashes are retained in this study.

Private evidence: `dependency-size-study/screen-787ec2d539b9475693f9b47d9aabb273/review`.
