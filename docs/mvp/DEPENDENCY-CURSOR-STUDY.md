# Dependency array: private runtime screen

**Screen failed; no integration or broad application claim justified.**

Renderer thread CPU medians, milliseconds. Negative means lower CPU. No DOM, rendering frames or app latency is measured. A/A controls remain separate and unlike kinds are never pooled.

| Kind | A/A AB A/B ms | A/A BA A/B ms | Candidate AB A/B ms (change) | Candidate BA A/B ms (change) |
|---|---:|---:|---:|---:|
| construct-64 | 1.334/1.292 (-3.1%) | 1.340/1.339 (-0.1%) | 1.358/1.284 (-5.4%) | 1.852/1.400 (-24.4%) |
| fanout-24 | 2.509/2.230 (-11.1%) | 2.267/2.328 (+2.7%) | 2.162/2.368 (+9.5%) | 2.202/2.246 (+2.0%) |
| wide-512 | 11.723/12.901 (+10.0%) | 10.842/10.754 (-0.8%) | 10.549/8.747 (-17.1%) | 10.386/8.417 (-19.0%) |
| dynamic-24 | 1.636/1.551 (-5.2%) | 1.466/1.484 (+1.2%) | 1.461/1.336 (-8.6%) | 1.661/1.892 (+13.9%) |

## Cursor revision

Not integrated. The private runtime stores dependencies in an array plus depCount.
It deletes all old subscriptions before executing, overwrites slots as new first
reads are collected, and truncates the tail in finally, including failed runs.
Disposal clears both array and count. Subscription reinsertion order, pending Set,
microtasks, compiler and Surface remain unchanged. It does not retain old edges.
This is a separate revision from the earlier push/clear array, not a pooled cohort.

Each variant passes 69 controls: the prior 53 existing tests and 16 directed
checks. Deduplication tests now capture the private effect through a temporary
Set.add observer and assert actual unique dependency counts, rather than counting
Array.push calls. Both two-entry interleaved reads and 512-entry wide reads remain
checked. Additional tests verify tail trimming after shrink/throw, disposal during
rerun and recovered read order. Observers are absent from timed code. Existing
controlled-GC reader release tests remain unchanged and pass.

All 16 synthetic CPU cases pass, but the declared screen fails: fanout-24 has
higher medians in both orders and dynamic-24 is mixed. The 18 serial Jobs (two
test phases and 16 browser cases) pass under the original CPU10%, commit768MiB,
24-process, host-free4GiB and wall/idle 45/12 or 60/60 limits, with zero owned
processes after cleanup. No source counter is converted to CPU, no significance
or equivalence margin is asserted, and no application/React/Svelte ranking follows.

No engine allocation/backing-store measurement establishes why fanout changes.
The favorable lifecycle/wide observations do not justify integration or broad
application confirmation of this version. Public compiler/runtime remain exactly
70abd192/ae44708c from the historical 610-test/check/build gate. That gate is not
candidate validation. The read-only Svelte array/prefix comparison remains as
documented in DEPENDENCY-ARRAY-STUDY.md; its edge-reuse contract is not adopted.

Private evidence: `dependency-cursor-study/screen-ac1d31a5e8d743af830fff64d50d5e80/review`.
