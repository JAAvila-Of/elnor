# Internal prop readers: private experiment and confirmation

**Not integrated.** A compile-time reader path removes repeated prop adaptation
in selected generated children, but the initial creation improvement does not
reproduce in both orders of the declared confirmation. Other workloads remain
mixed. Production keeps the compiler/runtime validated by the 610-test gate;
no Svelte parity, global speedup or regression-free result is established.

## Mechanisms and compatibility

The runtime-mode revision gives generated render bodies a mode argument and a
shared prop-read helper. Native internal calls use readers directly only when
every declared prop is present; otherwise the complete legacy adapter is used.
Public entry signatures and runtime helpers retain ordinary property access.
This removes entries/defineProperty calls but adds presence checks, mode decisions
and helper calls. Its timing cohort is separate from the later revision.

The compile-time revision keeps the runtime byte-identical to production. The
compiler emits an internal reader module for eligible components. A call selects
that module only when the graph knows all declared props are supplied. Otherwise
it uses the original public component/helper path. Internal bodies call the
existing reader functions directly: no per-read helper, mode flag or hasOwn
check. Public generate/mount/renderOwned and the existing runtime adapters retain
their contracts. The extra internal modules are a code-generation/startup cost
that has not been accepted or benchmarked as a DX improvement.

Eligibility uses TypeScript symbols, excludes components where a prop occurs in
a call/new/tag callee, and conservatively excludes this/arguments/eval uses.
The special __proto__ prop also stays on the old path. This protects function
receivers, rendering-context observations and legacy object-prototype behavior.
Optional omitted props use the original adapter, preserving inherited reads and
readonly enumerable descriptors where observable. Bindings, keyed ownership,
listener cleanup, scheduling, grammar and native DOM behavior are not redesigned.

Svelte 5.57.3 at local commit 0156c5fe38b53b72675e2a7f04535de015fdeed1 supplied a
read-only reference through its prop getter/setter modes in reactivity/props.js.
Elnor does not adopt Svelte's flags, proxy, fallback/default or binding contracts.
This experiment tests Elnor's own internal calling convention. Unlike the earlier
direct-getter specialization, it removes the adapter rather than reinstalling
the same getters with different generated code.

## Correctness and work controls

The runtime-mode revision passes 11 new and 87 existing cases per variant (98).
The final compile-time revision passes 12 new and 87 existing cases per variant
(99). Controls cover read counts, live subscriptions, cancellation, queued updates,
foreign/public owners, callable-prop receivers with parentheses/type assertions,
public entry getters and arity, cleanup on thrown reads, shadowing, inherited
missing properties, special prototype keys and five-argument initialization.

A controlled count probe mounts 1,000 generated children, checks DOM count, child
event delivery and detached listener cleanup. It observes the following method
calls during mount. These are operation counts, not allocated bytes or CPU time;
the counter wrappers are absent from every normal timing run.

| Revision | entries calls | defineProperty calls | hasOwn calls |
| --- | --- | --- | --- |
| Baseline | 1000 | 1000 | 0 |
| Runtime-mode candidate | 0 | 0 | 1000 |
| Compile-time candidate | 0 | 0 | 0 |

The rejected variants did not run a complete project gate. The unchanged public
610-test gate remains its own evidence and was not rerun here.

## Retained failures and revisions

The first fixture revision used unsupported inline empty component blocks; both
variants failed before exercising the mechanism. The fixture was corrected to
the existing multiline grammar, with its prior bytes retained. Then the baseline
passed 11/11 while the first reader candidate failed 2/11: omitted optional props
and inherited missing props. The runtime-mode revision fixed that with complete
adapter fallback. The first compile-time design passed those 11 controls but a
new __proto__ case failed; that exact revision is retained, and the final selector
excludes the special key. The baseline and final candidate both pass 12/12.
No failing test or resource limit was removed to create a passing verdict.

## Normal browser timing and one declared repeat

Each cohort retains all seven list actions at 100/1,000 rows, four application
families, A/A controls and AB/BA seeds. There are two warmups and seven measured
rounds per action/label, alternating isolated visible pages. Every table uses
renderer **ThreadTime milliseconds**, baseline → candidate (relative change).
Legacy TaskDuration summaries remain separate; accessibility stays enabled and
post-timing AX traces are never subtracted.

