# Generic sequential task records

The private region backend now uses one task record for both general-cell dependency tracking and sequential dynamic scheduling. Each structural activation receives a new identity; disposed tickets cannot run against a later activation of the same compiled group. Fixed-dependency tasks and blueprint scheduling retain their existing protocols. Sequential frames no longer allocate a separate reaction-facade array. Native task records were already unified. Neither rejected row-domain retirement experiment is included.

## Decision and limits

Retained as architectural consolidation, not as a demonstrated global CPU speedup or statistical equivalence. The new lifecycle test confirms that the tracking object is the scheduled job, external subscriptions retire on hide, and a fresh ticket owns the next show. The code removes the separate dynamic handle/reaction facade; this is not a measured heap-allocation claim. Surface, TypeScript lowering and the public compiler/runtime are unchanged.

The full fixed matrix has ten scenarios in six equally weighted families. All family averages fit the selected 10% Svelte margin in this cohort, but seven complex phases exceed it. The practical parity goal remains active and unachieved.

| Family | Elnor/Svelte geometric CPU ratio |
| --- | ---: |
| counter | 0.909 |
| forms | 1.022 |
| composition | 0.927 |
| local | 0.956 |
| lists | 1.051 |
| lifecycle | 1.012 |

| Complex phase outside margin | Elnor ms | Svelte ms | Ratio |
| --- | ---: | ---: | ---: |
| keyed1000 / create | 33.457 | 29.984 | 1.116 |
| keyed1000 / clear | 6.188 | 4.144 | 1.493 |
| form-wide / mount | 4.960 | 4.322 | 1.148 |
| form-wide / invalid | 2.182 | 1.799 | 1.214 |
| localized-wide / mount | 12.053 | 10.844 | 1.111 |
| lifecycle / mount | 4.031 | 3.405 | 1.184 |
| lifecycle / unmount | 1.446 | 1.296 | 1.116 |

## Contemporary direct comparisons

Two independent twenty-Job controls compare accepted and candidate bundles across form96, composition24, localized240 and lifecycle32, with AA and AB/BA. Their timings are not pooled. No operation regresses above10% in both aggregate controls; that does not prove absence of regressions or equivalence. Candidate form96 edit-one is+10.7% and localized scatter is+13.8% in the confirmation and remain watch items.

| Operation | First candidate/control | Confirmation candidate/control |
| --- | ---: | ---: |
| form-wide / mount | 0.982 | 1.016 |
| form-wide / edit-one | 1.007 | 1.107 |
| form-wide / edit-all | 1.015 | 1.012 |
| form-wide / invalid | 1.037 | 1.008 |
| form-wide / recover | 1.099 | 0.960 |
| form-wide / unmount | 1.031 | 0.973 |
| composition-deep / mount | 0.995 | 0.925 |
| composition-deep / relay | 0.949 | 1.022 |
| composition-deep / unmount | 1.030 | 0.989 |
| localized-wide / mount | 1.001 | 1.021 |
| localized-wide / local-update | 0.949 | 0.994 |
| localized-wide / scatter-update | 0.813 | 1.138 |
| localized-wide / all-update | 1.082 | 0.919 |
| localized-wide / unmount | 0.926 | 1.042 |
| lifecycle / mount | 0.945 | 1.051 |
| lifecycle / edit-and-emit | 1.016 | 0.954 |
| lifecycle / hide | 0.935 | 0.849 |
| lifecycle / show | 0.957 | 0.967 |
| lifecycle / toggle-cycle | 1.054 | 0.825 |
| lifecycle / unmount | 0.956 | 0.959 |

Scatter initially improves18.7% but worsens13.8% in confirmation; lifecycle toggle initially worsens5.4% but improves17.5% in confirmation. These are not repeatable global wins. Per-order medians and AA variation remain in the sealed data.

## Validation

475 backend tests (474 existing plus the activation-identity control),71 compatibility tests,112 native browser cycles and fake/real DOM collection controls pass. The semantic capsule retains18 successful Jobs and two failed test-harness attempts (unsupported fixture syntax and a nonexistent diagnostic frame property); both were corrected without runtime changes.

The broad peer and two direct studies add99 successful Jobs,4,984 CPU samples and178 normalized DOM checks. All117 successful Jobs preserve CPU10%,768MiB aggregate commit,Node192MiB,24process cap,4GiB host-free floor, serial execution, CSP and browser sandbox. No failing attempt is hidden as a pass. The next architectural hypothesis targets linear subscriber removal and duplicate-read scans in the regional dependency graph.
