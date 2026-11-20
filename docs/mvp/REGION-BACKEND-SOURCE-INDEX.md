# Ordered regional subscriber index

The region backend stores subscriber membership in an ordered Set per source slot. It uses that same membership to deduplicate reads and deletes tickets directly when their reader retires. This removes explicit taskDeps.some scans and subscriber indexOf/splice removal. It preserves one collector per task, read order, insertion-order notification, dynamic dependency retirement, and the accepted single-record activation protocol. Surface and TypeScript syntax do not change.

## Retention decision

Retained with explicit limits. The same source satisfies the fixed [majority CPU contract](BROAD-PARITY-ACCEPTANCE.md) in two independent complete Svelte cohorts. This is not a global CPU-speedup claim over the previous backend, parity in every operation, React parity, or complete product readiness. The [public core integration](CORE-REGION-INTEGRATION.md) validates the promotion of identical source bytes separately.

The [complete majority report](BROAD-PARITY-MAJORITY.md) preserves all 49 phases. All six family aggregates and all five complex scenario aggregates are within 1.10 in each cohort, and every complex scenario has a majority of its phases within the margin in each cohort. The stricter diagnostic requiring every complex phase within the margin does not pass.

| Persistent phase exception | Cohort 1 CPU overhead | Cohort 2 CPU overhead |
| --- | ---: | ---: |
| Clear 1,000 rows | +32.2% | +29.6% |
| Recover the 96-field form | +21.8% | +12.1% |
| Show the 32 stateful components | +13.5% | +19.0% |

A separate contemporary control uses thirty Jobs to compare old and new code across all five complex scenarios plus keyed100: 34 operations, AA and AB/BA. The candidate/control ratios for form96 mount, edit-all and recovery are 0.893, 0.796 and 0.873; clear1000 is 0.888. Localized scatter is 1.216 and lifecycle toggle is 1.184. Those regressions and the retained AA variation prevent describing this as a uniform improvement. No unfavorable phase is removed.

## Validation

476 backend tests, 71 compatibility tests, 112 native browser cycles and fake/real DOM collection controls pass. The additional semantic control removes a middle row after duplicate cross-owner reads, preserves surviving node identity, checks one update per surviving row and verifies no reads after clear.

The source-index evaluation retains 19 successful bounded Jobs and no failed attempt in this variant. Two Svelte cohorts add 118 Jobs, 5,488 CPU samples and 196 normalized DOM checks. The direct control adds 30 Jobs, 1,904 samples and 68 checks: 167 successful Jobs, 7,392 performance samples and 264 checks in total. All original limits remain: CPU 10%, 768 MiB aggregate commit, Node 192 MiB, 24 processes, 4 GiB host-free floor, timeouts, CSP and browser sandbox. Timing cohorts are not pooled. CPU is not latency, FPS or cold startup.