The compile-time initial cohort showed 1,000-row create reductions of 4.2%/6.4%,
but swap increases of 13.7%/6.2% and mixed other results. Before inspecting further
samples, one repeat of both paired families was declared using the exact same
frozen fixtures, source hashes, actions, counts, controls and limits. It is not a
replacement cohort, an average with the first result or a search for a favorable
run. All three cohorts below remain separate.

## Runtime-mode revision

Evidence: `trial-b41066221f134aec807a88e4e1841115`.

| Rows | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| 100 | create | 9.179 → 9.096 (-0.9%) | 8.519 → 9.005 (+5.7%) | 8.825 → 8.733 (-1.0%) | 8.273 → 8.761 (+5.9%) |
| 100 | update | 1.977 → 2.020 (+2.2%) | 1.885 → 2.019 (+7.1%) | 1.911 → 2.000 (+4.7%) | 1.977 → 1.926 (-2.6%) |
| 100 | select | 1.468 → 1.614 (+9.9%) | 1.366 → 1.403 (+2.7%) | 1.478 → 1.384 (-6.4%) | 1.493 → 1.405 (-5.9%) |
| 100 | append | 2.543 → 2.582 (+1.5%) | 2.494 → 2.408 (-3.4%) | 2.490 → 2.461 (-1.2%) | 2.877 → 2.407 (-16.3%) |
| 100 | swap | 2.014 → 1.983 (-1.5%) | 1.907 → 1.886 (-1.1%) | 1.834 → 1.931 (+5.3%) | 1.818 → 1.851 (+1.8%) |
| 100 | remove | 2.206 → 2.203 (-0.1%) | 2.065 → 2.278 (+10.3%) | 2.190 → 2.233 (+2.0%) | 2.131 → 2.074 (-2.7%) |
| 100 | clear | 2.419 → 2.367 (-2.1%) | 2.282 → 2.291 (+0.4%) | 2.250 → 2.413 (+7.2%) | 2.369 → 2.408 (+1.6%) |
| 1000 | create | 104.362 → 99.052 (-5.1%) | 100.737 → 99.421 (-1.3%) | 101.803 → 104.715 (+2.9%) | 101.549 → 101.266 (-0.3%) |
| 1000 | update | 8.248 → 8.020 (-2.8%) | 8.686 → 8.740 (+0.6%) | 8.765 → 8.839 (+0.8%) | 8.900 → 8.831 (-0.8%) |
| 1000 | select | 2.975 → 2.622 (-11.9%) | 2.550 → 2.722 (+6.7%) | 2.624 → 2.971 (+13.2%) | 2.683 → 2.877 (+7.2%) |
| 1000 | append | 11.570 → 10.047 (-13.2%) | 10.329 → 11.400 (+10.4%) | 11.404 → 11.458 (+0.5%) | 10.969 → 12.181 (+11.0%) |
| 1000 | swap | 4.021 → 3.735 (-7.1%) | 3.690 → 3.810 (+3.3%) | 4.120 → 4.571 (+10.9%) | 4.239 → 4.291 (+1.2%) |
| 1000 | remove | 8.312 → 7.466 (-10.2%) | 7.219 → 7.343 (+1.7%) | 7.264 → 7.399 (+1.9%) | 7.557 → 7.913 (+4.7%) |
| 1000 | clear | 12.585 → 13.250 (+5.3%) | 11.815 → 11.925 (+0.9%) | 12.823 → 14.216 (+10.9%) | 13.006 → 12.308 (-5.4%) |

