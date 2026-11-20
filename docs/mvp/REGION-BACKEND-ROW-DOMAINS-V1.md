# Closed row domain retirement: stored-owner variant

This private experiment retires native task authority once for a closing forwarding-row owner. It preserves event removal and falls back to individual cancellation when jobs are pending, general-cell dependencies exist, or regional dependencies point outside that owner. Surface and compiler syntax are unchanged. This variant stores an owner reference and a native-frame marker on every native frame.

## Validation

The evaluation capsule contains 18 serial bounded Jobs: 473 backend tests plus an additional construction-cancellation test, 71 compatibility tests, 112 browser cycles, fake-DOM collection controls, and a real Edge collection probe. In the real probe three removed nodes collect with the parent mounted, two callbacks and a disposer retained; both native listeners are removed and old callbacks remain inert.

The full fixed matrix passes 59 further Jobs, 2,744 samples and 98 two-framework correctness checks. Six family averages fit the 10% Svelte margin in that cohort, but nine complex phases do not. In particular clear1000 is 4.893 vs 3.900 ms (+25.4%), form96 mount is 5.831 vs 4.802 ms (+21.4%), and lifecycle toggle is 5.001 vs 4.435 ms (+12.8%). The parity goal remains unachieved.

## Direct attribution

Two contemporary ten-Job comparisons reuse verified old and candidate bundles, covering all seven list operations at 100 and 1,000 rows with AA controls and AB/BA orders. They are independent cohorts; timings are not pooled.

| Cohort | Clear1000 candidate/control | Create1000 candidate/control | Select1000 candidate/control |
| --- | ---: | ---: | ---: |
| 1 | 0.825 | 1.091 | 1.087 |
| 2 | 0.880 | 1.049 | 1.242 |

The second cohort shows select1000 ratios 1.247 and 1.236 in both orders, while its AA ratios are 0.932 and 1.059. This variant is rejected despite lower aggregate clear CPU in both cohorts. The cause of the select change is not established. The next variant passes the closing owner at the private disposal boundary instead of storing fields on live native frames.

All 97 successful diagnostic/build/browser Jobs preserve CPU10%,768MiB aggregate commit,Node192MiB,24process cap,4GiB host-free floor and original timeouts/CSP/sandbox. The public runtime/compiler remain unchanged.
