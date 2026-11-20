# Frame layout experiment: rejected after full comparison

The private compiler/runtime experiment moved frame ownership discovery from
each mount into generated plan metadata. It passed semantic validation but did
not demonstrate a useful CPU improvement and increased delivery size. The
working compiler/runtime were restored to the preceding sealed frame-task
candidate. The experiment remains in its frozen study snapshot.

Before this experiment, an ablation compared the previous event backend, the
frame-local task candidate, and a variant restoring dense dependency arrays
while retaining local task tickets. All three preserved DOM, values and keyed
identity. In that cohort the lazy candidate's 1,000-row swap consumed 1.7% less
CPU than the old event backend; the dense variant consumed 4.0% more, with large
AA variation. Dense arrays also failed to retain a creation advantage. This
does not establish the cause of the earlier swap regression or prove a fix.

The subsequent layout experiment retained per-instance state, reactions and
handlers, sharing only numeric slot/task identifiers through a generated plan.
Manual plans kept their previous discovery path. A new behavioral test mounts
two keyed trees from the same module, disposes one, and continues selecting,
reordering, clearing and resetting the other. That test remains in the suite.

The complete candidate/control study uses all six original workloads and all
29 actions, with two warmups, seven measured rounds, both initial orders and AA
controls. Values below are balanced renderer CPU medians in milliseconds from
one cohort; they must not be compared as a causal before/after result with
absolute times from earlier cohorts.

| Operation | Layout experiment | Previous frame-task candidate | Change |
| --- | ---: | ---: | ---: |
| Counter increment | 0.965 | 0.940 | +2.7% |
| Form edit all | 1.283 | 1.258 | +2.0% |
| Composition relay | 0.956 | 0.914 | +4.5% |
| Localized update | 1.062 | 1.110 | -4.4% |
| Create 100 | 5.129 | 5.103 | +0.5% |
| Create 1,000 | 35.874 | 36.201 | -0.9% |
| Select 1,000 | 3.093 | 2.744 | +12.7% |
| Swap 1,000 | 3.593 | 3.820 | -5.9% |
| Clear 1,000 | 7.285 | 7.310 | -0.4% |

Results are mixed, with important AA variation: swap AA changes are roughly
-10.0% and +16.7%. There is no significance test or established parity margin.
No global speedup, swap fix or fresh React/Svelte timing follows from this study.

Delivery also worsens. Application-entry gzip-9 bytes, excluding shared CSS and
driver, are:

| Workload | Layout experiment | Previous candidate |
| --- | ---: | ---: |
| Counter | 3,131 | 3,091 |
| Form | 6,801 | 6,389 |
| Composition | 2,734 | 2,334 |
| Localized | 5,163 | 5,113 |
| Keyed | 9,748 | 9,340 |

Validation passed 449 backend tests and 71 unchanged public compatibility tests.
The restored candidate also passed all 22 focused component-event tests,
including the new independent-mount test. Its four core source hashes match the
preceding reviewed candidate exactly. Public core sources remain unchanged.

The ablation retained 1,176 measured samples and 42 correctness checks in 15
Jobs. The layout comparison retained 1,624 samples and 58 checks in 35 Jobs.
Together with the offline suites and restored-candidate checks, all 55 Jobs ran
serially with verified original limits and zero remaining owned processes:
CPU 10%, aggregate commit 768 MiB, maximum 24 processes, host-free floor 4 GiB,
Node heap 192 MiB, offline wall/idle 60/60 seconds and browser 45/12 seconds.
Headless Edge, sandbox, CSP and GPU-disabled isolation remained intact.

Internal evidence:

- Ablation: `region-backend/frame-ablation-ed835df54c6b4ac4b9712870ca585835`.
- Layout experiment: `frame-layout-study/run-69caf5499cb6436d9a9358e7e94240eb`.
- Restored checks: `region-backend/component-events-231d90386fb84e08b3be42be6bd2ed28`.

The local Svelte keyed reconciler was inspected as a contrast for incremental
branch reuse. The experiments retain Elnor's own ownership model. They point
toward investigating the larger per-row lifecycle structure rather than adding
more plan metadata without a demonstrated runtime benefit.
