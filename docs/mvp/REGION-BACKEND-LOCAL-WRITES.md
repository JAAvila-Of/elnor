# Local-write dispatch experiment: rejected

A bounded census found that selecting a row invokes 100/1,000 item setters in
the 100/1,000-row cases, with every item unchanged. The complete frame and the
lightweight forwarding context have identical counts. Update replaces 10% of
items; append and swap also visit unchanged retained items. This identifies
avoidable generic dispatch, not the cause of a specific CPU regression.

The experiment extracted a shared local-slot writer and used it directly from
reconciliation. It retained Object.is, notifications, general-effect bridges,
disposal guards and all collection/key/iterator evaluation. The compiler and
Surface were unchanged. The helper was rejected after measurement, and the
preceding forwarding-row runtime was restored by exact source hashes.

Validation passed 449 backend tests, 71 compatibility tests, 64 Edge lifecycle
cycles and the existing seven-node retention controls with four callbacks and
two disposers retained. No tests or limits were relaxed.

The unchanged six-workload matrix retained 1,624 measured samples and AA
controls. Representative balanced renderer CPU medians, milliseconds:

| Action | Helper candidate | Preceding forwarding candidate |
| --- | ---: | ---: |
| Form edit all | 1.194 | 1.318 |
| Form invalid | 1.181 | 1.046 |
| Create 100 | 4.880 | 4.528 |
| Swap 100 | 1.780 | 1.552 |
| Create 1,000 | 30.782 | 33.202 |
| Select 1,000 | 2.611 | 2.644 |
| Append 1,000 | 5.649 | 5.447 |
| Clear 1,000 | 5.462 | 6.020 |

Selection's 1.3% difference is smaller than its AA changes (-16.8%/+28.6%).
Other actions are mixed. Gzip-9 changes by +13 bytes for form and -48 bytes for
keyed; the remaining three entry sizes are unchanged. No global gain follows.

A separate diagnostic study used eight repeated selections per CPU window,
seven measured windows per label/order and the identical application bundles.
Reducer/query preparation occurs before the window. Each interaction still uses
the original run function and two animation frames. All eight clicks choose the
same row: later clicks reselect it, unlike the isolated-action matrix's first
selection from an unselected model. Results must not be pooled or substituted
for the original matrix, input latency, or a React/Svelte comparison.

The 84 measured blocks contain 672 interactions. Balanced CPU per interaction
is 0.583/0.585 ms at 100 rows and 0.896/0.912 ms at 1,000 rows (candidate/control).
The 1,000-row difference is 1.8%; AA changes are +3.9%/-2.7%. This does not
establish a material dispatch improvement or solve the earlier regression.

All 55 Jobs ran serially under the original CPU 10%, aggregate commit 768 MiB,
24-process cap, 4 GiB host-free floor, Node heap 192 MiB and wall/idle limits.
All verified their limits and left zero owned processes. Headless Edge,
sandbox, CSP and GPU-disabled isolation remain intact. Diagnostic counters exist
only in isolated copies, not the working runtime or timing matrix.

Internal evidence:

- Census: `region-backend/row-write-census-f963fa47035a450baf8098e85a9fa36d`.
- Matrix: `local-write-study/run-cc7cf9a7aa7f4d468d4d541f18083096`.
- Blocks: `region-backend/selection-blocks-21d910a8eb414df191fd0fd67c1644cd`.

The local Svelte each implementation was inspected for derived collection and
incremental branch handling. Elnor cannot infer that opaque collections or keys
are pure merely from identity. The next structural experiment should retain
those observations while deferring new maps, order arrays and placement passes
until an actual key/order difference requires them.