| Workload | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| counter | mount | 1.114 → 0.954 (-14.4%) | 0.976 → 1.014 (+3.9%) | 0.994 → 0.977 (-1.7%) | 1.137 → 1.237 (+8.8%) |
| counter | increment | 1.003 → 0.996 (-0.7%) | 0.950 → 0.934 (-1.7%) | 1.110 → 0.891 (-19.7%) | 1.108 → 1.133 (+2.3%) |
| counter | unmount | 0.872 → 0.842 (-3.4%) | 0.840 → 0.938 (+11.7%) | 0.852 → 0.843 (-1.1%) | 1.022 → 0.974 (-4.7%) |
| form | mount | 1.400 → 1.762 (+25.9%) | 1.496 → 1.444 (-3.5%) | 1.593 → 1.516 (-4.8%) | 1.934 → 1.655 (-14.4%) |
| form | edit-one | 1.725 → 1.772 (+2.7%) | 1.736 → 1.746 (+0.6%) | 1.645 → 1.642 (-0.2%) | 1.978 → 1.827 (-7.6%) |
| form | edit-all | 1.910 → 1.919 (+0.5%) | 1.964 → 1.933 (-1.6%) | 1.881 → 1.856 (-1.3%) | 2.004 → 2.020 (+0.8%) |
| form | invalid | 1.714 → 1.750 (+2.1%) | 1.761 → 1.910 (+8.5%) | 1.733 → 1.739 (+0.3%) | 1.759 → 1.790 (+1.8%) |
| form | recover | 1.457 → 1.384 (-5.0%) | 1.550 → 1.515 (-2.3%) | 1.404 → 1.430 (+1.9%) | 1.642 → 1.555 (-5.3%) |
| form | unmount | 0.950 → 0.888 (-6.5%) | 0.900 → 0.931 (+3.4%) | 0.939 → 1.010 (+7.6%) | 0.998 → 1.020 (+2.2%) |
| composition | mount | 1.274 → 1.348 (+5.8%) | 1.547 → 1.387 (-10.3%) | 1.179 → 1.116 (-5.3%) | 1.275 → 1.250 (-2.0%) |
| composition | relay | 1.153 → 1.106 (-4.1%) | 0.968 → 1.045 (+8.0%) | 1.232 → 1.098 (-10.9%) | 1.046 → 1.215 (+16.2%) |
| composition | unmount | 0.957 → 0.939 (-1.9%) | 0.987 → 0.930 (-5.8%) | 0.924 → 0.929 (+0.5%) | 1.010 → 1.016 (+0.6%) |
| localized | mount | 2.590 → 2.215 (-14.5%) | 2.583 → 2.620 (+1.4%) | 2.606 → 2.046 (-21.5%) | 2.798 → 2.143 (-23.4%) |
| localized | local-update | 2.620 → 1.448 (-44.7%) | 1.178 → 1.440 (+22.2%) | 1.395 → 1.162 (-16.7%) | 1.462 → 1.484 (+1.5%) |
| localized | unmount | 1.240 → 1.197 (-3.5%) | 1.270 → 1.403 (+10.5%) | 1.106 → 1.163 (+5.2%) | 1.368 → 1.244 (-9.1%) |

## Compile-time initial

Evidence: `trial-d576f58430ba4f588c08923d199177b5`.

| Rows | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| 100 | create | 10.648 → 9.136 (-14.2%) | 8.291 → 9.381 (+13.1%) | 11.324 → 9.906 (-12.5%) | 8.914 → 9.019 (+1.2%) |
| 100 | update | 2.119 → 2.204 (+4.0%) | 2.060 → 1.939 (-5.9%) | 2.051 → 2.337 (+13.9%) | 2.047 → 1.972 (-3.7%) |
| 100 | select | 1.462 → 1.503 (+2.8%) | 1.379 → 1.401 (+1.6%) | 1.459 → 1.712 (+17.3%) | 1.440 → 1.412 (-1.9%) |
| 100 | append | 2.942 → 2.717 (-7.6%) | 2.776 → 2.651 (-4.5%) | 2.775 → 2.823 (+1.7%) | 2.438 → 2.623 (+7.6%) |
| 100 | swap | 2.080 → 2.287 (+10.0%) | 2.182 → 2.083 (-4.5%) | 2.150 → 2.161 (+0.5%) | 1.912 → 1.890 (-1.2%) |
| 100 | remove | 2.332 → 2.458 (+5.4%) | 2.214 → 2.316 (+4.6%) | 2.338 → 2.401 (+2.7%) | 2.266 → 2.111 (-6.8%) |
| 100 | clear | 2.454 → 2.376 (-3.2%) | 2.312 → 2.329 (+0.7%) | 2.582 → 2.590 (+0.3%) | 2.317 → 2.280 (-1.6%) |
| 1000 | create | 108.479 → 103.008 (-5.0%) | 101.323 → 106.815 (+5.4%) | 106.550 → 102.067 (-4.2%) | 106.744 → 99.872 (-6.4%) |
| 1000 | update | 8.904 → 9.315 (+4.6%) | 8.883 → 9.219 (+3.8%) | 9.032 → 9.100 (+0.8%) | 8.445 → 8.448 (+0.0%) |
| 1000 | select | 2.802 → 2.773 (-1.0%) | 2.794 → 2.556 (-8.5%) | 2.947 → 2.743 (-6.9%) | 2.861 → 3.090 (+8.0%) |
| 1000 | append | 11.638 → 12.542 (+7.8%) | 10.724 → 11.927 (+11.2%) | 12.255 → 11.579 (-5.5%) | 10.376 → 12.192 (+17.5%) |
| 1000 | swap | 4.318 → 4.656 (+7.8%) | 4.343 → 4.241 (-2.3%) | 3.980 → 4.527 (+13.7%) | 4.122 → 4.376 (+6.2%) |
| 1000 | remove | 9.361 → 8.976 (-4.1%) | 8.349 → 7.696 (-7.8%) | 8.317 → 7.948 (-4.4%) | 9.168 → 7.763 (-15.3%) |
| 1000 | clear | 12.581 → 13.747 (+9.3%) | 13.686 → 12.919 (-5.6%) | 13.498 → 14.430 (+6.9%) | 13.747 → 13.332 (-3.0%) |

