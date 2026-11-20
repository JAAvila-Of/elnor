# Broad parity baseline

The person selected a practical CPU margin of at most 10% above Svelte per scenario, preserving correctness and DX. The fixed matrix has ten scenarios in six equally weighted families, including five designated complex scenarios: keyed1000, a 96-field form, 24-level composition with slots, 240 localized panels, and 32 conditional stateful components. Original small fixtures and keyed100 remain included.

A family aggregate averages normalized scenario/action ratios with geometric means and equal family weights. Aggregates do not hide individual complex phases: the operational acceptance gate also requires every measured phase of each complex scenario within1.10, independently confirmed before claiming practical parity. This is a conservative working gate, not a statistical equivalence test.

All nine builds and ten two-framework preflights pass. The baseline has 59 serial bounded Jobs, 2,744 samples and 98 correctness checks. All six family aggregate ratios happen to fit the margin in this cohort; six individual complex phases do not. The goal remains active and unachieved.

| Scenario | Family | Complex | Geometric CPU ratio | Actions within margin |
| --- | --- | --- | ---: | ---: |
| counter | counter | False | 1.002 | 3/3 |
| form | forms | False | 1.001 | 6/6 |
| composition | composition | False | 0.932 | 3/3 |
| localized | local | False | 0.986 | 3/3 |
| keyed100 | lists | False | 1.002 | 7/7 |
| keyed1000 | lists | True | 1.051 | 6/7 |
| form-wide | forms | True | 1.078 | 3/6 |
| composition-deep | composition | True | 0.944 | 3/3 |
| localized-wide | local | True | 0.978 | 4/5 |
| lifecycle | lifecycle | True | 1.049 | 5/6 |

## Complex phases still above the margin

| Scenario | Action | Elnor CPU ms | Svelte CPU ms | Ratio |
| --- | --- | ---: | ---: | ---: |
| keyed1000 | clear | 6.594 | 4.574 | 1.442 |
| form-wide | mount | 4.646 | 4.046 | 1.148 |
| form-wide | edit-one | 2.987 | 2.707 | 1.103 |
| form-wide | unmount | 1.365 | 1.201 | 1.137 |
| localized-wide | scatter-update | 3.343 | 3.001 | 1.114 |
| lifecycle | toggle-cycle | 5.326 | 4.602 | 1.157 |

Per-order samples, AA variation, script metrics and normalized DOM checks remain in the analysis and raw results. Many small differences are within AA variation. No cross-cohort timing is pooled, no majority/parity conclusion is final, and public compiler/runtime sources remain unchanged. CPU10%,768MiB aggregate commit,Node192MiB,24process maximum,4GiB host-free floor and original timeouts/sandbox/CSP remain in place.
