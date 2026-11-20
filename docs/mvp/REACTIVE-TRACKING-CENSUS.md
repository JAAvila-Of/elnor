# Reactive tracking work census

**No core change retained from this diagnostic.** Svelte's handling of repeated
reads and stable dependencies suggested two questions for Elnor: how often does a
reaction read the same cell twice, and how often does it remove an edge only to
register that same edge again? This study counts operations before proposing a
hot-path change. It measures neither CPU time nor allocated/retained bytes.

## Findings

Across the 33 stages below, repeated tracked reads appear only in three form
actions: one each in edit-all, invalid and recover. The other stages have zero.
Adding a dependency lookup to every tracked read therefore has little demonstrated
coverage in these workloads. No candidate lookup guard was timed; this is not
evidence of a measured slowdown, nor does it exclude duplicate-heavy applications.

Stable-edge reconstruction is present. A 1,000-row update records 203 first reads,
all on dependencies held by that effect before the run, and 203 run-time deletion
attempts. The localized update records one reused edge and one deletion. These
counts identify work but cannot identify its share of CPU or available savings.
The large list creation has 2,000 new edges and three reused ones; a reuse strategy
would not eliminate construction/tracking of those new row effects.

## Complete counts

Every actual tracked read executes the existing two Set.add calls. First reads
mean absent from that effect's current dependency Set; repeat reads mean already
present. Reused edges are first reads found in a snapshot of the dependencies held
at run entry. New edges are the other first reads. Run deletes and disposal deletes
are counted separately and must not be combined with reads as CPU units.

| Workload | Size | Stage | Effect runs | Reads | Repeats | Reused edges | New edges | Run deletes | Disposal deletes |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| counter | — | mount | 1 | 1 | 0 | 0 | 1 | 0 | 0 |
| counter | — | increment | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| counter | — | unmount | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| form | — | mount | 11 | 16 | 0 | 0 | 16 | 0 | 0 |
| form | — | edit-one | 4 | 10 | 0 | 9 | 1 | 9 | 0 |
| form | — | edit-all | 10 | 17 | 1 | 16 | 0 | 16 | 0 |
| form | — | invalid | 6 | 13 | 1 | 12 | 0 | 12 | 0 |
| form | — | recover | 6 | 13 | 1 | 12 | 0 | 12 | 0 |
| form | — | unmount | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| composition | — | mount | 3 | 2 | 0 | 0 | 2 | 0 | 0 |
| composition | — | relay | 2 | 2 | 0 | 2 | 0 | 2 | 0 |
| composition | — | unmount | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| localized | — | mount | 48 | 24 | 0 | 0 | 24 | 0 | 0 |
| localized | — | local-update | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| localized | — | unmount | 0 | 0 | 0 | 0 | 0 | 0 | 24 |
| list | 100 | mount | 3 | 3 | 0 | 0 | 3 | 0 | 0 |
| list | 100 | create | 203 | 203 | 0 | 3 | 200 | 3 | 0 |
| list | 100 | update | 23 | 23 | 0 | 23 | 0 | 23 | 0 |
| list | 100 | select | 3 | 3 | 0 | 3 | 0 | 3 | 0 |
| list | 100 | append | 23 | 23 | 0 | 3 | 20 | 3 | 0 |
| list | 100 | swap | 3 | 3 | 0 | 3 | 0 | 3 | 0 |
| list | 100 | remove | 3 | 3 | 0 | 3 | 0 | 3 | 2 |
| list | 100 | clear | 3 | 3 | 0 | 3 | 0 | 3 | 200 |
| list | 100 | unmount | 0 | 0 | 0 | 0 | 0 | 0 | 203 |
| list | 1000 | mount | 3 | 3 | 0 | 0 | 3 | 0 | 0 |
| list | 1000 | create | 2003 | 2003 | 0 | 3 | 2000 | 3 | 0 |
| list | 1000 | update | 203 | 203 | 0 | 203 | 0 | 203 | 0 |
| list | 1000 | select | 3 | 3 | 0 | 3 | 0 | 3 | 0 |
| list | 1000 | append | 203 | 203 | 0 | 3 | 200 | 3 | 0 |
| list | 1000 | swap | 3 | 3 | 0 | 3 | 0 | 3 | 0 |
| list | 1000 | remove | 3 | 3 | 0 | 3 | 0 | 3 | 2 |
| list | 1000 | clear | 3 | 3 | 0 | 3 | 0 | 3 | 2000 |
| list | 1000 | unmount | 0 | 0 | 0 | 0 | 0 | 0 | 2003 |

