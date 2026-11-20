# Queue work census of the retained core

**No new scheduling state or core change justified.** This source-operation
census covers 33 stages across counter, form, composition, localized updates and
100/1,000-row lists using the current frozen compiler/runtime. It is not CPU,
allocation, latency or a new React/Svelte comparison.

Four duplicate enqueue attempts occur only in form edit-all: 4 of 14 subscriber
visits. Other 32 stages have zero. The predeclared condition for prototyping extra
queue state was at least 25% duplicates in actions from two real workload families;
only one qualifies. No flags/epochs or extra membership guard are added.

Creation of 1,000 rows executes 2,003 effects but visits only three subscribers
for enqueueing. Those initial effect executions are direct construction work,
not 2,003 scheduled queue entries. Queue deduplication therefore has little
demonstrated coverage of that creation case. This does not measure the CPU share
or assert that queue operations are free in other applications.

| Workload | Size | Stage | Subscriber visits | Duplicate enqueues | Captured invalidations consumed | Flushes | Effect runs |
|---|---:|---|---:|---:|---:|---:|---:|
| counter | — | mount | 0 | 0 | 0 | 0 | 1 |
| counter | — | increment | 1 | 0 | 0 | 1 | 1 |
| counter | — | unmount | 0 | 0 | 0 | 0 | 0 |
| form | — | mount | 0 | 0 | 0 | 0 | 11 |
| form | — | edit-one | 4 | 0 | 0 | 2 | 4 |
| form | — | edit-all | 14 | 4 | 0 | 2 | 10 |
| form | — | invalid | 6 | 0 | 0 | 2 | 6 |
| form | — | recover | 6 | 0 | 0 | 2 | 6 |
| form | — | unmount | 0 | 0 | 0 | 0 | 0 |
| composition | — | mount | 0 | 0 | 0 | 0 | 3 |
| composition | — | relay | 2 | 0 | 0 | 1 | 2 |
| composition | — | unmount | 0 | 0 | 0 | 0 | 0 |
| localized | — | mount | 0 | 0 | 0 | 0 | 48 |
| localized | — | local-update | 1 | 0 | 0 | 1 | 1 |
| localized | — | unmount | 0 | 0 | 0 | 0 | 0 |
| list | 100 | mount | 0 | 0 | 0 | 0 | 3 |
| list | 100 | create | 3 | 0 | 0 | 1 | 203 |
| list | 100 | update | 23 | 0 | 0 | 2 | 23 |
| list | 100 | select | 3 | 0 | 0 | 1 | 3 |
| list | 100 | append | 3 | 0 | 0 | 1 | 23 |
| list | 100 | swap | 3 | 0 | 0 | 1 | 3 |
| list | 100 | remove | 3 | 0 | 0 | 1 | 3 |
| list | 100 | clear | 3 | 0 | 0 | 1 | 3 |
| list | 100 | unmount | 0 | 0 | 0 | 0 | 0 |
| list | 1000 | mount | 0 | 0 | 0 | 0 | 3 |
| list | 1000 | create | 3 | 0 | 0 | 1 | 2003 |
| list | 1000 | update | 203 | 0 | 0 | 2 | 203 |
| list | 1000 | select | 3 | 0 | 0 | 1 | 3 |
| list | 1000 | append | 3 | 0 | 0 | 1 | 203 |
| list | 1000 | swap | 3 | 0 | 0 | 1 | 3 |
| list | 1000 | remove | 3 | 0 | 0 | 1 | 3 |
| list | 1000 | clear | 3 | 0 | 0 | 1 | 3 |
| list | 1000 | unmount | 0 | 0 | 0 | 0 | 0 |

The instrumented diagnostic copy preserves original queue and Set operations,
adding counters and read-only membership checks. It is never used for timing.
All workload values, row identities and cleanup oracles pass. Three positive
controls detect fan-in duplicate enqueueing, consumption of an invalidation for
an effect already captured in a batch, and a self-write requiring a follow-up
microtask. Three uninstrumented controls verify resubscription order B/A,
obsolete-edge writes without self-invalidation, and disposing a captured effect.

The read-only Svelte reference remains commit
0156c5fe38b53b72675e2a7f04535de015fdeed1, reactivity/sources.js mark_reactions.
It checks DIRTY flags before scheduling reactions, with its own dependency and
derived semantics. That motivates measuring repeat visits, not transplanting its
flags or assuming equivalent scheduling contracts. No Svelte source was changed.

Two serial offline Node Jobs pass with CPU 10%, commit 768 MiB, 24 processes,
host-free minimum 4 GiB, wall/idle 60/60 seconds and kill-on-owner-close. Both leave
zero owned processes. Public compiler 70abd192 and runtime ae44708c remain unchanged;
the historical 610-test/check/build gate is not rerun for a diagnostic-only study.

Private evidence: `queue-work-study/run-56a15fe4116d4183925b1072bbd5c68e`. This identifier locates retained internal evidence, not a public artifact link.
