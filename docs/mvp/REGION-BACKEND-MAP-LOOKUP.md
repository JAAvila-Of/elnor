# Key lookup and shared materialization: rejected variant

The experiment tested whether the deferred reconciler could drop each row's
cached key and share its pure prefix-materialization helper across mounts. The
selected variant passed correctness and retention checks but regressed CPU in
the full matrix. It was rejected. The working runtime is restored to the
preceding cached-key candidate by exact core source hashes; public core sources
and Surface are unchanged.

The ablation used four frozen implementations of the original keyed app:
the preceding forwarding backend as control, the cached-key candidate, a
candidate looking up the current row through the existing Map, and the same
lookup with the pure materializer moved to module scope. The lookup retains
all collection/key evaluation and delegates SameValueZero identity to Map.
It removes the extra row key field and its cleanup assignment. Sharing the
helper avoids defining that pure helper inside each frame mount.

Svelte's local each implementation was inspected as a contrast for retrieving
an item from its key map. Using the same ordinary data-structure mechanism does
not imply the same performance: Elnor keeps its own evaluation, tracking and
ownership contracts. No Svelte source implementation was copied.

The ablation retained 21 serial Jobs, 1,764 measured samples, 56 cross-version
correctness checks, both initial orders and AA controls at 1,000 rows. It did
not identify a universal winner. The shared-helper variant was selected for
broader validation because it simplified state, not because the ablation proved
a global speedup. The design did not include a cached-key/shared-helper cell,
so it cannot isolate every interaction between key storage and helper placement.

The selected candidate passed 454 backend tests, 71 unchanged public
compatibility tests, 64 checked Edge lifecycle cycles and the existing seven-node
retention checks while holding four callbacks and two disposers. Those checks
include NaN/signed zero, duplicate suffix keys, throwing keys, tail truncation,
same-array replacements, preserved child inputs and disposal/error ordering.

The subsequent full six-workload study compares the shared-helper/lookup
candidate with the preceding cached-key candidate. It retains all 29 actions,
two warmups, seven measured rounds, both initial orders and AA controls.
Representative balanced renderer CPU medians, milliseconds:

| Action | Lookup/shared candidate | Cached-key control | Change |
| --- | ---: | ---: | ---: |
| Create 100 | 5.236 | 4.755 | +10.1% |
| Update 100 | 1.529 | 1.640 | -6.8% |
| Select 100 | 1.534 | 1.564 | -1.9% |
| Create 1,000 | 33.776 | 30.954 | +9.1% |
| Update 1,000 | 4.863 | 4.465 | +8.9% |
| Select 1,000 | 3.125 | 2.373 | +31.7% |
| Append 1,000 | 6.909 | 6.751 | +2.3% |
| Swap 1,000 | 3.674 | 3.430 | +7.1% |
| Remove 1,000 | 4.608 | 4.583 | +0.5% |
| Clear 1,000 | 6.757 | 7.314 | -7.6% |

Selection and creation regressions outweigh the small delivery saving: the
keyed gzip-9 entry decreases from 10,093 to 10,067 bytes (-26). The other four
application bundles are byte identical between versions. Their observed timing
differences cannot be causally attributed to this source change. No startup,
universal significance, heap reduction or current React/Svelte ranking is claimed.

All 67 recorded Jobs passed their configured limits and process cleanup checks:
CPU 10%, aggregate commit 768 MiB, 24-process maximum, host-free floor 4 GiB,
Node heap 192 MiB, offline wall/idle 60/60 seconds and browser 45/12 seconds.
They ran serially and each left zero owned processes. Sandbox, CSP, headless
Edge and GPU-disabled isolation remained enabled. The 1,764 ablation samples
and 1,624 full-matrix samples remain separate; they are not pooled into one
performance estimate.

After rejection, all four active core hashes match the preceding reviewed
candidate exactly. Its 24 focused open-list controls pass again. The experiment
does not claim to fix the earlier cached candidate's creation/fallback costs.
In particular it does not establish a JIT cause or prove that key caching alone
accounts for the differences. The missing cached-key/shared-helper combination
remains a possible isolated follow-up.

Internal evidence:

- Ablation: `region-backend/reconcile-ablation-8e7dae33a5e644d491e78c1e5060d9da`.
- Full matrix: `map-lookup-study/run-52cfadff361540699c93d16a8774f85f`.
- Restored checks: `region-backend/open-lists-6ac24497af704303ab79b05860e9f693`.

The prior [deferred-reconciliation report](REGION-BACKEND-LAZY-RECONCILIATION.md)
continues to describe the active private candidate and its unresolved tradeoffs.