## Semantic boundaries for reuse

Three additional controls execute the uninstrumented retained Elnor runtime with
an explicitly drained microtask queue:

1. A reads x/y, then B reads x. Updating y reruns A and reinserts its subscriptions.
   The next x update runs **B, A**. Leaving A's old edge in x would not reproduce
   that subscription insertion order without additional handling.
2. An effect stops reading x and instead writes x during its rerun. The old edge
   has already been removed: there is one queued task and two total executions,
   with no self-invalidation. Keeping that obsolete edge through the callback
   requires an explicit notification policy.
3. A disposes B while both have been captured for an x update. Only A executes.
   Any tracking redesign must preserve cancellation of captured subscribers.

These controls describe current observable behavior, not a comprehensive proof
against every possible reuse design. No failing reuse candidate was presented as
a tested implementation. Stable-edge reuse needs a separate design that preserves
order, writes during execution, nested collectors, cleanup and error recovery.

## Svelte contrast

Read-only reference: Svelte 5.57.3, clean checkout commit
`0156c5fe38b53b72675e2a7f04535de015fdeed1`. In
`packages/svelte/src/internal/client/runtime.js`, get uses a read version to avoid
tracking a signal repeatedly within a reaction update. It also recognizes a
matching dependency prefix; update_dependencies retains that prefix and handles
the changed suffix. Its reaction arrays, effect tree and scheduling differ from
Elnor's current Set iteration and captured-batch ordering.

The principle is useful; moving the mechanism directly would not prove equivalent
behavior. The existing rejected single-edge representation and shared-run variants
were not repeated. No Svelte branch, source or dependencies were changed and its
branch-switching benchmark command was not run.

## Method, evidence and limits

Fresh normal matrix and list builds freeze the retained runtime/compiler. All six
raw checked graphs match their runtime manifests. Private copies add counters
around tracking, effect execution and edge deletion, including a WeakMap of
pre-run dependency snapshots. The extra Sets, lookups and counters perturb both
execution and retention: **these copies must never supply performance rankings**.
FakeDOM checks text/state, row identity/order, selection, form validity/conditional
recovery and empty unmounts. List actions start from a fresh created list; form
actions run sequentially through the recorded states. Preparation is excluded
from each recorded count. This is not an identical execution schedule to every
production timing case, and FakeDOM is not a native browser cost model.

Positive controls verify duplicate reads, reuse on a rerun and a changed dependency.
Instrumentation refuses unrecognized source markers. Public source remains
unchanged; the previous **586-test plus check/build** gate still applies to the
identical source hashes and was not rerun for this diagnostic-only study.

Four expensive phases run serially under CPU10%, commit768MiB, 24 processes,
minimum host free4GiB, wall60s/idle60s and kill-on-owner-close. No limits are relaxed.
`tracking-work-study/verification.json` audits phase nonoverlap, copied workers,
graph/runtime identities, arithmetic, positive controls and the Svelte reference.
Producers: `freeze.py`, `run-counts.py`, `count-worker.mjs`, `run-controls.py`,
`order-controls.mjs` and `review.py`, under
`elnor/.elnor/mvp/framework-comparison/tracking-work-study`.

The decision is to retain the current core and require targeted CPU evidence plus
preserved semantics before adding duplicate guards or stable-edge machinery. This
study supplies no new React/Svelte timing comparison or general parity claim.
