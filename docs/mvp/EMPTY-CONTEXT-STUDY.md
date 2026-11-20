# Empty state/calc contexts: private compiler experiment

**Not integrated.** Omitting unused empty context objects reduces generated code,
but the paired browser results do not justify adoption for the performance target.
Production retains the compiler/runtime validated by the 610-test gate. Parity
with Svelte remains open; this experiment does not change that ranking.

## Mechanism and structural evidence

The candidate omits a component's state or calc container only when its IR has no
corresponding bindings. Nonempty containers and the emit object remain unchanged.
Runtime sources are byte-identical between variants; no grammar, lifetime,
scheduler, DOM helper or event strategy changes. Hygiene and initialization rules
continue to be checked by the existing compiler tests.

A TypeScript AST probe checks the generated RowView and the minified browser
entry. Two empty object expressions with no identifier references become zero in
both forms. For 1,000 rendered RowView instances, this removes 2,000 object-literal
evaluations from generated code. It does **not** measure physical heap allocations,
allocated bytes or effects of engine escape analysis. The list entry shrinks from
8,050 to 8,035 raw bytes and 3,260 to 3,252 gzip bytes in these fixtures.

## Correctness and protocol

Both variants pass 87 directed tests: name hygiene, initialization parity,
caption ownership and detached keyed rows. All eight list pairs, four broad
preflight cases and sixteen broad pairs pass their behavioral controls.
The matrix includes eight cycles for each variant/workload (64 cycles total);
recorded node/listener counts return to their own unmounted baseline.
No full project gate was run for the rejected compiler and no absence-of-leaks
or exact live-heap saving is claimed.

Every timing cell below is **renderer ThreadTime milliseconds**, A → B (change),
with two warmups and seven measured rounds per action/label. A/A is retained
separately, both orders alternate isolated active pages, and unlike workloads
are not pooled. TaskDuration remains separately available in raw/summary JSON.
Accessibility is enabled; post-timing AX observations are not subtracted.

## Lists

| Rows | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| 100 | create | 9.895 → 11.853 (+19.8%) | 10.040 → 9.852 (-1.9%) | 9.806 → 9.925 (+1.2%) | 14.465 → 12.919 (-10.7%) |
| 100 | update | 2.224 → 2.371 (+6.6%) | 2.149 → 2.048 (-4.7%) | 2.093 → 2.106 (+0.6%) | 2.529 → 2.498 (-1.2%) |
| 100 | select | 1.620 → 1.696 (+4.7%) | 1.644 → 1.594 (-3.0%) | 1.529 → 1.448 (-5.3%) | 2.014 → 2.021 (+0.3%) |
| 100 | append | 2.917 → 2.838 (-2.7%) | 2.752 → 3.157 (+14.7%) | 2.838 → 2.758 (-2.8%) | 3.557 → 3.358 (-5.6%) |
| 100 | swap | 2.224 → 2.108 (-5.2%) | 2.235 → 2.121 (-5.1%) | 2.133 → 2.151 (+0.8%) | 2.603 → 2.545 (-2.2%) |
| 100 | remove | 2.409 → 2.498 (+3.7%) | 2.864 → 2.506 (-12.5%) | 2.384 → 2.295 (-3.7%) | 2.969 → 3.108 (+4.7%) |
| 100 | clear | 2.942 → 2.577 (-12.4%) | 2.735 → 2.512 (-8.2%) | 2.461 → 2.422 (-1.6%) | 3.372 → 3.039 (-9.9%) |
| 1000 | create | 103.792 → 103.888 (+0.1%) | 103.045 → 105.629 (+2.5%) | 109.918 → 110.403 (+0.4%) | 110.371 → 113.307 (+2.7%) |
| 1000 | update | 8.733 → 9.057 (+3.7%) | 9.086 → 9.037 (-0.5%) | 10.303 → 9.545 (-7.4%) | 10.646 → 10.612 (-0.3%) |
| 1000 | select | 2.868 → 2.884 (+0.6%) | 2.961 → 3.021 (+2.0%) | 3.186 → 3.534 (+10.9%) | 3.740 → 3.639 (-2.7%) |
| 1000 | append | 12.948 → 11.342 (-12.4%) | 11.909 → 12.812 (+7.6%) | 15.474 → 14.441 (-6.7%) | 16.639 → 17.141 (+3.0%) |
| 1000 | swap | 4.422 → 4.642 (+5.0%) | 4.589 → 4.855 (+5.8%) | 5.023 → 4.331 (-13.8%) | 5.272 → 5.273 (+0.0%) |
| 1000 | remove | 8.539 → 8.491 (-0.6%) | 8.941 → 9.142 (+2.2%) | 10.418 → 9.993 (-4.1%) | 11.173 → 11.028 (-1.3%) |
| 1000 | clear | 12.477 → 13.763 (+10.3%) | 13.062 → 13.330 (+2.1%) | 14.117 → 13.686 (-3.1%) | 15.340 → 14.515 (-5.4%) |

At 1,000 rows, clear is lower by 3.1%/5.4%, but creation is higher by 0.4%/2.7%.
Other operations are mixed; these medians do not demonstrate a causal speedup.

