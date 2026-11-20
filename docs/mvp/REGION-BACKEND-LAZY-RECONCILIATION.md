# Deferred keyed reconciliation: experimental candidate

Sequential lists now defer a new key map, order array and placement/index passes
while the supplied keys match the registered sequence. Every collection,
iterator and key expression still executes, and retained items still receive
their normal updates. Array identity alone does not skip work. This preserves
opaque getters, Proxies, same-array replacements and dynamically tracked reads.

At the first difference the runtime materializes the matched prefix and resumes
the existing reconciliation algorithm. A shorter prefix also materializes and
removes its tail. Duplicate suffix keys still fail at their original observation
point. Internal row records retain their registered key for comparison and
release it on disposal; comparison uses Map's SameValueZero behavior, including
NaN and signed zero. Blueprint ranges and nonempty staged sets retain their
previous route. No Surface, parser, compiler or public core change is required.

The local Svelte keyed implementation was inspected as a contrast for matching
and reusing the current branch. Elnor's design uses its own maps, row records,
collector and teardown order. It does not adopt identity-only collection
skipping for values whose behavior is opaque.

Validation passes 454 backend tests and 71 unchanged compatibility tests. Five
new differential controls compare with the general renderer: NaN/signed zero,
duplicate suffix after a stable prefix, tail truncation and reappend, a throwing
key after a stable prefix, and same-array replacement preserving child inputs
while reading every key. Existing controls retain initialization/cleanup error
order, queued rounds, foreign owners, input identity, fragment siblings,
reentrant disposal and retired callbacks.

Four checked Edge fixtures pass 64 lifecycle cycles under CSP and sandbox. The
existing retention checks collect seven removed nodes while keeping parent
trees, four callbacks and two disposers alive. This is scoped retention
evidence, not a total heap or cached-object-key memory measurement.

The primary controlled matrix retains all six original workloads, 29 actions,
two warmups, seven measured rounds, both initial orders and AA controls. Each
cell below is candidate / preceding forwarding-row candidate, in balanced
renderer CPU milliseconds from one cohort. Results are descriptive and mixed.

| Action | Candidate / control | CPU change |
| --- | ---: | ---: |
| Create 100 | 4.763 / 5.142 | -7.4% |
| Update 100 | 1.803 / 1.635 | +10.3% |
| Select 100 | 1.401 / 1.442 | -2.9% |
| Create 1,000 | 32.155 / 30.117 | +6.8% |
| Update 1,000 | 4.767 / 5.331 | -10.6% |
| Select 1,000 | 2.573 / 2.760 | -6.8% |
| Append 1,000 | 6.449 / 5.898 | +9.4% |
| Swap 1,000 | 3.686 / 3.179 | +16.0% |
| Remove 1,000 | 4.798 / 4.883 | -1.8% |
| Clear 1,000 | 6.551 / 6.537 | +0.2% |

The four non-keyed candidate/control application bundles are byte identical;
their observed timing differences cannot be attributed to this source change.
The keyed gzip-9 entry increases from 9,903 to 10,095 bytes (+192), excluding
shared CSS and driver. There is no cold-start claim from those sizes.

A separate study reuses the identical application bundles with eight repeated
selections per CPU window. Reducer and button-query preparation occur outside
the window. Each interaction retains the original two animation frames. Later
clicks reselect the same row, so this is not the isolated matrix workload and
must not be pooled with it or presented as elapsed input latency.

At 1,000 rows, balanced block CPU per interaction is 0.803 ms versus 1.031 ms
(-22.1%). Both initial orders favor the candidate; AA changes are -3.9%/+7.8%.
At 100 rows it is 0.588 versus 0.578 ms (+1.8%). The 84 measured blocks contain
672 interactions. This supports the unchanged-order route in this repeated
workload; it does not establish universal parity, a new React/Svelte ranking,
or a global improvement. The normal matrix's append/swap regressions remain.

The candidate stays private pending investigation of fallback and creation
costs. No JIT, allocation or specific cached-key cause is established by these
timings alone. The earlier shared-setter experiment was rejected and is absent
from this runtime; its evidence remains in
[the local-write report](REGION-BACKEND-LOCAL-WRITES.md).

Two attempts were interrupted by host memory pressure below the existing
4 GiB floor: a partial combined suite and a partial compatibility suite. Both
left zero owned processes. After read-only memory checks showed headroom, the
complete suites were rerun successfully. No limits, hook trust, coverage or
other projects' processes were changed to obtain a pass.

All 58 recorded Jobs ran serially with verified original CPU 10%, aggregate
commit 768 MiB, maximum 24 processes, host-free floor 4 GiB, Node heap 192 MiB,
offline wall/idle 60/60 seconds and browser 45/12 seconds. The 56 completed Jobs
passed; the two resource interruptions are retained separately. Every Job left
zero remaining owned processes. Headless Edge, sandbox, CSP and GPU-disabled
isolation remain intact. The original matrix contains 1,624 measured samples;
the 84 selection blocks are retained as a separate metric.

Internal evidence:

- Matrix: `lazy-reconcile-study/run-aca8e91d2f64486fae71764aea67b545`.
- Blocks: `region-backend/lazy-selection-blocks-21e684069cfa43e0949c18c5a7c377a7`.
- Final suites: `region-backend/indexed-208075e4e4bb4c4e8304c7d32e192971` and
  `region-backend/regressions-a996ffe3ec6543aa81f625b154c155f3`.
