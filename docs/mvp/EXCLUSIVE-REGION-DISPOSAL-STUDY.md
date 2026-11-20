# Exclusive-region disposal: accepted bounded optimization

The full-unmount optimization is integrated. The exact measured candidate passes
610 tests plus check/build (54 serial phases). The compiler is unchanged.

## Behavior and scope

Disposal reuses Elnor's existing canClearRegion eligibility: exclusive ownership,
exact roots and anchor with no extra siblings, native-only row cleanup, no in-flight
part and no active bulk detach. Otherwise ordinary reset remains in use. Only
outer roots are removed collectively; nested conditionals and regions still clean
their descendants normally, preserving retained row subtree contents. Failure
attempts ordinary cleanup and anchor removal. Combined failures preserve their
ordered causes, including a thrown undefined value. No public API or grammar changes.

This is Elnor's own reuse of an existing region primitive. Svelte's ancestor-removal
mechanism supplied a contrast; Elnor retains its own eligibility and cleanup model.

## List measurements

Renderer main-thread CPU (ThreadTime), milliseconds: A → B (change).
A/A uses the candidate on both labels; change compares the previous 600-test
runtime with the accepted candidate. Each pair uses two warmups, seven measured
rounds and alternating isolated pages, with both AB and BA orders. Edge
157.0.4341.42 runs headless, sandboxed, GPU disabled and accessibility enabled.
Full unmount calls the existing driver disposer and awaits two frames without a
final height read; remount is outside timing. Post-timing accessibility traces
are retained and are not subtracted from measurements.

| Rows | Action | A/A AB | A/A BA | Change AB | Change BA |
| --- | --- | --- | --- | --- | --- |
| 100 | create | 3.996 → 3.979 (-0.4%) | 3.775 → 3.651 (-3.3%) | 3.599 → 3.365 (-6.5%) | 3.348 → 3.392 (+1.3%) |
| 100 | update | 1.642 → 1.641 (-0.1%) | 1.353 → 1.536 (+13.5%) | 1.384 → 1.446 (+4.5%) | 1.322 → 1.345 (+1.7%) |
| 100 | select | 1.252 → 1.272 (+1.6%) | 1.261 → 1.321 (+4.8%) | 1.142 → 1.159 (+1.5%) | 1.166 → 1.198 (+2.7%) |
| 100 | append | 2.134 → 1.806 (-15.4%) | 1.697 → 1.654 (-2.5%) | 1.854 → 1.553 (-16.2%) | 1.656 → 1.616 (-2.4%) |
| 100 | swap | 1.660 → 1.609 (-3.1%) | 1.608 → 1.460 (-9.2%) | 1.381 → 1.375 (-0.4%) | 1.351 → 1.454 (+7.6%) |
| 100 | remove | 1.808 → 1.919 (+6.1%) | 1.603 → 1.677 (+4.6%) | 1.652 → 1.548 (-6.3%) | 1.515 → 1.570 (+3.6%) |
| 100 | clear | 1.608 → 1.559 (-3.0%) | 1.311 → 1.340 (+2.2%) | 1.168 → 1.165 (-0.3%) | 1.317 → 1.330 (+1.0%) |
| 100 | unmount | 1.431 → 1.288 (-10.0%) | 1.136 → 1.141 (+0.4%) | 1.226 → 1.110 (-9.5%) | 1.517 → 1.157 (-23.7%) |
| 1000 | create | 21.388 → 24.872 (+16.3%) | 23.341 → 22.511 (-3.6%) | 25.009 → 21.852 (-12.6%) | 22.670 → 24.044 (+6.1%) |
| 1000 | update | 4.111 → 4.198 (+2.1%) | 3.799 → 3.781 (-0.5%) | 3.455 → 3.425 (-0.9%) | 3.672 → 3.538 (-3.6%) |
| 1000 | select | 2.346 → 2.221 (-5.3%) | 2.073 → 2.190 (+5.6%) | 2.329 → 1.989 (-14.6%) | 2.336 → 2.051 (-12.2%) |
| 1000 | append | 4.358 → 4.466 (+2.5%) | 4.515 → 4.620 (+2.3%) | 4.253 → 4.200 (-1.2%) | 4.219 → 4.950 (+17.3%) |
| 1000 | swap | 2.894 → 2.783 (-3.8%) | 2.635 → 2.579 (-2.1%) | 2.594 → 2.943 (+13.5%) | 2.600 → 2.651 (+2.0%) |
| 1000 | remove | 3.689 → 3.621 (-1.8%) | 3.413 → 3.537 (+3.6%) | 3.219 → 3.336 (+3.6%) | 3.711 → 3.779 (+1.8%) |
| 1000 | clear | 3.907 → 3.553 (-9.1%) | 3.757 → 3.166 (-15.7%) | 3.591 → 4.110 (+14.5%) | 3.806 → 3.769 (-1.0%) |
| 1000 | unmount | 3.572 → 3.230 (-9.6%) | 3.197 → 3.232 (+1.1%) | 4.612 → 3.144 (-31.8%) | 4.631 → 3.555 (-23.2%) |

At 1,000 rows, full unmount falls from 4.612 to 3.144 ms in AB and from
4.631 to 3.555 ms in BA (31.8% and 23.2% lower CPU). The 100-row reduction is
9.5% and 23.7%. Other actions vary in both directions; for example, 1,000-row
append rises 17.3% in BA and clear rises 14.5% in AB. A/A noise is retained.
These are scoped descriptive observations, not wall-clock latency, a global
speedup, or a refreshed React/Svelte ranking.

## Broader matrix