## Broader applications

| Workload | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| counter | mount | 1.108 → 1.018 (-8.1%) | 1.034 → 1.028 (-0.6%) | 1.299 → 1.372 (+5.6%) | 1.499 → 1.635 (+9.1%) |
| counter | increment | 1.131 → 0.901 (-20.3%) | 1.007 → 0.973 (-3.4%) | 1.017 → 0.964 (-5.2%) | 1.153 → 1.344 (+16.6%) |
| counter | unmount | 0.982 → 0.913 (-7.0%) | 0.910 → 0.926 (+1.8%) | 0.962 → 0.966 (+0.4%) | 1.120 → 1.110 (-0.9%) |
| form | mount | 1.653 → 1.999 (+20.9%) | 2.051 → 2.202 (+7.4%) | 1.982 → 2.213 (+11.7%) | 1.988 → 1.736 (-12.7%) |
| form | edit-one | 1.960 → 2.051 (+4.6%) | 2.082 → 2.247 (+7.9%) | 2.087 → 2.214 (+6.1%) | 1.776 → 1.839 (+3.5%) |
| form | edit-all | 2.196 → 2.226 (+1.4%) | 2.187 → 2.304 (+5.3%) | 2.360 → 2.267 (-3.9%) | 1.908 → 1.983 (+3.9%) |
| form | invalid | 2.100 → 2.129 (+1.4%) | 2.184 → 2.242 (+2.7%) | 1.997 → 2.497 (+25.0%) | 1.872 → 2.025 (+8.2%) |
| form | recover | 1.715 → 1.664 (-3.0%) | 1.942 → 1.999 (+2.9%) | 1.765 → 1.824 (+3.3%) | 1.635 → 1.569 (-4.0%) |
| form | unmount | 1.138 → 1.137 (-0.1%) | 1.296 → 1.441 (+11.2%) | 1.221 → 1.235 (+1.1%) | 1.091 → 1.015 (-7.0%) |
| composition | mount | 1.510 → 1.592 (+5.4%) | 1.355 → 1.372 (+1.3%) | 1.407 → 1.596 (+13.4%) | 1.489 → 1.515 (+1.7%) |
| composition | relay | 1.419 → 1.246 (-12.2%) | 1.197 → 1.340 (+11.9%) | 1.320 → 1.344 (+1.8%) | 1.249 → 1.328 (+6.3%) |
| composition | unmount | 1.073 → 1.071 (-0.2%) | 0.983 → 0.990 (+0.7%) | 1.060 → 1.039 (-2.0%) | 1.079 → 1.037 (-3.9%) |
| localized | mount | 2.466 → 2.356 (-4.5%) | 2.585 → 2.470 (-4.4%) | 2.510 → 2.249 (-10.4%) | 2.657 → 3.142 (+18.3%) |
| localized | local-update | 1.342 → 1.222 (-8.9%) | 1.266 → 1.364 (+7.7%) | 1.410 → 1.417 (+0.5%) | 1.605 → 1.767 (+10.1%) |
| localized | unmount | 1.178 → 1.203 (+2.1%) | 1.257 → 1.273 (+1.3%) | 1.270 → 1.242 (-2.2%) | 1.579 → 1.526 (-3.4%) |

Several observed broad deltas are higher in both orders: counter mount
+5.6%/+9.1%, form invalid +25.0%/+8.2%, composition mount +13.4%/+1.7% and relay
+1.8%/+6.3%. Other actions improve or change sign. A/A variation and the small
sample count limit attribution; this is not proof that deleting an empty literal
causes every observed increase. There is insufficient performance evidence to
accept the change for the current goal. The candidate stays private rather than
trading a possible list benefit for unresolved broader results.

## Retained failures and provenance

The relocated list builder initially retained a relative server import and
failed before building. A new producer revision resolves it to the original
server module and reuses the eight already passed directed phases. Later the
runtime-only summary reader rejected differing compiler hashes. The compiler
experiment's reader replaces that equality assumption with the exact predeclared
baseline/candidate compiler hashes and the exact equal runtime hash. All other
checks remain identical, including assets, versions, ordering, schemas, samples,
visibility, clock validity, AX observations and cleanup. Both failures are
retained, not relabeled as successful runs or deleted.

The complete retained cohort has 43 serial supervised phases: 41 pass and those
two fail. All verify the original limits: CPU 10%, commit 768 MiB, 24 processes,
host free >=4 GiB, kill-on-owner-close, browser 45/12 seconds and Node 60/60 seconds,
with zero remaining owned processes. No limit was relaxed. Core sources remain
unchanged, and the prior 610-test public gate remains its own evidence.

Baseline compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

Candidate compiler: `70ae278c4c34f4a27b2c96250b5f2f85e86aef0bf19112e9e3079dbff86e1614`

Shared runtime: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`

Internal evidence root: `empty-context-study`; the exact reviewed report,
AST proof, reader revisions, all phase hashes and fixture identities are retained
in `verification.json`. The earlier compact-reaction experiment is separate.
