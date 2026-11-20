# Range clear evaluation

**Investigated: 2026-11-12.** The production runtime/compiler remain
byte-identical to `run-RuBGXZ`. This experiment changes an isolated copy
only, built as `run-0NMQxg`. No new runtime optimization is accepted by
this report.

## Profile and hypothesis

Profile `diagnostics/run-a292f05c07ff4bada994260da633978e` retains 49 verified profiles: seven per operation,
after two warmup rounds, at 1000 rows. The seven clear windows contain
1662 samples: 1504 idle, 52 program,
72 replaceChildren and 21 removeEventListener.
These are perturbed sampling observations, not precise CPU percentages.

The candidate keeps cleanup and exclusive-region guards, but creates a
temporary Range spanning the container start up to the marker and calls
deleteContents. The marker stays attached. If the marker is no longer the
last child, it falls back to replaceChildren. No Range is cached by the
runtime. This differs from the earlier rejected textContent/reinsert and
callback-loop candidates.

API semantics were checked against the primary
[DOM Standard](https://dom.spec.whatwg.org/#dom-range-deletecontents).
The standard specifies the operation, not its performance in this workload.

## Native behavior and cost

Preflight `diagnostics/run-1b022d23440a472e9f5291d679c96043` passes 42 workload checks across three frameworks
and both sizes. The separate native browser fixture passes ten cases for
each implementation: ordinary/detached rows, marker relocation, foreign
siblings, user cleanup observation and a native deletion that throws after
performing its DOM work. It checks old listeners/subscriptions are gone,
container/marker identity, refill and owner disposal.

| Mode | Detached | Baseline records | Candidate records | Baseline removed/added | Candidate removed/added |
|---|---|---:|---:|---|---|
| normal | False | 1 | 3 | 4/1 | 3/0 |
| moved-anchor | False | 1 | 1 | 4/1 | 4/1 |
| foreign | False | 3 | 3 | 3/0 | 3/0 |
| user-cleanup | False | 3 | 3 | 3/0 | 3/0 |
| native-error | False | 1 | 3 | 4/1 | 3/0 |
| normal | True | 1 | 3 | 4/1 | 3/0 |
| moved-anchor | True | 1 | 1 | 4/1 | 4/1 |
| foreign | True | 3 | 3 | 3/0 | 3/0 |
| user-cleanup | True | 3 | 3 | 3/0 | 3/0 |
| native-error | True | 1 | 3 | 4/1 | 3/0 |

These mutation observations use three rows. The normal Range case emits
one removal record per row instead of one collective replacement record.
Keeping the marker attached therefore does not imply less observable work.

## Timing protocol and retained failures

The declared cohort has eight pairs: identical-candidate A/A and
baseline/candidate, at 100 and 1000 rows, with both initial AB/BA orders.
Each variant has two warmup rounds and seven measured rounds per action.
Active isolated pages alternate per action. Every pair owns its headless,
sandboxed Edge process; GPU remains disabled.

First cohort `interleaved-studies/run-bb072136f27041f491915ebb68cda5e7` stopped after six passing pairs when the seventh
reached the 45-second wall deadline. It has no final result for that pair
and no valid complete-cohort summary. Progress also shows a long baseline
creation interval; no cause of the delay is established. The failed pair
is retained, not counted as passing or replaced inside that cohort.

Exactly one complete-cohort retry was started as `interleaved-studies/run-4651765b32bb46a8a4b88e59eda55c89` with identical
limits and workloads. No tolerance, timeout or coverage was weakened.

The retry completes all eight pairs and 784 measured action samples.
The existing summary validator checks raw assets/collectors, versions,
identity/schema, order, clocks, sample counts and cleanup. CPU values
below are seven-sample renderer TaskDuration medians in ms using
threadTicks; positive B/A delta means the candidate uses more CPU.

For 1000-row clear, AB changes 12.049 to 12.015 ms
(-0.28%), while BA changes 12.052 to 12.225 ms
(+1.44%). This is mixed and small. At 100 rows both
orders use more candidate CPU (+12.51% / +3.87%).
A/A action differences span -13.17% to +15.62%. These observations
do not establish a repeatable benefit. The Range candidate is rejected:
there is no demonstrated gain to justify the larger bundle and extra
mutation records. No universal slowdown percentage is inferred.

### A/A: identical range candidate

| Rows | Action | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 7.976 | 8.610 | +7.95% | 8.307 | 8.435 | +1.54% |
| 100 | update | 1.840 | 1.922 | +4.46% | 1.734 | 1.874 | +8.07% |
| 100 | select | 1.318 | 1.346 | +2.12% | 1.258 | 1.361 | +8.19% |
| 100 | append | 2.651 | 2.506 | -5.47% | 2.331 | 2.588 | +11.03% |
| 100 | swap | 1.804 | 1.839 | +1.94% | 2.027 | 1.760 | -13.17% |
| 100 | remove | 2.103 | 2.067 | -1.71% | 2.030 | 2.347 | +15.62% |
| 100 | clear | 2.273 | 2.467 | +8.53% | 2.164 | 2.159 | -0.23% |
| 1000 | create | 100.844 | 103.340 | +2.48% | 102.212 | 97.369 | -4.74% |
| 1000 | update | 8.509 | 7.874 | -7.46% | 8.031 | 7.889 | -1.77% |
| 1000 | select | 2.472 | 2.417 | -2.22% | 2.541 | 2.639 | +3.86% |
| 1000 | append | 10.650 | 11.211 | +5.27% | 10.598 | 10.829 | +2.18% |
| 1000 | swap | 3.782 | 3.908 | +3.33% | 4.070 | 3.735 | -8.23% |
| 1000 | remove | 7.144 | 7.511 | +5.14% | 7.902 | 7.665 | -3.00% |
| 1000 | clear | 11.967 | 12.409 | +3.69% | 12.407 | 12.804 | +3.20% |

### Baseline A versus range candidate B

| Rows | Action | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | create | 8.974 | 9.169 | +2.17% | 8.807 | 8.591 | -2.45% |
| 100 | update | 1.901 | 1.920 | +1.00% | 1.757 | 1.825 | +3.87% |
| 100 | select | 1.351 | 1.449 | +7.25% | 1.340 | 1.281 | -4.40% |
| 100 | append | 2.452 | 2.665 | +8.69% | 2.537 | 2.471 | -2.60% |
| 100 | swap | 1.915 | 1.821 | -4.91% | 1.766 | 1.820 | +3.06% |
| 100 | remove | 2.190 | 2.180 | -0.46% | 2.050 | 2.376 | +15.90% |
| 100 | clear | 2.215 | 2.492 | +12.51% | 2.274 | 2.362 | +3.87% |
| 1000 | create | 100.762 | 104.036 | +3.25% | 94.406 | 100.969 | +6.95% |
| 1000 | update | 8.056 | 8.113 | +0.71% | 8.228 | 8.523 | +3.59% |
| 1000 | select | 2.422 | 2.600 | +7.35% | 2.667 | 2.514 | -5.74% |
| 1000 | append | 9.956 | 10.399 | +4.45% | 11.177 | 10.979 | -1.77% |
| 1000 | swap | 3.815 | 3.794 | -0.55% | 3.815 | 3.894 | +2.07% |
| 1000 | remove | 7.274 | 7.335 | +0.84% | 7.780 | 7.220 | -7.20% |
| 1000 | clear | 12.049 | 12.015 | -0.28% | 12.052 | 12.225 | +1.44% |

## Disposition and provenance

Keep the validated core unchanged. The experiment must demonstrate a
repeatable benefit that justifies its extra native operation/Range object
and changed mutation record behavior before adoption. No product parity,
cold-start, memory reduction or overall CPU speedup is inferred.

| Entry | Raw bytes | Gzip bytes | Brotli bytes |
|---|---:|---:|---:|
| run-RuBGXZ | 7156 | 3003 | 2708 |
| run-0NMQxg | 7270 | 3061 | 2752 |

All heavy phases retain CPU 10%, 768 MiB job commit, 24 processes,
45-second wall/12-second progress deadlines, the host free-memory guard
and owned-tree cleanup. Every completed or terminated phase checked here
reports zero remaining owned processes. Other projects are not terminated.

The first browser harness attempt used the emptied staging fragment to
observe user cleanup instead of the mounted node and failed on the
unchanged baseline (`test-runs/range-clear-browser-before-6acb5e366e9d441d8be65fd0425af86d`). Its frozen case and failing
result remain retained. The corrected identical fixture passes on both
implementations. An initial prepare assertion also exposed newline
normalization before producing the candidate; byte-preserving I/O fixed
that setup error without changing the core.

No public source/test implementation is changed; the previous 550-test
[functional closure](CORE-READINESS.md) remains the core gate. It is not
presented as a newly executed full suite. The
[current framework comparison](CURRENT-CORE-COMPARISON.md) still describes
the active core; this experiment has no fresh React/Svelte timing controls.

All identifiers are relative to `elnor/.elnor/mvp/framework-comparison/`.
Reproducer: `reports/range-clear/producer.py`; candidate generator:
`prepare.py` (refuses overwrite); native fixture: `browser-case.mjs` and
`browser-worker.mjs`. Use the existing contained runners for fresh heavy
runs. The report producer only reads retained evidence.