| Workload | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| counter | mount | 1.142 → 1.081 (-5.3%) | 0.961 → 0.969 (+0.8%) | 1.013 → 0.971 (-4.1%) | 1.043 → 1.069 (+2.5%) |
| counter | increment | 0.874 → 1.038 (+18.8%) | 0.952 → 0.971 (+2.0%) | 1.100 → 0.994 (-9.6%) | 1.029 → 0.983 (-4.5%) |
| counter | unmount | 0.927 → 0.903 (-2.6%) | 0.869 → 0.845 (-2.8%) | 0.862 → 0.835 (-3.1%) | 0.912 → 0.915 (+0.3%) |
| form | mount | 1.424 → 1.391 (-2.3%) | 1.800 → 1.774 (-1.4%) | 1.520 → 1.423 (-6.4%) | 1.628 → 1.373 (-15.7%) |
| form | edit-one | 1.721 → 1.697 (-1.4%) | 1.829 → 1.824 (-0.3%) | 1.665 → 1.657 (-0.5%) | 1.902 → 1.670 (-12.2%) |
| form | edit-all | 1.906 → 1.899 (-0.4%) | 1.901 → 1.957 (+2.9%) | 1.809 → 1.821 (+0.7%) | 1.828 → 1.897 (+3.8%) |
| form | invalid | 1.757 → 1.726 (-1.8%) | 1.762 → 1.594 (-9.5%) | 1.890 → 1.739 (-8.0%) | 1.799 → 1.762 (-2.1%) |
| form | recover | 1.419 → 1.468 (+3.5%) | 1.390 → 1.467 (+5.5%) | 1.484 → 1.445 (-2.6%) | 1.430 → 1.395 (-2.4%) |
| form | unmount | 0.945 → 0.906 (-4.1%) | 0.936 → 0.932 (-0.4%) | 0.923 → 0.978 (+6.0%) | 0.964 → 0.985 (+2.2%) |
| composition | mount | 1.262 → 1.457 (+15.5%) | 1.204 → 1.162 (-3.5%) | 1.216 → 1.245 (+2.4%) | 1.645 → 1.473 (-10.5%) |
| composition | relay | 1.198 → 1.208 (+0.8%) | 1.128 → 1.104 (-2.1%) | 1.215 → 1.085 (-10.7%) | 1.027 → 1.245 (+21.2%) |
| composition | unmount | 0.936 → 0.975 (+4.2%) | 0.940 → 0.890 (-5.3%) | 0.972 → 0.964 (-0.8%) | 0.947 → 0.953 (+0.6%) |
| localized | mount | 2.075 → 2.264 (+9.1%) | 2.433 → 2.363 (-2.9%) | 2.242 → 2.097 (-6.5%) | 2.314 → 2.147 (-7.2%) |
| localized | local-update | 1.303 → 1.212 (-7.0%) | 1.295 → 2.719 (+110.0%) | 1.305 → 1.143 (-12.4%) | 1.343 → 2.413 (+79.7%) |
| localized | unmount | 1.286 → 1.196 (-7.0%) | 1.228 → 1.171 (-4.6%) | 1.170 → 1.063 (-9.1%) | 1.112 → 1.232 (+10.8%) |

## Compile-time confirmation

Evidence: `confirmation-55fef7e43f3a4ee6b13a8493901d783c`.

