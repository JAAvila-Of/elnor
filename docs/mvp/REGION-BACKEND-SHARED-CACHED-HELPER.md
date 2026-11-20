# Shared helper with cached keys: no useful gain established

This completes the missing contrast from the Map-lookup experiment. The private
candidate preserved cached row keys, every call and the entire materializer
body. The only source transformation moved the pure function declaration from
inside each frame mount to module scope. An exact textual invariant checks that
removing the declaration from both versions leaves identical source.

The candidate passed 454 backend tests, 71 unchanged compatibility tests,
64 checked Edge lifecycle cycles and the existing seven-node retention checks
with four callbacks and two disposers retained. Correctness alone did not
establish a performance benefit.

The full six-workload comparison retains the original 29 actions, two warmups,
seven measured rounds, both initial orders and AA controls. Representative
balanced renderer CPU medians in milliseconds:

| Action | Shared declaration | Previous nested declaration | Change |
| --- | ---: | ---: | ---: |
| Create 100 | 4.243 | 4.626 | -8.3% |
| Swap 100 | 1.838 | 1.608 | +14.2% |
| Create 1,000 | 31.243 | 31.132 | +0.4% |
| Update 1,000 | 4.987 | 4.702 | +6.1% |
| Select 1,000 | 2.543 | 2.545 | -0.1% |
| Append 1,000 | 7.003 | 7.069 | -0.9% |
| Swap 1,000 | 3.895 | 3.770 | +3.3% |
| Clear 1,000 | 6.457 | 6.894 | -6.3% |

The target creation/selection/append differences are small relative to the
retained AA variation. Clear's apparent saving has AA changes of +35.0%/+1.1%,
so it is not evidence of a useful improvement. Other operations are mixed.
The keyed gzip-9 entry grows from 10,092 to 10,102 bytes. Four non-keyed
application bundles are byte identical; their observed timing differences
cannot be attributed to this source change.

The helper-only candidate was rejected. The four active core hashes match the
preceding cached-key revision exactly, and all 24 focused list controls pass
after restoration. No Surface, parser, compiler or public-core source changes
remain from this experiment. The preceding private candidate still has its
documented creation/fallback tradeoffs; this study does not resolve them or
provide new React/Svelte timings.

All 46 Jobs ran serially with verified CPU 10%, aggregate commit 768 MiB,
maximum 24 processes, host-free floor 4 GiB, Node heap 192 MiB and the original
wall/idle limits. Every Job passed and left zero owned processes. Headless Edge,
sandbox, CSP and GPU-disabled isolation remained enabled. The matrix retains
1,624 measured samples and 58 correctness checks. There is no significance test,
formal parity margin, allocation-throughput or total-heap claim.

The helper-placement hypothesis is closed as insufficient. A larger subsequent
prototype should lower already-proven native, stateless child-view IR into a
specialized constructor with minimal owned-frame machinery, preserving exact
evaluation order, task tracking, stage callbacks, handlers and cleanup. The
current RowView has props, two captions and an emission but still uses the
generic operation interpreter. This is a proposed experiment, not implemented
support or an established cause of the remaining CPU gap.

Internal evidence:

- Matrix: `shared-cached-study/run-469adec11a3f40bfb4962591240529a2`.
- Restored controls: `region-backend/open-lists-a87432a30522473f9676e284e20a4771`.

The preceding [Map-lookup experiment](REGION-BACKEND-MAP-LOOKUP.md) changed two
dimensions; this experiment holds key storage and the helper body fixed. Both
remain retained as separate evidence rather than pooled performance estimates.
