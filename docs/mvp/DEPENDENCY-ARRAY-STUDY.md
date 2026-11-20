# Dependency array: private runtime screen

**Screen failed; no integration or broad application claim justified.**

Renderer thread CPU medians, milliseconds. Negative means lower CPU. No DOM, rendering frames or app latency is measured. A/A controls remain separate and unlike kinds are never pooled.

| Kind | A/A AB A/B ms | A/A BA A/B ms | Candidate AB A/B ms (change) | Candidate BA A/B ms (change) |
|---|---:|---:|---:|---:|
| construct-64 | 1.456/1.591 (+9.3%) | 1.298/1.471 (+13.3%) | 1.569/1.467 (-6.5%) | 1.452/1.248 (-14.0%) |
| fanout-24 | 1.765/1.668 (-5.5%) | 1.653/1.602 (-3.1%) | 1.649/1.695 (+2.8%) | 1.626/1.760 (+8.2%) |
| wide-512 | 10.374/10.185 (-1.8%) | 11.050/11.713 (+6.0%) | 10.974/9.179 (-16.4%) | 11.535/9.227 (-20.0%) |
| dynamic-24 | 1.361/1.366 (+0.4%) | 1.370/1.361 (-0.7%) | 1.542/1.380 (-10.5%) | 1.533/1.343 (-12.4%) |

## Mechanism and distinction from earlier candidates

The private runtime replaces each effect's dependency Set with an array. Each
tracked getter uses the existing cell subscriber Set to detect whether that
effect has already read this cell in the current execution; first reads add the
subscriber and append the dependency once. Repeated/interleaved reads do not grow
the array. All previous subscriptions are still deleted before callback execution,
and new subscriptions are reinserted in read order. Array length resets after
old-edge removal, and disposal and inert-reader release use array emptiness.

The compiler, Surface, pending Set, queue microtasks and error/lifetime protocol
are unchanged. This is not the earlier pending-array/double-Set scheduler, scalar
single-edge representation or stable-edge reuse. It is not an extra duplicate-read
guard layered on top of the original dependency Set: that Set is replaced.
Eliminating a Set construction does not establish fewer engine allocations or
retained bytes; array backing storage, membership lookups and pushes also cost.

The read-only Svelte reference remains commit
0156c5fe38b53b72675e2a7f04535de015fdeed1. Internal/client/runtime.js uses array-based
dependencies with new_deps/skipped_deps and different reuse/version semantics.
Elnor's prototype does not adopt that edge reuse or scheduling contract. No Svelte
source or dependency was modified. Exact inspected source is retained by hash.

## Checks and declared screen

Each variant passes 65 tests: 12 new and 53 existing, with unchanged expectations.
Coverage includes B/A resubscription order, obsolete-edge writes, deduplication
of 20,000 interleaved reads into two dependency entries, 512 unique repeated reads,
dynamic shrinkage/growth, nested failures, disposal during execution, captured
effect disposal, exact thrown values, foreign immediate owners and existing
controlled-GC inert-reader retention checks. A temporary Array.push observer counts
only dependency-Set values in directed tests; it is absent from all CPU windows.
This is directed validation, not a full candidate release gate.

The synthetic CPU screen contains 16 fresh sandboxed headless Edge cases: four
kinds, A/A and candidate pairs, both initial orders, two warmups and seven samples
per label. Construct-64 runs 64 synchronous create/dispose cycles of 64 effects
per observation; other kinds run 256 graph updates with promise settlement.
The construction kind therefore includes disposal and value/oracle work: it is
not isolated create time. The normal raw runtime is served without minification
or counter instrumentation. Imports and graph preparation precede timing;
verification inside the deterministic workload remains part of its window.

The predeclared requirement was lower CPU in both orders for construct-64 and
at least two update kinds, with no update kind higher in both orders. Three kinds
have favorable descriptive medians in both orders, but fanout-24 is +2.8%/+8.2%.
The condition fails. A/A variation remains explicit; no statistical significance,
equivalence or measured causal explanation of the fanout change is asserted.

## Outcome and limits

Keep this version private and do not expand it to application comparisons or
integrate it. The favorable wide/dynamic/lifecycle observations identify a
follow-up question, not application speedup. A separate hypothesis could examine
array storage/reset work in single-dependency fanout while keeping subscription
removal/reinsertion unchanged. Storage allocation has not been measured as the
cause; any revision needs new semantics controls and a separately declared screen.

All 18 Jobs pass serially: two test phases and 16 browser cases. Every Job verifies
CPU 10%, commit 768 MiB, 24 processes, minimum host free 4 GiB and kill-on-owner-close;
browser wall/idle stays 45/12 seconds and tests 60/60. Zero owned processes remain
after each cleanup. Source/runtime/case snapshots, raw samples and test hashes are
retained. The public core remains at compiler 70abd192/runtime ae44708c, unchanged
from its historical 610-test/check/build gate. That gate is not candidate validation.
No new React/Svelte ranking, global speedup, latency or parity is established.

Private evidence: `dependency-array-study/screen-abdbdf9b865a42e5be8ff321a2f461e6/review`. This identifier locates retained internal evidence, not a public artifact link.
