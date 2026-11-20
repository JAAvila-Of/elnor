# Current task-record backend compared with React and Svelte

Frozen Elnor private backend; React 19.3.1; Svelte 5.57.3; esbuild 0.28.2; Edge 157.0.4341.42.

All six original workloads pass the common state, normalized DOM, keyed identity and disposal controls. The cohort contains 47 serial contained Jobs, 2,436 measured samples and 87 cross-framework preflight checks. There are two warmup rounds and seven measured rounds per order; active isolated pages, alternating action order, initial AB/BA and Elnor AA controls are retained. This measures renderer main-thread CPU, not elapsed input-to-pixel latency or FPS.

The tables keep matched Elnor/Svelte and Elnor/React pairs separate. Each value is the median of the two per-order medians. Elnor values can differ between counterpart tables because they come from separate paired workers. The original pooled summary remains in summary.json for audit; it is not used to derive these paired comparisons.

## Matched pairs with Svelte

| Workload | Action | Elnor CPU ms | Other CPU ms | Elnor / other | AA change AB / BA |
| --- | --- | ---: | ---: | ---: | --- |
| counter  | mount | 1.105 | 1.208 | 0.92 | -11.4% / -10.9% |
| counter  | increment | 0.983 | 1.079 | 0.91 | +11.9% / +10.9% |
| counter  | unmount | 0.890 | 1.027 | 0.87 | -5.3% / +1.6% |
| form  | mount | 1.433 | 1.424 | 1.01 | -7.3% / +8.3% |
| form  | edit-one | 1.270 | 1.299 | 0.98 | -2.8% / +5.2% |
| form  | edit-all | 1.491 | 1.330 | 1.12 | +5.8% / -0.8% |
| form  | invalid | 1.232 | 1.208 | 1.02 | -3.9% / -6.0% |
| form  | recover | 1.319 | 1.266 | 1.04 | -1.8% / +9.0% |
| form  | unmount | 0.952 | 0.947 | 1.01 | +1.8% / +2.1% |
| composition  | mount | 1.351 | 1.404 | 0.96 | -1.6% / +3.0% |
| composition  | relay | 1.040 | 1.107 | 0.94 | +4.7% / +5.3% |
| composition  | unmount | 0.986 | 0.953 | 1.03 | -7.4% / -1.8% |
| localized  | mount | 1.852 | 1.908 | 0.97 | -3.9% / +4.2% |
| localized  | local-update | 1.159 | 1.222 | 0.95 | +0.5% / +2.4% |
| localized  | unmount | 0.985 | 0.945 | 1.04 | -4.1% / +5.8% |
| keyed 100 | create | 3.985 | 4.167 | 0.96 | +11.8% / +19.4% |
| keyed 100 | update | 1.618 | 1.510 | 1.07 | +8.4% / +14.0% |
| keyed 100 | select | 1.349 | 1.438 | 0.94 | +4.1% / +1.2% |
| keyed 100 | append | 2.049 | 1.832 | 1.12 | -7.9% / -1.4% |
| keyed 100 | swap | 1.841 | 1.684 | 1.09 | +20.3% / -12.9% |
| keyed 100 | remove | 1.793 | 1.941 | 0.92 | -4.5% / -3.6% |
| keyed 100 | clear | 1.717 | 1.573 | 1.09 | +9.0% / -5.2% |
| keyed 1000 | create | 27.158 | 24.491 | 1.11 | -4.1% / +12.4% |
| keyed 1000 | update | 4.342 | 4.295 | 1.01 | -4.6% / -10.2% |
| keyed 1000 | select | 2.221 | 2.633 | 0.84 | -2.8% / +14.2% |
| keyed 1000 | append | 6.206 | 6.153 | 1.01 | -10.0% / +20.0% |
| keyed 1000 | swap | 3.385 | 3.012 | 1.12 | -5.5% / +9.2% |
| keyed 1000 | remove | 4.027 | 4.124 | 0.98 | +2.9% / +9.8% |
| keyed 1000 | clear | 4.939 | 3.391 | 1.46 | -21.7% / +20.9% |

## Matched pairs with React