Same CPU units and separate pair columns; unlike workloads are not pooled.

| Workload | Action | A/A AB | A/A BA | Change AB | Change BA |
| --- | --- | --- | --- | --- | --- |
| counter | mount | 0.944 → 0.928 (-1.7%) | 0.969 → 0.963 (-0.6%) | 1.069 → 0.946 (-11.5%) | 0.923 → 0.950 (+2.9%) |
| counter | increment | 0.874 → 0.850 (-2.7%) | 0.848 → 0.843 (-0.6%) | 0.912 → 0.892 (-2.2%) | 0.818 → 0.820 (+0.2%) |
| counter | unmount | 0.857 → 0.801 (-6.5%) | 0.787 → 0.832 (+5.7%) | 0.857 → 0.867 (+1.2%) | 0.825 → 0.835 (+1.2%) |
| form | mount | 1.237 → 1.182 (-4.4%) | 1.185 → 1.202 (+1.4%) | 1.226 → 1.204 (-1.8%) | 1.233 → 1.231 (-0.2%) |
| form | edit-one | 1.038 → 1.094 (+5.4%) | 1.063 → 1.143 (+7.5%) | 1.059 → 1.174 (+10.9%) | 1.222 → 1.262 (+3.3%) |
| form | edit-all | 1.174 → 1.138 (-3.1%) | 1.126 → 1.069 (-5.1%) | 1.181 → 1.184 (+0.3%) | 1.195 → 1.186 (-0.8%) |
| form | invalid | 1.077 → 1.121 (+4.1%) | 1.028 → 1.136 (+10.5%) | 1.091 → 1.066 (-2.3%) | 1.224 → 1.106 (-9.6%) |
| form | recover | 1.058 → 1.146 (+8.3%) | 1.158 → 1.154 (-0.3%) | 1.082 → 1.177 (+8.8%) | 1.122 → 1.131 (+0.8%) |
| form | unmount | 0.835 → 0.839 (+0.5%) | 0.879 → 0.837 (-4.8%) | 0.907 → 0.863 (-4.9%) | 0.874 → 0.874 (-0.0%) |
| composition | mount | 1.066 → 1.056 (-0.9%) | 1.086 → 1.151 (+6.0%) | 1.118 → 1.185 (+6.0%) | 1.113 → 1.036 (-6.9%) |
| composition | relay | 0.884 → 0.822 (-7.0%) | 0.886 → 0.887 (+0.1%) | 0.930 → 0.920 (-1.1%) | 0.934 → 0.894 (-4.3%) |
| composition | unmount | 0.871 → 0.791 (-9.2%) | 0.864 → 0.842 (-2.5%) | 0.867 → 0.778 (-10.3%) | 0.778 → 0.814 (+4.6%) |
| localized | mount | 1.903 → 1.782 (-6.4%) | 1.809 → 1.966 (+8.7%) | 1.933 → 1.805 (-6.6%) | 1.877 → 1.992 (+6.1%) |
| localized | local-update | 1.037 → 1.058 (+2.0%) | 1.069 → 1.078 (+0.8%) | 1.034 → 1.022 (-1.2%) | 1.025 → 1.094 (+6.7%) |
| localized | unmount | 0.905 → 0.915 (+1.1%) | 0.895 → 0.959 (+7.2%) | 0.928 → 0.898 (-3.2%) | 0.915 → 0.914 (-0.1%) |

All four workloads pass preflight and all sixteen paired browser cases pass.
The four generated workload bundles have equal canonical ASTs after normalizing
local symbols and fixture diagnostic paths; raw bytes differ. This supports a
source-level scope check, not a statistical claim of CPU neutrality. Forms and
localized updates still have mixed observed deltas.

## Correctness, lifecycle and resource controls

Ten public disposal regression tests first yield four passes and six expected
failures on the prior runtime, then ten passes on the candidate. The complete
gate passes 610 tests plus check/build. Directed coverage includes retained
subtrees, effects/listeners, foreign callback order, unowned siblings,
nonexclusive regions, cancellation and ordered cleanup/DOM failures.

The real 1,000-row fixture passes 32 lifecycle cycles across two variants and
both orders. A physically inspected held row listener changes from one to zero;
after releasing inspection references and forcing GC, nodes, documents and
listener counts return to each variant's own unmounted baseline. These checks
do not establish allocated-byte savings or universal absence of leaks.

The accepted cohort contains 91 serial supervised phases: 90 pass and one is the
expected red regression run. All verify CPU 10%, commit 768 MiB, 24 processes,
at least 4 GiB host free memory, kill-on-owner-close and zero remaining owned
processes. Browser limits remain 45 seconds / 12 seconds idle; Node limits
remain 60 / 60. Earlier incomplete/failed experiments remain separate, unchanged.

## Reproducibility

Production runtime: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`

Previous runtime: `6a3c38d100373c9c226753697f8e54234969bc66083593133485a7b41f1f8cd3`

Compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

- List cohort: `benchmark-73883daa71044a1dbd750d2eb6e24521`
- Matrix cohort: `matrix-current-17080bab5c3e40d4b308c3ed46096039`
- Lifecycle: `lifecycle-0b44964cdfbf47caac1de9d70613eaf9`
- Canonical inspection: `canonical-b2b58b36d63441fd94d35384bbd6d001`
- Complete gate: `run-64ebe490e7da47bf8240e87669db3d16`

Frozen fixtures: `run-1WjRzY`, `run-Ymymmq`, `matrix-BtJrx2`, `matrix-EKh9dX`.

The internal review retains exact report revisions, source identities, fixture
manifest hashes and all supervisor hashes in adoption-verification.json.