| Rows | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| 100 | create | 9.057 → 8.956 (-1.1%) | 8.547 → 10.124 (+18.5%) | 8.347 → 9.300 (+11.4%) | 9.991 → 9.223 (-7.7%) |
| 100 | update | 2.285 → 2.119 (-7.3%) | 1.969 → 2.010 (+2.1%) | 2.118 → 2.089 (-1.4%) | 2.326 → 2.339 (+0.6%) |
| 100 | select | 1.502 → 1.463 (-2.6%) | 1.533 → 1.500 (-2.2%) | 1.472 → 1.460 (-0.8%) | 1.600 → 1.454 (-9.1%) |
| 100 | append | 2.507 → 2.736 (+9.1%) | 2.506 → 2.924 (+16.7%) | 2.460 → 2.498 (+1.5%) | 3.114 → 3.259 (+4.7%) |
| 100 | swap | 2.012 → 1.911 (-5.0%) | 1.867 → 1.899 (+1.7%) | 1.939 → 1.977 (+2.0%) | 1.973 → 2.604 (+32.0%) |
| 100 | remove | 2.373 → 2.228 (-6.1%) | 2.180 → 2.267 (+4.0%) | 2.224 → 2.186 (-1.7%) | 2.792 → 2.493 (-10.7%) |
| 100 | clear | 2.393 → 2.460 (+2.8%) | 2.351 → 2.437 (+3.7%) | 2.232 → 2.349 (+5.2%) | 2.398 → 2.642 (+10.2%) |
| 1000 | create | 103.380 → 102.169 (-1.2%) | 100.598 → 103.297 (+2.7%) | 104.386 → 105.470 (+1.0%) | 106.760 → 104.058 (-2.5%) |
| 1000 | update | 8.736 → 9.042 (+3.5%) | 8.482 → 9.386 (+10.7%) | 8.888 → 9.242 (+4.0%) | 8.821 → 8.600 (-2.5%) |
| 1000 | select | 2.890 → 2.769 (-4.2%) | 3.345 → 3.050 (-8.8%) | 3.233 → 3.395 (+5.0%) | 3.255 → 2.839 (-12.8%) |
| 1000 | append | 10.481 → 11.197 (+6.8%) | 12.967 → 12.382 (-4.5%) | 12.693 → 14.185 (+11.8%) | 11.848 → 12.577 (+6.2%) |
| 1000 | swap | 4.347 → 4.082 (-6.1%) | 4.985 → 4.262 (-14.5%) | 4.138 → 4.229 (+2.2%) | 5.279 → 4.772 (-9.6%) |
| 1000 | remove | 7.498 → 7.601 (+1.4%) | 8.616 → 8.000 (-7.1%) | 8.678 → 9.392 (+8.2%) | 8.705 → 8.641 (-0.7%) |
| 1000 | clear | 12.007 → 13.698 (+14.1%) | 13.652 → 14.433 (+5.7%) | 12.137 → 13.201 (+8.8%) | 14.232 → 12.324 (-13.4%) |

