# Frame-local task resources: experimental candidate

The private runtime now allocates task tickets only for the groups owned by
the mounted frame. Row iteration frames no longer instantiate tickets for the
parent application's tasks. Reaction/dependency arrays and subscriber lists
allocate their entries on demand. The existing ownership partition, evaluation
order, scheduler, callback contract and Surface syntax remain intact.

This is retained as an experimental candidate, not a globally faster revision.
Creation of 1,000 rows improves in two controlled cohorts, while swapping rows
regresses. Public Elnor core sources remain unchanged.

Before the change, 48 CPU profiles compared the sequential renderer, public
general renderer and Svelte across create/clear at 100 and 1,000 rows. The
profiles point to frame mounting and disposal as useful investigation targets.
They include waiting and profiler overhead and are not normal CPU benchmarks.
The local Svelte `each.js` was inspected as a contrast: item/index signal
creation depends on flags, while each item owns a branch. Elnor's change uses
its own existing group ownership rather than copying that implementation.

The primary candidate/control study uses all six original workloads and all
29 actions, with two warmups, seven measured rounds, both initial orders and AA
controls. It validates 35 serial bounded Jobs, 1,624 samples and 58 cross-backend
correctness checks. A separate confirmation reuses the identical frozen bundles
for both list sizes in both orders: four Jobs and 392 additional samples.

Each row below is candidate / previous sealed event backend in renderer CPU
milliseconds, balanced over AB/BA order medians. These are not elapsed latency
measurements. The confirmation is a separate cohort and should not be pooled.

| Operation | Primary candidate / previous | Confirmation candidate / previous |
| --- | ---: | ---: |
| Create 100 | 4.546 / 4.113 | 3.826 / 4.170 |
| Clear 100 | 1.502 / 1.598 | 1.514 / 1.518 |
| Create 1,000 | 23.944 / 26.895 | 22.592 / 26.956 |
| Update 1,000 | 4.112 / 4.280 | 4.007 / 4.377 |
| Select 1,000 | 2.318 / 2.434 | 2.289 / 2.451 |
| Append 1,000 | 5.263 / 5.385 | 5.916 / 5.974 |
| Swap 1,000 | 3.123 / 2.951 | 3.373 / 2.992 |
| Remove 1,000 | 3.719 / 3.819 | 3.824 / 3.684 |
| Clear 1,000 | 6.323 / 6.265 | 5.889 / 6.426 |

Creation of 1,000 rows consumes 11.0% and 16.2% less CPU in these comparisons.
Swap consumes 5.8% and 12.7% more. Other differences are mixed or comparable to
the retained AA variation; some AA changes reach roughly 20%. There is no
significance test, established parity margin, universal speedup or new
React/Svelte timing in this study. Creation at 100 rows and cleanup do not
establish a repeatable improvement. Swap requires investigation before promoting
the candidate as a global performance improvement.

The full suite passed 448 backend tests in three serial batches and 71 unchanged
public compatibility tests. Browser comparisons check normalized DOM, values,
keyed/component identity and disposal. Every Job retains the original CPU 10%,
768 MiB commit, 24-process maximum, 4 GiB host-free floor, Node 192 MiB heap,
sandbox and CSP. A confirmation launcher initially omitted NODE_PATH and failed
before opening the browser; it was corrected to use the original environment,
without installing dependencies or changing resource limits. That failed Job is
retained separately with zero owned processes remaining.

Internal evidence:

- Profiles: `region-backend/event-profile-c0bdf55ed41541cab037d238a3253455`.
- Primary: `frame-task-study/run-62c9dd6a8f3d4dc4b569341d9d8d82a6`.
- Confirmation: `region-backend/frame-task-confirm-33de821f24184d8ba8013b6950d11414`.
- Both unprofiled cohorts retain their full per-order results in `comparison.json`.

The earlier [React/Svelte comparison](REGION-BACKEND-EVENT-COMPARISON.md)
remains a separate revision. Its absolute times cannot be combined with these
candidate/control pairs to claim current parity with either framework.
