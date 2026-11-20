# Scope disposal study

Both candidates were rejected. The active runtime remains the direct-root baseline `run-OLDLti`. Removing a callback-array copy and reversal did not produce a consistent improvement across the measured operations.

The baseline marks a scope disposed before calling `cleanAll(disposers.splice(0).reverse())`. Each candidate instead walks its private callback array backwards, clears references as it proceeds, and allocates its error array only after an exception. The second candidate moves that loop into a shared private helper. No compiler, Surface syntax, DOM ownership, event handling or effect representation changed.

Late registrations execute immediately because the scope is already disposed; callbacks retain their unbound receiver. Cleanup remains LIFO, reentrant and idempotent, attempts every callback, and preserves error ordering. Two new regression tests exercise these contracts and pass against both the original implementation and the candidates.

## Measurement protocol

Each study has 36 passing cases: four separate mutation checks plus four fresh browser processes per variant and size. Each timing process uses two warmups and seven measured rounds, giving 28 samples per operation. Variant order rotates across four positions. Tables report renderer CPU TaskDuration medians in milliseconds using threadTicks, not elapsed frame latency. Compare variants within a cohort; these are descriptive results rather than a significance or parity claim.

All browser/build/test work uses the existing Windows Job supervisor: 10% aggregate CPU, 768 MiB job commit, at most 24 processes, sandboxed headless Edge with GPU disabled, 45-second browser deadlines and 60-second Node-test deadlines. The summary tool verifies control/shared assets, collector/browser identity and zero remaining owned processes. Normal timing fixtures have no allocation probes.

Evidence identifiers are relative to `elnor/.elnor/mvp/framework-comparison/`. Summary JSON retains ranges and per-process medians, as well as source hashes. React and Svelte are controls built from the same workload.

## Inline reverse traversal — rejected

Candidate `run-t9zIPs`; study `studies/run-bdd267a7d0ba4c829bf533677127c55c`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.219 | 3.100 | 3.099 | 3.155 |
| 100 | Update | 1.256 | 1.200 | 1.456 | 1.245 |
| 100 | Select | 1.071 | 1.036 | 1.276 | 1.077 |
| 100 | Append | 1.482 | 1.467 | 1.700 | 1.515 |
| 100 | Swap | 1.292 | 1.229 | 3.124 | 1.283 |
| 100 | Remove | 1.442 | 1.375 | 1.670 | 1.432 |
| 100 | Clear | 1.148 | 1.075 | 1.296 | 1.060 |
| 1000 | Create | 17.984 | 19.210 | 18.102 | 17.313 |
| 1000 | Update | 3.302 | 3.349 | 3.981 | 3.224 |
| 1000 | Select | 1.876 | 1.969 | 2.607 | 1.895 |
| 1000 | Append | 4.246 | 4.243 | 4.591 | 4.061 |
| 1000 | Swap | 2.365 | 2.374 | 22.629 | 2.373 |
| 1000 | Remove | 3.053 | 3.057 | 3.913 | 3.084 |
| 1000 | Clear | 2.989 | 2.920 | 3.760 | 2.473 |

## Shared reverse-traversal helper — rejected

Candidate `run-t2FGLG`; study `studies/run-e0ede78dda02461293ec25e00c908b5a`; browser `157.0.4341.42`.

| Rows | Operation | Baseline | Candidate | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.154 | 3.072 | 3.077 | 3.131 |
| 100 | Update | 1.203 | 1.159 | 1.466 | 1.216 |
| 100 | Select | 1.040 | 1.026 | 1.234 | 1.082 |
| 100 | Append | 1.456 | 1.462 | 1.634 | 1.541 |
| 100 | Swap | 1.224 | 1.191 | 3.118 | 1.294 |
| 100 | Remove | 1.375 | 1.373 | 1.641 | 1.480 |
| 100 | Clear | 1.077 | 1.042 | 1.310 | 1.073 |
| 1000 | Create | 18.948 | 18.310 | 17.708 | 17.513 |
| 1000 | Update | 3.236 | 3.352 | 4.058 | 3.254 |
| 1000 | Select | 1.903 | 1.965 | 2.730 | 1.938 |
| 1000 | Append | 4.269 | 4.272 | 4.649 | 4.045 |
| 1000 | Swap | 2.416 | 2.417 | 21.313 | 2.359 |
| 1000 | Remove | 3.005 | 3.126 | 3.888 | 3.026 |
| 1000 | Clear | 3.031 | 3.062 | 3.617 | 2.496 |

## Disposition and verification

The inline candidate reduces 1000-row clear from 2.989 to 2.920 ms, but creation rises from 17.984 to 19.210 ms. The shared helper changes creation from 18.948 to 18.310 ms, but clear rises from 3.031 to 3.062 ms, update from 3.236 to 3.352 ms, and removal from 3.005 to 3.126 ms. Neither supports retaining this optimization. Small differences and rank changes against controls must not be generalized.

The runtime was restored byte-for-byte to `acdbdcae1826b1b4805f36fb3a0be1d16d5d6ea2afdc9fabfdbbfedd85e7645d`. Check/build and 510 Node tests across 40 files passed in `test-runs/run-446cd760ca7b43209d8b44065ce7ceb9` (42 steps). Browser preflights passed before each candidate study: `diagnostics/run-535d3fa0313c4076acd9ddd0026ad59a` and `diagnostics/run-60aae04646dc4b1ab395ebf628242725`.

Retained changes are the two cleanup regression tests and a diagnostic cleanup-snapshot counter. The latter transforms a separate runtime copy and does not run in production or timing fixtures. No allocation-profile, cold-start or memory improvement is claimed for these rejected candidates. The previous retained performance study remains [Direct roots and exclusive teardown](DIRECT-ROOT-STUDY.md).

Reproducer: `elnor/.elnor/mvp/framework-comparison/reports/scope-disposal/producer.py`. This report records a negative result; product parity remains unproven.
