# Compiled native owned views: validated private prototype

The compiler emits explicit native DOM construction from validated sequential IR for owned views without local state, derived values, actions, structures or child components. These views use a reduced frame with the existing scheduler, dynamic collector, parent-slot tickets, external reactions, event namespace, staged cancellation and reverse cleanup contracts. Other views retain the region interpreter. Surface and TypeScript interfaces are unchanged. Public compiler/runtime sources are unchanged.

This applies the compiler-oriented direction studied in the local Svelte element/template transforms with an Elnor implementation. It preserves construction/read ordering rather than cloning future DOM ahead of opaque property readers. Public root mounts and all binding metadata are not specialized by this prototype.

## Validation

The complete backend coverage passes 462 tests. Two further cancellation/partial-registration tests pass in an eight-test focused run, for 464 unique controls. Compatibility passes 71 tests. Five browser fixtures pass eight cycles in each backend: 80 cycles including a stateless keyed emitting child. The real keyed benchmark build also proves selection of the emitted constructor. Garbage-collection controls release three native nodes with callbacks/disposer retained, plus seven nodes in the existing component-root controls.

Two early syntax failures were corrected and retained. Two complete-suite attempts were interrupted by the unchanged 4 GiB host-free guard. Validation resumed from immutable inputs once memory stabilized, preserving the 222 already passing tests. Every owned process tree was cleaned. No coverage or resource cap was reduced.

## Full candidate/control matrix

Renderer main-thread CPU milliseconds, balanced AB/BA medians; lower is less CPU. These are not elapsed interaction latency or FPS. This cohort has 35 serial contained Jobs, 1,624 samples and 58 cross-backend correctness checks. AA variation and both orders remain in the underlying JSON.

| Workload | Action | Compiled/reduced | Previous | Change |
| --- | --- | ---: | ---: | ---: |
| counter  | mount | 1.472 | 1.493 | -1.4% |
| counter  | increment | 1.311 | 1.320 | -0.7% |
| counter  | unmount | 1.222 | 1.216 | +0.4% |
| form  | mount | 1.858 | 1.763 | +5.4% |
| form  | edit-one | 1.507 | 1.585 | -4.9% |
| form  | edit-all | 1.672 | 1.718 | -2.6% |
| form  | invalid | 1.509 | 1.553 | -2.8% |
| form  | recover | 1.581 | 1.517 | +4.3% |
| form  | unmount | 1.227 | 1.179 | +4.0% |
| composition  | mount | 1.465 | 1.538 | -4.7% |
| composition  | relay | 1.115 | 1.165 | -4.3% |
| composition  | unmount | 1.034 | 1.018 | +1.6% |
| localized  | mount | 2.169 | 2.010 | +8.0% |
| localized  | local-update | 1.324 | 1.404 | -5.7% |
| localized  | unmount | 1.037 | 1.065 | -2.6% |
| keyed 100 | create | 4.202 | 4.343 | -3.2% |
| keyed 100 | update | 1.634 | 1.645 | -0.6% |
| keyed 100 | select | 1.319 | 1.319 | -0.0% |
| keyed 100 | append | 1.759 | 2.299 | -23.5% |
| keyed 100 | swap | 1.733 | 1.690 | +2.6% |
| keyed 100 | remove | 1.809 | 1.823 | -0.7% |
| keyed 100 | clear | 1.544 | 1.872 | -17.5% |
| keyed 1000 | create | 31.738 | 26.922 | +17.9% |
| keyed 1000 | update | 4.483 | 4.463 | +0.5% |
| keyed 1000 | select | 2.539 | 2.422 | +4.8% |
| keyed 1000 | append | 6.041 | 5.607 | +7.7% |
| keyed 1000 | swap | 3.545 | 3.333 | +6.4% |
| keyed 1000 | remove | 4.528 | 4.361 | +3.8% |
| keyed 1000 | clear | 5.456 | 6.275 | -13.1% |

Counter, form, composition and localized bundles are byte-identical to the control; their timing differences do not result from changed application code. The keyed bundle grows from 10,092 to 10,861 gzip-9 bytes (+769, about 7.6%). Composition still uses the general backend because of slots.

## Bounded mechanism ablation

One additional source variant retains the same emitted constructor and routes it through the generic frame. Original interpreted control, compiled/reduced frame and compiled/generic frame use unchanged keyed application sources. The ablation passes both sizes and preserves values, normalized DOM, identity and disposal. Its 17 successful serial Jobs contain 1,372 samples and 42 preflight checks. Two failed harness launches are retained: the new direct-comparison group initially failed an enum check; the first external resume omitted a local module dependency. The successful resumed worker only extends the allowed group enum; its measured code is unchanged.

| Candidate | Counterpart | Action (1,000) | Candidate CPU | Other CPU | Change |
| --- | --- | --- | ---: | ---: | ---: |
| elnor | control | create | 26.638 | 31.652 | -15.8% |
| elnor | control | append | 6.081 | 7.437 | -18.2% |
| elnor | control | clear | 5.891 | 6.790 | -13.2% |
| hybrid | control | create | 34.756 | 34.935 | -0.5% |
| hybrid | control | append | 7.098 | 6.687 | +6.1% |
| hybrid | control | clear | 7.284 | 6.999 | +4.1% |
| elnor | aa | create | 29.397 | 32.123 | -8.5% |
| elnor | aa | append | 6.461 | 5.674 | +13.9% |
| elnor | aa | clear | 5.946 | 5.998 | -0.9% |
| hybrid | aa | create | 32.702 | 31.964 | +2.3% |
| hybrid | aa | append | 7.908 | 7.385 | +7.1% |
| hybrid | aa | clear | 7.226 | 7.181 | +0.6% |
| elnor | hybrid | create | 32.360 | 31.431 | +3.0% |
| elnor | hybrid | append | 5.944 | 6.569 | -9.5% |
| elnor | hybrid | clear | 6.109 | 7.125 | -14.3% |

Here `elnor` means compiled construction with the reduced frame, `hybrid` means the same constructor with the generic frame, `control` means the preceding interpreted backend, and `aa` compares identical bundles.

## Interpretation and next step

Clear at 1,000 rows improves in both cohorts: 6.275 to 5.456 ms (-13.1%) in the full matrix and 6.790 to 5.891 ms (-13.2%) in the ablation. The direct reduced/generic-frame pair also favors reduced-frame cleanup. This is a useful recurring signal, not a universal speedup.

Creation reverses direction: 26.922 to 31.738 ms (+17.9%) in the full matrix, then 31.652 to 26.638 ms (-15.8%) in the ablation. Direct reduced/generic construction is 32.360 versus 31.431 ms (+3.0%), with appreciable AA and order variation. These results do not establish a reliable construction gain or isolate its cause. Do not select only the favorable cohort.

The prototype remains private and is not adopted as a global performance improvement. The bounded ablation is complete. Next, inspect construction CPU/allocation phases before further source changes or another external ranking. No fresh React/Svelte timings were run, and old external numbers cannot establish current parity. The prepared peer runner is a future tool, not evidence of an executed comparison.

All Jobs retain CPU 10%, aggregate commit 768 MiB, maximum 24 processes, Node heap 192 MiB, host-free floor 4 GiB and kill-on-owner-close. Offline wall/idle limits remain 60/60 seconds; browser limits remain 45/12 seconds. CSP and browser sandbox remain enabled.