| Workload | Action | Elnor CPU ms | Other CPU ms | Elnor / other | AA change AB / BA |
| --- | --- | ---: | ---: | ---: | --- |
| counter  | mount | 1.070 | 1.380 | 0.78 | -11.4% / -10.9% |
| counter  | increment | 0.969 | 1.108 | 0.87 | +11.9% / +10.9% |
| counter  | unmount | 0.979 | 1.081 | 0.91 | -5.3% / +1.6% |
| form  | mount | 1.485 | 1.770 | 0.84 | -7.3% / +8.3% |
| form  | edit-one | 1.287 | 1.302 | 0.99 | -2.8% / +5.2% |
| form  | edit-all | 1.353 | 1.564 | 0.87 | +5.8% / -0.8% |
| form  | invalid | 1.196 | 1.547 | 0.77 | -3.9% / -6.0% |
| form  | recover | 1.270 | 1.514 | 0.84 | -1.8% / +9.0% |
| form  | unmount | 0.948 | 1.128 | 0.84 | +1.8% / +2.1% |
| composition  | mount | 1.301 | 1.630 | 0.80 | -1.6% / +3.0% |
| composition  | relay | 0.966 | 1.169 | 0.83 | +4.7% / +5.3% |
| composition  | unmount | 0.908 | 1.060 | 0.86 | -7.4% / -1.8% |
| localized  | mount | 2.094 | 2.320 | 0.90 | -3.9% / +4.2% |
| localized  | local-update | 1.190 | 1.373 | 0.87 | +0.5% / +2.4% |
| localized  | unmount | 1.028 | 1.113 | 0.92 | -4.1% / +5.8% |
| keyed 100 | create | 4.267 | 4.179 | 1.02 | +11.8% / +19.4% |
| keyed 100 | update | 1.627 | 1.993 | 0.82 | +8.4% / +14.0% |
| keyed 100 | select | 1.350 | 1.673 | 0.81 | +4.1% / +1.2% |
| keyed 100 | append | 1.818 | 1.958 | 0.93 | -7.9% / -1.4% |
| keyed 100 | swap | 1.862 | 4.038 | 0.46 | +20.3% / -12.9% |
| keyed 100 | remove | 1.771 | 2.251 | 0.79 | -4.5% / -3.6% |
| keyed 100 | clear | 1.770 | 1.859 | 0.95 | +9.0% / -5.2% |
| keyed 1000 | create | 27.871 | 27.274 | 1.02 | -4.1% / +12.4% |
| keyed 1000 | update | 4.578 | 4.970 | 0.92 | -4.6% / -10.2% |
| keyed 1000 | select | 2.664 | 3.245 | 0.82 | -2.8% / +14.2% |
| keyed 1000 | append | 5.681 | 5.954 | 0.95 | -10.0% / +20.0% |
| keyed 1000 | swap | 3.415 | 29.661 | 0.12 | -5.5% / +9.2% |
| keyed 1000 | remove | 3.849 | 5.159 | 0.75 | +2.9% / +9.8% |
| keyed 1000 | clear | 5.497 | 4.596 | 1.20 | -21.7% / +20.9% |

## Delivery, gzip-9 bytes

Application/framework entries exclude the common driver and stylesheet. Size is not startup timing.

| Workload | Elnor | React | Svelte |
| --- | ---: | ---: | ---: |
| counter | 3091 | 69264 | 17024 |
| form | 6396 | 69451 | 19282 |
| composition | 2338 | 69474 | 18159 |
| localized | 5115 | 69334 | 17375 |
| keyed | 11020 | 69744 | 19647 |

## Scope

The unified native subscriber/job identity remains in the private backend. The compiler uses regions for counter, form, localized panels and keyed lists; composition keeps the general renderer because of slots. Public compiler/runtime sources are unchanged. These results do not establish parity for arbitrary apps or complete the remaining compiler/runtime architecture work.

AA variation, differences between orders and fixed shared browser/driver work limit interpretation of small gaps. No statistical equivalence margin was established. The implementations are the original straightforward sources: React has no memoization and Svelte uses the raw immutable list model. These tests cover warm interactions rather than cold startup, sustained throughput or a heap-size comparison.

All Jobs retain CPU 10%, aggregate commit 768 MiB, 24 process maximum, Node heap 192 MiB, host-free floor 4 GiB, kill-on-owner-close and zero remaining owned processes. Offline limits are 60/60 seconds; browser wall/idle limits 45/12 seconds; CSP and browser sandbox remain enabled.