| Workload | Action | A/A AB | A/A BA | Candidate AB | Candidate BA |
| --- | --- | --- | --- | --- | --- |
| counter | mount | 1.116 → 1.144 (+2.5%) | 1.301 → 1.106 (-15.0%) | 1.137 → 1.362 (+19.8%) | 1.000 → 1.128 (+12.8%) |
| counter | increment | 1.043 → 0.899 (-13.8%) | 0.994 → 1.024 (+3.0%) | 1.011 → 0.963 (-4.7%) | 1.057 → 1.046 (-1.0%) |
| counter | unmount | 0.994 → 0.927 (-6.7%) | 1.009 → 0.901 (-10.7%) | 1.024 → 0.991 (-3.2%) | 0.865 → 1.041 (+20.3%) |
| form | mount | 1.491 → 1.573 (+5.5%) | 1.895 → 1.481 (-21.8%) | 1.486 → 1.706 (+14.8%) | 1.904 → 1.627 (-14.5%) |
| form | edit-one | 1.777 → 1.634 (-8.0%) | 1.751 → 1.776 (+1.4%) | 1.760 → 1.753 (-0.4%) | 1.675 → 1.778 (+6.1%) |
| form | edit-all | 1.873 → 1.845 (-1.5%) | 1.938 → 1.888 (-2.6%) | 1.796 → 1.826 (+1.7%) | 1.879 → 1.963 (+4.5%) |
| form | invalid | 1.701 → 1.698 (-0.2%) | 1.787 → 1.791 (+0.2%) | 1.815 → 1.798 (-0.9%) | 1.872 → 1.744 (-6.8%) |
| form | recover | 1.499 → 1.415 (-5.6%) | 1.503 → 1.489 (-0.9%) | 1.477 → 1.567 (+6.1%) | 1.398 → 1.404 (+0.4%) |
| form | unmount | 1.032 → 0.970 (-6.0%) | 0.955 → 0.919 (-3.8%) | 1.007 → 0.929 (-7.7%) | 0.960 → 0.949 (-1.1%) |
| composition | mount | 1.341 → 1.411 (+5.2%) | 1.352 → 1.225 (-9.4%) | 1.246 → 1.225 (-1.7%) | 1.417 → 1.590 (+12.2%) |
| composition | relay | 1.428 → 1.303 (-8.8%) | 1.074 → 1.349 (+25.6%) | 1.188 → 0.996 (-16.2%) | 0.964 → 0.997 (+3.4%) |
| composition | unmount | 1.012 → 1.072 (+5.9%) | 0.892 → 0.894 (+0.2%) | 0.920 → 0.922 (+0.2%) | 0.905 → 0.966 (+6.7%) |
| localized | mount | 2.080 → 2.139 (+2.8%) | 2.242 → 2.299 (+2.5%) | 2.426 → 2.149 (-11.4%) | 2.025 → 2.113 (+4.3%) |
| localized | local-update | 1.252 → 1.133 (-9.5%) | 1.068 → 1.266 (+18.5%) | 1.254 → 1.178 (-6.1%) | 1.296 → 1.298 (+0.2%) |
| localized | unmount | 1.222 → 1.295 (+6.0%) | 1.105 → 1.190 (+7.7%) | 1.077 → 1.147 (+6.5%) | 1.366 → 1.075 (-21.3%) |

## Outcome and scope

The compile-time confirmation gives 1,000-row creation +1.0%/-2.5%, rather than
reproducing the initial improvement in both orders. At 100 rows, creation is
+11.4%/-7.7%. The 1,000-row confirmation has append +11.8%/+6.2%, swap +2.2%/-9.6%
and clear +8.8%/-13.4%. A/A and broader workloads also vary. These descriptive
medians do not assign every change causally to the candidate, but they do not
support adoption for a reliable global performance gain. Removing adapter calls
is not itself proof of faster execution or exact allocation savings.

All three matrix cohorts retain their lifecycle observations: 8 cycles per
variant/workload, 64 per cohort, 192 total observations kept separately. Nodes and
listeners return to each recorded unmounted baseline. This is not allocated-byte
measurement or proof of absence of every leak. Startup, full compiler throughput,
independent human DX, extra-module delivery and other browsers remain unaccepted
scope. A fresh React/Svelte ranking was not run for these rejected candidates.

## Resource and source audit

The complete retained evidence has 119 serial supervised phases: 115 pass and
4 fail (two fixture-grammar phases and two candidate regression phases). All
verify CPU 10%, commit 768 MiB, 24 processes, host free >=4 GiB, browser 45/12 seconds
or Node 60/60 seconds, kill-on-owner-close and zero remaining owned processes.
No unrelated process was stopped. The strict list-reader revisions replace a
runtime-only equal-compiler assumption with exact declared source hashes per
label/group; all other schema, version, sample, visibility, clock, AX, asset and
cleanup controls remain unchanged. Source snapshots, fixtures, old test revisions,
failed runs, counter probes, raw samples and exact report revision are retained.

v2 candidate compiler: `07d32417bb4e587b6255f3c0e81c5710a5749520f1bef6a098c5020193fc5f2d`

v2 candidate runtime: `1bc1d96eea3289f7647b1978ed07e794108ab9b30d3aa1a4c0aa4a59b5507de9`

v4 candidate compiler: `03c3b90cb301bd4104cca8a05b6c1ef28bc6d06b84445adfd782fb83d002b4c9`

v4 candidate runtime: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`

Unchanged public compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

Unchanged public runtime: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`

Internal root: `internal-readers-study`. Exact revision and audit:
`reviewed-report.md`, `verification.json`.
